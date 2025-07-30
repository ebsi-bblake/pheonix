import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { startDelcomButtonWatcher } from "./delcom.js";

// Emulate __dirname in ES modules:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const broadcast = (event, data = {}) => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  });
};

startDelcomButtonWatcher(broadcast);

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_BASE_URL = "https://general-runtime.empyrean.voiceflow.com";

app.use(cors());
app.use(express.json());

async function voiceflowInteract(userID, payload) {
  console.log(
    "▶️ Voiceflow Request URL:",
    `${VOICEFLOW_BASE_URL}/state/user/${userID}/interact`,
  );
  console.log(
    "▶️ Voiceflow Request Payload:",
    JSON.stringify(payload, null, 2),
  );
  console.log("▶️ Voiceflow Request Headers:", {
    Authorization: VOICEFLOW_API_KEY,
    "Content-Type": "application/json",
    versionID: "development",
  });

  const res = await fetch(
    `${VOICEFLOW_BASE_URL}/state/user/${userID}/interact`,
    {
      method: "POST",
      headers: {
        Authorization: VOICEFLOW_API_KEY,
        "Content-Type": "application/json",
        versionID: "development",
      },
      body: JSON.stringify(payload),
    },
  );

  const resText = await res.text();

  console.log(`⬇️ Voiceflow Response Status: ${res.status} ${res.statusText}`);
  console.log(`⬇️ Voiceflow Response Body: ${resText}`);

  if (!res.ok) {
    throw new Error(
      `Voiceflow API error: ${res.status} ${res.statusText} ${resText}`,
    );
  }

  try {
    return JSON.parse(resText);
  } catch (parseErr) {
    console.error("❌ Failed to parse Voiceflow JSON response", parseErr);
    throw parseErr;
  }
}

//health checks
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// WebSocket logic
wss.on("connection", async (ws) => {
  console.log("🔌 Client connected");

  const userID = "ebsi_pheonix"; // or generate per client/session

  // Send launch event on connect
  try {
    const launchPayload = {
      action: {
        type: "launch",
      },
      config: {
        tts: false,
        stripSSML: true,
        stopAll: false,
        excludeTypes: ["block", "debug", "flow"],
      },
    };
    const traces = await voiceflowInteract(userID, launchPayload);
    console.log("Launch traces:", traces);
    const audio = traces.find((t) => t.payload?.audio?.src);
    const messageTrace = traces.find((t) => t.type === "text");

    ws.send(
      JSON.stringify({
        event: "launch",
        data: {
          audioUrl: audio?.payload?.audio?.src || null,
          text: messageTrace?.payload?.message || null,
        },
      }),
    );
  } catch (err) {
    console.error("❌ Error sending launch event:", err);
    ws.send(
      JSON.stringify({
        event: "error",
        data: `Launch event failed: ${err.message}`,
      }),
    );
  }

  ws.on("message", async (message) => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch (jsonErr) {
        console.error("❌ Invalid JSON received:", message, jsonErr);
        ws.send(
          JSON.stringify({
            event: "error",
            data: "Invalid JSON format",
          }),
        );
        return;
      }

      const { event, data } = parsed;

      if (!event) {
        ws.send(
          JSON.stringify({
            event: "error",
            data: "Missing event type",
          }),
        );
        return;
      }

      if (event === "command") {
        const { userID, text } = data || {};
        if (!userID || !text) {
          ws.send(
            JSON.stringify({
              event: "error",
              data: "Missing userID or text in command data",
            }),
          );
          return;
        }

        console.log(`📨 Command from ${userID}:`, text);

        try {
          const payload = {
            action: { type: "text", payload: text },
            config: {
              tts: true,
              stripSSML: true,
              stopAll: false,
              excludeTypes: ["block", "debug", "flow"],
            },
          };
          const traces = await voiceflowInteract(userID, payload);

          console.log("Voiceflow response traces:", traces);

          const audio = traces.find((t) => t.payload?.audio?.src);
          const messageTrace = traces.find((t) => t.type === "text");

          ws.send(
            JSON.stringify({
              event: "response",
              data: {
                audioUrl: audio?.payload?.audio?.src || null,
                text: messageTrace?.payload?.message || null,
              },
            }),
          );
        } catch (err) {
          console.error("❌ Voiceflow command error:", err);
          ws.send(
            JSON.stringify({
              event: "error",
              data: `Voiceflow command failed: ${err.message}`,
            }),
          );
        }
      } else if (event === "cancel") {
        console.log("🛑 Cancel received");
        // Implement cancel logic here if needed
      } else {
        ws.send(
          JSON.stringify({
            event: "error",
            data: `Unknown event type: ${event}`,
          }),
        );
      }
    } catch (err) {
      console.error("❌ Unexpected error handling message:", err);
      try {
        ws.send(
          JSON.stringify({
            event: "error",
            data: "Backend failed to process command due to internal error",
          }),
        );
      } catch {
        // Ignore send errors here
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
