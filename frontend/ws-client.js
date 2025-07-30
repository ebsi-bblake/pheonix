import { chatState } from "./state.js";
import { handleButtonPress, handleButtonRelease } from "./ui.js";

let socket;

export const initSocket = (onResponse, onError) => {
  console.log("window.location.host", window.location.host);

  socket = new WebSocket("ws://localhost:3001/");

  socket.onopen = () => console.log("✅ WebSocket connected");
  socket.onclose = () => console.warn("❌ WebSocket disconnected");
  socket.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
    onError?.(err);
  };

  socket.onmessage = (e) => {
    const { event, data } = JSON.parse(e.data);

    if (event === "response") {
      const { audioUrl, text } = data;
      console.log("🎧 Got response:", { audioUrl, text });

      if (text) {
        const el = document.createElement("div");
        el.textContent = text;
        document.getElementById("transcript")?.appendChild(el);
      }

      onResponse?.(data, chatState.get().playbackResolve?.());
    }

    if (event === "error") {
      console.error("⚠️ Backend error:", data);
      onError?.(data);
    }

    if (event === "buttonDown") {
      console.log("⬇️ USB button down");
      handleButtonPress();
    }

    if (event === "buttonUp") {
      console.log("⬆️ USB button up");
      handleButtonRelease();
    }
  };

  return Promise.resolve();
};

export const sendCommand = async (userID, text) => {
  const payload = { event: "command", data: { userID, text } };

  console.log("📤 Sending command payload:", payload);

  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.log("✅ Command sent");
    } catch (err) {
      console.error("❌ Error sending command:", err);
      throw err;
    }
  } else {
    const errMsg = "⚠️ WebSocket is not open";
    console.warn(errMsg);
    throw new Error(errMsg);
  }
};

export const setPlaybackResolver = (resolve) => {
  chatState.set({ playbackResolve: resolve });
};
