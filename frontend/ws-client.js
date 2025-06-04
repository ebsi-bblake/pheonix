import { chatState } from "./state.js";
let socket;
export const initSocket = (onResponse, onError) => {
  socket = new WebSocket("ws://localhost:3001");

  socket.onopen = () => console.log("✅ WebSocket connected");
  socket.onclose = () => console.warn("❌ WebSocket disconnected");
  socket.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
    onError?.(err);
  };

  socket.onmessage = (e) => {
    const { event, data } = JSON.parse(e.data);
    const { audioUrl, text } = data;
    console.log("🎧 Got response:", { audioUrl, text });
    if (event === "response") {
      console.log("🎧 Got response:", data);
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
  };
  return Promise.resolve();
};

export const sendCommand = (userID, text) => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event: "command", data: { userID, text } }));
  } else {
    console.warn("WebSocket is not open");
  }
};

export const setPlaybackResolver = (resolve) =>
  chatState.set({ playbackResolve: resolve });
