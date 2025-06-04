import { States, Events, chatState } from "./state.js";
import { dispatcher } from "./dispatcher.js";
import { startMicKeepAlive, stopMicKeepAlive } from "./mic.js";
import { recognizeSpeech, listenForCancel, waitForWakeWord } from "./speech.js";
import { sendCommand, setPlaybackResolver } from "./ws-client.js";

dispatcher.setHook((next, prev, event) => {
  console.log(`🔄 ${prev} → ${next} via ${event.type}`);
  updateUI(next);
});

const micBtn = document.getElementById("mic-btn");

export const updateUI = (newState) => {
  document.body.classList.toggle("listening", newState === States.LISTENING);

  if (!micBtn) return;

  micBtn.classList.toggle(
    "active",
    newState !== States.OFF && newState !== States.RESPONSE,
  );
  micBtn.classList.toggle("response", newState === States.RESPONSE);
};

// Central control loop — starts on wake and resumes after response
export const wakeLoop = async () => {
  if (chatState.get().cancelRequested) {
    console.log("🚫 Skipping wakeLoop — cancel was requested");
    chatState.set({ cancelRequested: false });
    return;
  }

  if (chatState.get().wakeLoopRunning) return;
  if (dispatcher.getState() !== States.STANDBY) {
    console.log("⏳ Skipping wakeLoop — not in standby");
    return;
  }

  chatState.set({ wakeLoopRunning: true });

  try {
    const now = Date.now();
    if (now - chatState.get().wakeLoopLast < 500) {
      chatState.set({ wakeLoopRunning: false });
      return;
    }

    chatState.set({ wakeLoopLast: now });

    console.log("🔁 wakeLoop() entered, current state:", dispatcher.getState());

    const trigger = await waitForWakeWord().catch(() => null);
    if (!trigger) {
      dispatcher.dispatch({ type: Events.START });
      chatState.set({ wakeLoopRunning: false });
      return wakeLoop(); // retry if not matched
    }

    dispatcher.dispatch({ type: Events.WAKE });
    await listenForCommand();
    await wakeLoop(); // continue listening
  } finally {
    chatState.set({ wakeLoopRunning: false });
  }
};

// Handles recognizer and fallback to cancel
const listenForCommand = async () => {
  console.log("🧠 recognizer start", chatState.get().recognizer);
  const command = await recognizeSpeech().catch(() => null);
  console.log("🎙️ user command:", command);
  if (!command) {
    dispatcher.dispatch({ type: Events.ERROR });
    return;
  }

  dispatcher.dispatch({ type: Events.COMMAND });

  const awaitingResponseDone = new Promise((resolve) => {
    setPlaybackResolver(resolve);
  });

  sendCommand("ebsi_pheonix", command);

  await Promise.race([
    awaitingResponseDone,
    listenForCancel().then(async (cancelled) => {
      if (cancelled) {
        const { audio } = chatState.get();
        if (audio) {
          audio.pause();
          audio.src = "";
          chatState.set({ audio: null });
        }
        chatState.set({ cancelRequested: true });
        dispatcher.dispatch({ type: Events.CANCEL });
        await wakeLoop();
      }
    }),
  ]);

  chatState.set({ cancelRequested: false });
};

export const start = () => {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      const r = chatState.get().recognizer;
      if (r) {
        console.warn("📵 Tab hidden: aborting recognizer");
        try {
          r.abort();
        } catch { }
        chatState.set({ recognizer: null });
      }
    } else {
      const ctx = chatState.get().keepAliveContext;
      if (ctx?.state === "suspended") {
        ctx
          .resume()
          .then(() =>
            console.log("🎛️ AudioContext resumed after tab visibility change"),
          );
      }
    }
  });

  micBtn.addEventListener("click", async () => {
    console.log("🎤 Mic clicked");

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("✅ Mic permission OK");
    } catch (err) {
      console.error("❌ Mic permission denied", err);
      return;
    }

    if (dispatcher.getState() !== States.OFF) {
      console.log("🔕 Turning off voice assistant");
      dispatcher.dispatch({ type: Events.ERROR });

      if (dispatcher.getState() === States.RESPONSE) {
        const recognizer = chatState.get().recognizer;
        if (recognizer) {
          try {
            recognizer.abort();
          } catch { }
        }
      }

      await stopMicKeepAlive();
      chatState.reset();
      return;
    }

    dispatcher.dispatch({ type: Events.START });
    await startMicKeepAlive();
    await wakeLoop();
  });
};
