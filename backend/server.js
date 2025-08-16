// backend/server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { startDelcomButtonWatcher } from "./delcom.js";
import { createParser } from "eventsource-parser";

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Env ──────────────────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_PROJECT_ID = process.env.VOICEFLOW_PROJECT_ID;
const VOICEFLOW_BASE_URL = "https://general-runtime.empyrean.voiceflow.com";

if (!VOICEFLOW_API_KEY) {
  console.error("❌ Missing VOICEFLOW_API_KEY in .env");
  process.exit(1);
}
if (!VOICEFLOW_PROJECT_ID) {
  console.error("❌ Missing VOICEFLOW_PROJECT_ID in .env");
  process.exit(1);
}

// ── App / WS ─────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// ── Logging helpers ──────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || "debug").toLowerCase();
const levels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const can = (lvl) => levels[lvl] <= levels[LOG_LEVEL];
const ts = () => new Date().toISOString().replace("T", " ").replace("Z", "");
const log = {
  error: (...a) => can("error") && console.error(`[${ts()}] ❌`, ...a),
  warn: (...a) => can("warn") && console.warn(`[${ts()}] ⚠️`, ...a),
  info: (...a) => can("info") && console.info(`[${ts()}] ℹ️`, ...a),
  debug: (...a) => can("debug") && console.debug(`[${ts()}] 🐛`, ...a),
  trace: (...a) => can("trace") && console.debug(`[${ts()}] 🔎`, ...a),
};
const safeSend = (ws, obj, tag = "") => {
  try {
    const json = JSON.stringify(obj);
    const preview =
      json.length > 300 ? json.slice(0, 300) + `… [${json.length}b]` : json;
    log.debug(`WS → client ${tag ? "(" + tag + ")" : ""}:`, preview);
    ws.send(json);
  } catch (e) {
    log.error("WS send failed:", e);
  }
};

// ── Delcom/keyboard broadcast → FE ───────────────────────────────────────────
const broadcast = (event, data = {}) => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      safeSend(client, { event, data }, "broadcast");
    }
  });
};
startDelcomButtonWatcher(broadcast);

// ── Streaming helper (SSE) ───────────────────────────────────────────────────
async function voiceflowStreamInteract(userID, payload, { signal, onEvent }) {
  // Project-scoped streaming endpoint (as requested)
  const url = `${VOICEFLOW_BASE_URL}/v2/project/${VOICEFLOW_PROJECT_ID}/user/${userID}/interact/stream?audio_events=true&audio_encoding=audio%2Fpcm&completion_events=true`;

  VOICEFLOW_API_KEY;
  log.info("VF ▶ stream POST", url);
  log.debug("VF ▶ headers", {
    Authorization: `${VOICEFLOW_API_KEY}`,
    Accept: "text/event-stream",
  });
  log.debug("VF ▶ payload", payload);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: VOICEFLOW_API_KEY, // Voiceflow expects raw token value here
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });

  log.info("VF ◀ status", res.status, res.statusText);
  log.debug("VF ◀ content-type", res.headers.get("content-type"));

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`VF stream error: ${res.status} ${res.statusText} ${txt}`);
  }

  let sseCount = 0;
  const parser = createParser({
    onEvent(evt) {
      if (evt.type !== "event") return;
      let data = evt.data;
      try {
        data = data ? JSON.parse(data) : null;
      } catch (e) {
        log.error("WTF", e);
        // keep raw string if JSON parse fails
      }
      onEvent?.({ event: evt.event || "message", id: evt.id, data });
    },
  });

  const feed = (chunk) => {
    if (!chunk) return;
    const bytes = Buffer.isBuffer(chunk)
      ? chunk.length
      : Buffer.byteLength(String(chunk));
    log.trace(`VF ◀ chunk ${bytes} bytes`);
    parser.feed(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  };

  if (typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      feed(value);
    }
    log.debug(`VF ◀ stream ended (SSE events: ${sseCount})`);
    return;
  }

  if (typeof res.body[Symbol.asyncIterator] === "function") {
    for await (const chunk of res.body) feed(chunk);
    log.debug(`VF ◀ stream ended (SSE events: ${sseCount})`);
    return;
  }

  await new Promise((resolve, reject) => {
    res.body.on("data", feed);
    res.body.on("end", () => {
      log.debug(`VF ◀ stream ended (SSE events: ${sseCount})`);
      resolve();
    });
    res.body.on("error", (e) => {
      log.error("VF ◀ stream error", e);
      reject(e);
    });
    if (signal) {
      const abort = () => {
        log.warn("VF ◀ stream aborted by controller");
        try {
          res.body.destroy?.();
        } catch {}
        resolve();
      };
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
  });
}

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

// Track one in-flight stream per client for barge-in
const controllers = new Map(); // Map<WebSocket, AbortController>

// ── WebSocket logic ──────────────────────────────────────────────────────────
wss.on("connection", async (ws) => {
  const cid = Math.random().toString(36).slice(2, 8);
  log.info(`🔌 WS client connected [cid=${cid}]`);
  const userID = "ebsi_pheonix";

  ws.on("close", () => {
    log.info(`🔌 WS client closed [cid=${cid}]`);
    controllers.get(ws)?.abort();
    controllers.delete(ws);
  });

  ws.on("error", (e) => log.warn(`WS error [cid=${cid}]`, e));

  // Stream a launch immediately (no parsing here; FE decides what to render)
  const launchCtrl = new AbortController();
  controllers.set(ws, launchCtrl);
  log.debug(`launch controller set [cid=${cid}]`);

  voiceflowStreamInteract(
    userID,
    { action: { type: "launch" } },
    {
      signal: launchCtrl.signal,
      onEvent: ({ event: ev, id, data }) => {
        if (ev === "trace") {
          safeSend(ws, { event: "trace", id, data }, `cid=${cid}`);
        } else if (ev === "end") {
          safeSend(ws, { event: "responseDone" }, `cid=${cid}`);
        } else {
          safeSend(ws, { event: ev, id, data }, `cid=${cid}`);
        }
      },
    },
  ).catch((err) => {
    if (!launchCtrl.signal.aborted) {
      log.error("launch stream error", err);
      safeSend(
        ws,
        { event: "error", data: String(err.message || err) },
        `cid=${cid}`,
      );
    }
  });

  ws.on("message", async (raw) => {
    log.debug(`WS ← client [cid=${cid}]`, raw?.toString?.().slice(0, 300));
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      safeSend(
        ws,
        { event: "error", data: "Invalid JSON format" },
        `cid=${cid}`,
      );
      return;
    }

    const { event, data } = parsed || {};
    if (!event) {
      safeSend(
        ws,
        { event: "error", data: "Missing event type" },
        `cid=${cid}`,
      );
      return;
    }

    if (event === "commandStream") {
      const { userID: uid, text } = data || {};
      if (!uid || !text) {
        safeSend(
          ws,
          { event: "error", data: "Missing userID or text" },
          `cid=${cid}`,
        );
        return;
      }

      // barge-in: abort previous stream for this client
      log.info(`barge-in: aborting previous controller [cid=${cid}]`);
      controllers.get(ws)?.abort();
      const controller = new AbortController();
      controllers.set(ws, controller);
      log.debug(`new controller set [cid=${cid}]`);

      try {
        await voiceflowStreamInteract(
          uid,
          { action: { type: "text", payload: text } },
          {
            signal: controller.signal,
            onEvent: ({ event: ev, id, data }) => {
              if (ev === "trace") {
                safeSend(ws, { event: "trace", id, data }, `cid=${cid}`);
              } else if (ev === "end") {
                safeSend(ws, { event: "responseDone" }, `cid=${cid}`);
              } else {
                safeSend(ws, { event: ev, id, data }, `cid=${cid}`);
              }
            },
          },
        );
      } catch (err) {
        if (controller.signal.aborted) return; // expected on barge-in
        log.error("stream error", err);
        safeSend(
          ws,
          { event: "error", data: String(err.message || err) },
          `cid=${cid}`,
        );
      } finally {
        if (controllers.get(ws) === controller) controllers.delete(ws);
      }
      return;
    }

    if (event === "cancel") {
      log.info(`cancel requested [cid=${cid}]`);
      controllers.get(ws)?.abort();
      return;
    }

    safeSend(
      ws,
      { event: "error", data: `Unknown event type: ${event}` },
      `cid=${cid}`,
    );
  });
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.info(`🚀 Backend running at http://localhost:${PORT}`);
});
