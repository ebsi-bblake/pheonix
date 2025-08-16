import { chatState } from "./state.js";
import { handleButtonPress, handleButtonRelease } from "./ui.js";

let socket;

export const initSocket = (onResponse, onError) => {
  console.info("window.location.host", window.location.host);

  socket = new WebSocket("ws://localhost:3001/");

  socket.onopen = () => console.info("✅ WebSocket connected");
  socket.onclose = () => console.warn("❌ WebSocket disconnected");
  socket.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
    onError?.(err);
  };

  socket.onmessage = (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.data);
    } catch (err) {
      console.error("WS ⇐ invalid JSON:", e.data);
      return;
    }

    const { event, data, id } = parsed;
    const preview = JSON.stringify(parsed).slice(0, 260);
    console.debug("WS ⇐", preview);

    if (event === "trace") {
      const t = data;
      console.debug("TRACE:", {
        id,
        type: t?.type,
        keys: Object.keys(t?.payload || {}),
      });

      if (t?.type === "text" && t?.payload?.message) {
        const el = document.createElement("div");
        el.textContent = t.payload.message;
        document.getElementById("transcript")?.appendChild(el);
      }

      const audioSrc = t?.payload?.audio?.src || t?.payload?.src || null;
      if (audioSrc) {
        console.debug("TRACE audio src (len):", audioSrc.length);
        onResponse?.(
          { audioUrl: audioSrc },
          chatState.get().playbackResolve?.(),
        );
      }
      return;
    }

    if (event === "responseDone") {
      console.debug("TRACE end → responseDone");
      onResponse?.({ done: true }, chatState.get().playbackResolve?.());
      return;
    }

    if (event === "response") {
      console.info("LEGACY response:", data);
      if (data?.text) {
        const el = document.createElement("div");
        el.textContent = data.text;
        document.getElementById("transcript")?.appendChild(el);
      }
      onResponse?.(data, chatState.get().playbackResolve?.());
      return;
    }

    if (event === "error") {
      console.warn("⚠️ Backend error:", data);
      onError?.(data);
      return;
    }

    if (event === "buttonDown") {
      console.info("⬇️ USB button down");
      handleButtonPress();
      return;
    }
    if (event === "buttonUp") {
      console.info("⬆️ USB button up");
      handleButtonRelease();
      return;
    }

    console.debug("WS ⇐ unhandled event:", event, data);
  };

  return Promise.resolve();
};

export const sendCommand = async (userID, text, { streaming = true } = {}) => {
  const event = streaming ? "commandStream" : "command";
  const payload = { event, data: { userID, text } };
  const preview = JSON.stringify(payload).slice(0, 260);
  console.debug("WS ⇒", preview);

  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.info("✅ Command sent");
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

// Spacebar fallback
let spaceHeld = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !spaceHeld) {
    e.preventDefault();
    spaceHeld = true;
    handleButtonPress();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    spaceHeld = false;
    handleButtonRelease();
  }
});
