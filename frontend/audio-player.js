import { dispatcher } from "./dispatcher.js";
import { Events, chatState } from "./state.js";

export const playAudio = async (audioUrl, cancelRequested, wakeLoop) => {
  const audio = new Audio(audioUrl);
  chatState.set({ audio });

  let resolved = false;
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
      if (!chatState.get().cancelRequested) {
        dispatcher.dispatch({ type: Events.FINISH });
        await wakeLoop();
      }
      await safeResolve();
    };

    audio.onerror = async (e) => {
      console.warn("⚠️ Audio playback failed:", e);
      await wakeLoop();
      await safeResolve();
    };
  };

  return new Promise(async (resolve) => {
    if (!audioUrl || cancelRequested) {
      console.warn("⚠️ No audio or cancel requested.");
      chatState.set({ cancelRequested: false });
      await wakeLoop();
      return resolve();
    }

    try {
      console.log("▶️ Playing audio...");
      await audio.play();

      attachHandlers();

      const waitForMetadata = new Promise((res) => {
        audio.onloadedmetadata = res;
        setTimeout(res, 500); // Fallback if metadata doesn't load
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
          if (!chatState.get().cancelRequested) {
            dispatcher.dispatch({ type: Events.FINISH });
            await wakeLoop();
          }
          await safeResolve();
        },
        (duration + 1.5) * 1000,
      );
    } catch (err) {
      console.warn("🚫 audio.play() threw:", err);
      await wakeLoop();
      await safeResolve();
      resolve();
    }
  });
};

const estimateAudioDurationFromBase64 = (base64) => {
  const content = base64.split(",")[1];
  const estimatedBytes = (content.length * 3) / 4;
  return estimatedBytes / 1000; // assume ~1KB/sec
};
