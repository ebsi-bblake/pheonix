import { Events, States, chatState } from "./state.js";
import { dispatcher } from "./dispatcher.js";
import { initSocket, sendCommand, setPlaybackResolver } from "./ws-client.js";
import { playAudio } from "./audio-player.js";
import { recognizeSpeech, waitForWakeWord, listenForCancel } from "./speech.js";
import { updateUI } from "./ui.js";
import { startMicKeepAlive, stopMicKeepAlive } from "./mic.js";

let lastWakeLoop = 0;
let isWakeLoopRunning = false;

dispatcher.setHook((next, prev, event) => {
  console.log(`🔄 ${prev} → ${next} via ${event.type}`);
  updateUI(next);
});

initSocket(
  async ({ audioUrl }, resolve) => {
    chatState.set({ audio: new Audio(audioUrl) });
    await playAudio(audioUrl, chatState.get().cancelRequested, wakeLoop);
    resolve?.();
  },
  (err) => console.error(err),
);

const wakeLoop = async () => {
  if (isWakeLoopRunning) return;
  isWakeLoopRunning = true;

  try {
    if (dispatcher.getState() === States.OFF) {
      isWakeLoopRunning = false;
      return; // ⛔ don't re-enter when turned off
    }

    const now = Date.now();
    if (now - lastWakeLoop < 500) {
      isWakeLoopRunning = false;
      return;
    }

    lastWakeLoop = now;

    console.log("🔁 wakeLoop() entered, current state:", dispatcher.getState());

    const trigger = await waitForWakeWord().catch(() => null);
    if (!trigger) {
      dispatcher.dispatch({ type: Events.START });
      isWakeLoopRunning = false;
      return wakeLoop();
    }

    dispatcher.dispatch({ type: Events.WAKE });
    await listenForCommand();
    await wakeLoop();
  } finally {
    isWakeLoopRunning = false;
  }
};

const listenForCommand = async () => {
  console.log("🧠 recognizer start", chatState.get().recognizer);
  const command = await recognizeSpeech().catch(() => null);
  if (!command) {
    dispatcher.dispatch({ type: Events.ERROR });
    return;
  }

  dispatcher.dispatch({ type: Events.COMMAND });

  const playback = new Promise((resolve) => {
    setPlaybackResolver(resolve);
  });

  sendCommand("ebsi_pheonix", command);

  await Promise.race([
    playback,
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

document.getElementById("mic-btn").addEventListener("click", async () => {
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

    const recognizer = chatState.get().recognizer;
    if (recognizer) {
      try {
        recognizer.abort();
      } catch { }
    }

    stopMicKeepAlive();
    chatState.reset(); // full state reset
    return;
  }

  dispatcher.dispatch({ type: Events.START });
  await startMicKeepAlive();
  await wakeLoop();
});
