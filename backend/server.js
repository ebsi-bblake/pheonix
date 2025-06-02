import express from "express";
import http from "http";
import { Server } from "socket.io";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const VOICEFLOW_API_KEY = process.env.VOICEFLOW_API_KEY;
const VOICEFLOW_BASE_URL = "https://general-runtime.voiceflow.com";

app.use(cors());
app.use(express.json());

io.on("connection", (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on("command", async ({ userID, text }) => {
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
      console.log(Object.keys(traces[0].payload.audio));
      const audio = traces.find((t) => t.payload?.audio?.src);
      const message = traces.find((t) => t.type === "text");
      socket.emit("response", {
        audioUrl: audio?.payload?.audio?.src || null,
        text: message?.payload?.message || null,
      });
    } catch (err) {
      console.error("❌ Error handling command:", err);
      socket.emit("error", "Backend failed to process command");
    }
  });

  socket.on("cancel", () => {
    console.log(`🛑 Cancel from ${socket.id}`);
    // Optional: track sessions or cancel audio
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
