import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_BASE_URL = "https://general-runtime.voiceflow.com";

app.use(cors());
app.use(express.json());

//health checks
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// WebSocket logic
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  ws.on("message", async (message) => {
    try {
      const { event, data } = JSON.parse(message);

      if (event === "command") {
        const { userID, text } = data;
        console.log(`📨 Command from ${userID}:`, text);

        const payload = {
          action: { type: "text", payload: text },
          config: {
            tts: true,
            stripSSML: true,
            stopAll: false,
            excludeTypes: ["block", "debug", "flow"],
          },
        };

        const res = await fetch(
          `${VOICEFLOW_BASE_URL}/state/user/${userID}/interact`,
          {
            method: "POST",
            headers: {
              Authorization: VOICEFLOW_API_KEY,
              "Content-Type": "application/json",
              versionID: "production",
            },
            body: JSON.stringify(payload),
          },
        );

        const traces = await res.json();
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
      }

      if (event === "cancel") {
        console.log("🛑 Cancel received");
        // Implement cancel logic if needed
      }
    } catch (err) {
      console.error("❌ Error handling message:", err);
      ws.send(
        JSON.stringify({
          event: "error",
          data: "Backend failed to process command",
        }),
      );
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
