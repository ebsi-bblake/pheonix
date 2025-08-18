// backend/server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { startDelcomButtonWatcher } from "./delcom.js";
import { EventSourceParserStream } from "eventsource-parser/stream";

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

// ── Audio accumulation per-WS ────────────────────────────────────────────────
/**
 * Map<WebSocket, { chunks: string[], encoding: string|null }>
 */
const audioAccumulators = new Map();

function resetAccumulator(ws) {
  audioAccumulators.delete(ws);
}

function handleTraceWithBatching(ws, cid, id, trace) {
  // If Voiceflow gives a direct URL, forward as-is and clear any previous acc.
  if (trace?.payload?.audio?.src) {
    resetAccumulator(ws);
    safeSend(ws, { event: "trace", id, data: trace }, `cid=${cid}`);
    return;
  }

  // Audio chunking path (payload: {state:'start'|'content'|'end', ...})
  if (trace?.type === "audio" && trace?.payload) {
    const { state, encoding, content } = trace.payload;

    if (state === "start") {
      audioAccumulators.set(ws, { chunks: [], encoding: null });
      log.debug("Audio streaming started");
      return; // don't forward start to FE
    }

    if (state === "content") {
      const acc = audioAccumulators.get(ws);
      if (acc && encoding === "audio/mp3" && content) {
        try {
          // Decode base64 chunk to binary buffer
          const binaryChunk = Buffer.from(content, "base64");
          acc.chunks.push(binaryChunk);
          if (!acc.encoding) acc.encoding = encoding;
          log.debug(
            `Added audio chunk: ${binaryChunk.length} bytes (total chunks: ${acc.chunks.length})`,
          );
        } catch (err) {
          log.error("Failed to decode audio chunk:", err);
        }
      }
      return; // swallow individual content chunks
    }

    if (state === "end") {
      const acc = audioAccumulators.get(ws);
      if (acc && acc.chunks.length) {
        try {
          // Concatenate all binary chunks
          const totalLength = acc.chunks.reduce(
            (sum, chunk) => sum + chunk.length,
            0,
          );
          const fullAudioBuffer = Buffer.concat(acc.chunks, totalLength);

          // Convert back to base64 for transmission
          const fullBase64 = fullAudioBuffer.toString("base64");

          log.debug(
            `Audio streaming complete: ${acc.chunks.length} chunks, ${totalLength} total bytes`,
          );

          const consolidated = {
            type: "audio",
            payload: {
              encoding: acc.encoding || "audio/mp3",
              content: fullBase64,
            },
          };
          safeSend(
            ws,
            { event: "trace", id, data: consolidated },
            `cid=${cid}`,
          );
        } catch (err) {
          log.error("Failed to consolidate audio chunks:", err);
        }
      }
      resetAccumulator(ws);
      return; // don't forward raw end
    }
  }

  // Non-audio or unknown audio shapes → pass through
  safeSend(ws, { event: "trace", id, data: trace }, `cid=${cid}`);
}

// ── Streaming helper (SSE) ───────────────────────────────────────────────────
async function voiceflowStreamInteract(userID, payload, { signal, onEvent }) {
  const url = `${VOICEFLOW_BASE_URL}/v2/project/${VOICEFLOW_PROJECT_ID}/user/${userID}/interact/stream?audio_events=true&completion_events=true`;

  log.info("VF ▶ stream POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: VOICEFLOW_API_KEY,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal, // this only cancels the initial request before body is read
  });

  log.info("VF ◀ status", res.status, res.statusText);
  log.debug("VF ◀ content-type", res.headers.get("content-type"));

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`VF stream error: ${res.status} ${res.statusText} ${txt}`);
  }

  // If someone already aborted before we attach, just cancel the body and bail.
  if (signal?.aborted) {
    try {
      await res.body.cancel?.();
    } catch {}
    return;
  }

  // Bytes -> Text -> SSE events
  const sseStream = res.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream());

  let reader;
  let readerAttached = false;

  const abort = () => {
    // Idempotent, safe abort; only cancel reader if it’s actually attached.
    try {
      if (readerAttached && reader) {
        // swallow any errors from cancel when stream is already closed/detached
        const p = reader.cancel();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } catch {}
    try {
      res.body?.cancel?.();
    } catch {}
  };

  // Wire abort AFTER we’ve created the pipeline, but guard both paths.
  if (signal) {
    if (signal.aborted) {
      abort();
      return;
    }
    // remove listener on cleanup
    var abortHandler = abort;
    signal.addEventListener("abort", abortHandler, { once: true });
  }

  reader = sseStream.getReader();
  readerAttached = true;

  let sseCount = 0;
  try {
    while (true) {
      const { value: evt, done } = await reader.read();
      if (done) break;
      if (!evt) continue;

      let data = evt.data;
      try {
        data = data ? JSON.parse(data) : null;
      } catch {}

      sseCount++;
      onEvent?.({ event: evt.event || "message", id: evt.id, data });
    }
  } finally {
    // Clean up
    try {
      reader.releaseLock?.();
    } catch {}
    readerAttached = false;
    if (signal && abortHandler) {
      try {
        signal.removeEventListener("abort", abortHandler);
      } catch {}
    }
    log.debug(`VF ◀ stream ended (SSE events: ${sseCount})`);
  }
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
    resetAccumulator(ws);
  });

  ws.on("error", (e) => log.warn(`WS error [cid=${cid}]`, e));

  // FE explicitly controls when VF should start via {event:"launch"}
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

    if (event === "launch") {
      // abort any existing
      controllers.get(ws)?.abort();
      const controller = new AbortController();
      controllers.set(ws, controller);
      resetAccumulator(ws);

      log.info(`🎙 starting VF launch stream [cid=${cid}]`);
      voiceflowStreamInteract(
        userID,
        { action: { type: "launch" } },
        {
          signal: controller.signal,
          onEvent: ({ event: ev, id, data }) => {
            if (ev === "trace") {
              // Batch audio, pass-through others
              handleTraceWithBatching(ws, cid, id, data);
            } else if (ev === "end") {
              // VF emits end when the turn is complete
              safeSend(ws, { event: "responseDone" }, `cid=${cid}`);
            } else {
              safeSend(ws, { event: ev, id, data }, `cid=${cid}`);
            }
          },
        },
      ).catch((err) => {
        if (!controller.signal.aborted) {
          log.error("launch stream error", err);
          safeSend(
            ws,
            { event: "error", data: String(err.message || err) },
            `cid=${cid}`,
          );
        }
      });
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

      // barge-in
      controllers.get(ws)?.abort();
      const controller = new AbortController();
      controllers.set(ws, controller);
      resetAccumulator(ws);

      try {
        await voiceflowStreamInteract(
          uid,
          { action: { type: "text", payload: text } },
          {
            signal: controller.signal,
            onEvent: ({ event: ev, id, data }) => {
              if (ev === "trace") {
                handleTraceWithBatching(ws, cid, id, data);
              } else if (ev === "end") {
                safeSend(ws, { event: "responseDone" }, `cid=${cid}`);
              } else {
                safeSend(ws, { event: ev, id, data }, `cid=${cid}`);
              }
            },
          },
        );
      } catch (err) {
        if (controller.signal.aborted) return;
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
      resetAccumulator(ws);
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
