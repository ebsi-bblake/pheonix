import { Events, chatState, dispatcher } from "./state.js";

export const playAudio = async (audioUrl) => {
  // Nothing to play? Exit quietly.
  if (!audioUrl) return;

  const tokenAtStart = chatState.get().playbackToken || 0; // capture token
  const audio = new Audio(audioUrl);
  chatState.set({ audio });

  let resolved = false;
  let started = false;
  let timeout;
  const start = performance.now();
  const isStale = () => tokenAtStart !== (chatState.get().playbackToken || 0);

  const safeResolve = async () => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      if (chatState.get().audio === audio) chatState.set({ audio: null });
      await new Promise(requestAnimationFrame);
    }
  };

  const attachHandlers = () => {
    audio.onended = async () => {
      if (isStale()) return safeResolve(); // ignore old playback
      const actual = (performance.now() - start) / 1000;
      console.log(`🟢 Audio ended after ${actual.toFixed(2)}s`);
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };

    audio.onerror = async (e) => {
      if (isStale()) return safeResolve(); // expected on interrupt
      console.warn("⚠️ Audio playback failed:", e);
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };
  };

  return new Promise(async (resolve) => {
    try {
      console.log("▶️ Playing audio...");
      await audio.play();
      started = true;

      attachHandlers();

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
          if (resolved || isStale()) return;
          const elapsed = (performance.now() - start) / 1000;
          console.warn(`⏳ Timeout: playback exceeded ${elapsed.toFixed(2)}s`);
          dispatcher.dispatch({ type: Events.FINISH });
          await safeResolve();
        },
        (duration + 1.5) * 1000,
      );
    } catch (err) {
      if (!isStale()) {
        console.warn("🚫 audio.play() threw:", err);
        if (started) dispatcher.dispatch({ type: Events.FINISH });
      }
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

export const stopCurrentAudio = () => {
  const current = chatState.get();
  const newToken = (current.playbackToken || 0) + 1; // invalidate old handlers
  chatState.set({ playbackToken: newToken });

  const { audio } = current;
  if (audio) {
    try {
      audio.pause();
      audio.src = "";
    } catch { }
    if (chatState.get().audio === audio) chatState.set({ audio: null });
  }
};
