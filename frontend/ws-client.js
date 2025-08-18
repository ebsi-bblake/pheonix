import { chatState } from "./state.js";
import { handleButtonPress, handleButtonRelease } from "./ui.js";

let socket;

/**
 * Allow UI to register a resolver that we'll call when we receive responseDone.
 * (UI sets it before sending a command; we call it once, then clear it.)
 */
export const setPlaybackResolver = (resolve) => {
  chatState.set({ playbackResolve: resolve });
};

/**
 * Convert base64 audio data to a blob URL
 */
const createAudioBlobFromBase64 = (base64Content, mimeType = "audio/mp3") => {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64Content.replace(/^data:audio\/[^;]+;base64,/, "");

    // Convert base64 to binary
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob and return URL
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Failed to create blob from base64:", error);
    return null;
  }
};

export const initSocket = (onResponse, onError) => {
  console.info("window.location.host", window.location.host);

  socket = new WebSocket("ws://localhost:3001/");

  // Store socket reference in chat state for access from other modules
  chatState.set({ webSocket: socket });

  socket.onopen = () => console.info("✅ WebSocket connected");
  socket.onclose = () => {
    console.warn("❌ WebSocket disconnected");
    chatState.set({ webSocket: null });
  };
  socket.onerror = (err) => {
    console.error("⚠️ WebSocket error:", err);
    onError?.(err);
  };

  socket.onmessage = (e) => {
    console.log("🔥 RAW MESSAGE RECEIVED:", e.data);

    let parsed;
    try {
      parsed = JSON.parse(e.data);
    } catch (err) {
      console.error("WS ← invalid JSON:", e.data);
      return;
    }

    console.log("🔥 PARSED MESSAGE:", parsed);

    const { event, data } = parsed;
    const preview = JSON.stringify(parsed).slice(0, 260);
    console.debug("WS ←", preview);

    if (event === "trace") {
      const t = data;

      // Optional transcript (only if you re-enable #transcript in index.html)
      if (t?.type === "text" && t?.payload?.message) {
        const el = document.createElement("div");
        el.textContent = t.payload.message;
        document.getElementById("transcript")?.appendChild(el);
      }

      // Handle audio: either URL or base64 content
      if (t?.type === "audio" && t?.payload) {
        let url = null;

        // Check for direct URL first
        if (t.payload.audio?.src) {
          url = t.payload.audio.src;
        }
        // Handle base64 content
        else if (t.payload.encoding === "audio/mp3" && t.payload.content) {
          console.log(
            "Converting base64 audio to blob URL, content length:",
            t.payload.content.length,
          );
          url = createAudioBlobFromBase64(
            t.payload.content,
            t.payload.encoding,
          );
        }

        if (url) {
          console.log("🎵 Audio URL ready:", url.substring(0, 50) + "...");
          onResponse?.({ audioUrl: url });
        } else {
          console.warn("⚠️ Failed to create audio URL from payload");
        }
      }
      return;
    }

    if (event === "responseDone") {
      console.debug("TRACE end → responseDone");
      const resolver = chatState.get().playbackResolve;
      try {
        // Tell main/ui that this turn is done; they will wait on any queued audio
        onResponse?.({ done: true });
      } finally {
        // Clear the resolver so next request can set a fresh one
        chatState.set({ playbackResolve: null });
        // Call resolver if it exists
        resolver?.();
      }
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

    console.debug("WS ← unhandled event:", event, data);
  };

  return Promise.resolve();
};

export const sendLaunch = (userID) => {
  const payload = { event: "launch", data: { userID } };
  const preview = JSON.stringify(payload).slice(0, 260);
  console.debug("WS →", preview);

  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.info("✅ Launch sent");
    } catch (err) {
      console.error("❌ Error sending launch:", err);
      throw err;
    }
  } else {
    const errMsg = "⚠️ WebSocket is not open";
    console.warn(errMsg);
    throw new Error(errMsg);
  }
};

export const sendCommand = async (userID, text) => {
  const payload = { event: "commandStream", data: { userID, text } };
  const preview = JSON.stringify(payload).slice(0, 260);
  console.debug("WS →", preview);

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

export const sendCancel = () => {
  const payload = { event: "cancel" };
  console.debug("WS → cancel");

  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
      console.info("✅ Cancel sent");
    } catch (err) {
      console.error("❌ Error sending cancel:", err);
    }
  } else {
    console.warn("⚠️ Cannot send cancel - WebSocket not open");
  }
};
