import { Events, chatState, dispatcher } from "./state.js";

export const playAudio = async (audioUrl, cancelRequested) => {
  const audio = new Audio(audioUrl);
  chatState.set({ audio });

  let resolved = false;
  let started = false; // <-- track if playback actually started
  let timeout;
  const start = performance.now();

  const safeResolve = async () => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      chatState.set({ audio: null });
      await new Promise(requestAnimationFrame);
    }
  };

  const attachHandlers = () => {
    audio.onended = async () => {
      const actual = (performance.now() - start) / 1000;
      console.log(`🟢 Audio ended after ${actual.toFixed(2)}s`);
      // Audio player is the single place that goes to FINISH
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };

    audio.onerror = async (e) => {
      console.warn("⚠️ Audio playback failed:", e);
      // Still end cleanly from here
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };
  };

  return new Promise(async (resolve) => {
    // If no audio or we’re cancelling, just resolve quietly.
    if (!audioUrl || cancelRequested) {
      console.warn("⚠️ No audio (or cancel requested) — skipping playback.");
      await safeResolve(); // <-- do NOT dispatch FINISH here
      return resolve();
    }

    try {
      console.log("▶️ Playing audio...");
      await audio.play();
      started = true;

      attachHandlers();

      // wait until metadata or a short fallback
      const waitForMetadata = new Promise((res) => {
        audio.onloadedmetadata = res;
        setTimeout(res, 500);
      });
      await waitForMetadata;

      const duration =
        isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : estimateAudioDurationFromBase64(audioUrl);

      console.log("🎯 estimated duration:", duration);

      timeout = setTimeout(
        async () => {
          if (resolved) return;
          const elapsed = (performance.now() - start) / 1000;
          console.warn(`⏳ Timeout: playback exceeded ${elapsed.toFixed(2)}s`);
          dispatcher.dispatch({ type: Events.FINISH });
          await safeResolve();
        },
        (duration + 1.5) * 1000,
      );
    } catch (err) {
      console.warn("🚫 audio.play() threw:", err);
      // If we never started, do NOT dispatch FINISH here
      if (started) dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
      resolve();
    }
  });
};

const estimateAudioDurationFromBase64 = (base64) => {
  const content = base64.split(",")[1] || "";
  const estimatedBytes = (content.length * 3) / 4;
  return estimatedBytes / 1000; // naive ~1KB/sec
};

/** Call this when you need to interrupt current audio without flipping state */
export const stopCurrentAudio = () => {
  const { audio } = chatState.get();
  if (audio) {
    try {
      audio.pause();
      audio.src = "";
    } catch { }
    chatState.set({ audio: null });
  }
};
