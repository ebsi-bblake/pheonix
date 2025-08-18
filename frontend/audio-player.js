// audio-player.js
import { Events, chatState, dispatcher } from "./state.js";

export const playAudio = async (audioUrl) => {
  if (!audioUrl) return;

  const tokenAtStart = chatState.get().playbackToken || 0;
  const audio = new Audio(audioUrl);
  audio.preload = "auto";
  chatState.set({ audio });

  const start = performance.now();
  const isStale = () => tokenAtStart !== (chatState.get().playbackToken || 0);

  return new Promise(async (resolve) => {
    let resolved = false;
    let timeout;

    const maybeRevoke = () => {
      try {
        if (audio.src && audio.src.startsWith("blob:")) {
          URL.revokeObjectURL(audio.src);
        }
      } catch {}
    };

    const safeResolve = async () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (chatState.get().audio === audio) chatState.set({ audio: null });
      maybeRevoke();
      await new Promise(requestAnimationFrame);
      resolve(); // <-- IMPORTANT: finish the promise
    };

    // Handlers FIRST
    audio.onended = async () => {
      if (isStale()) return safeResolve();
      const actual = (performance.now() - start) / 1000;
      console.log(`🟢 Audio ended after ${actual.toFixed(2)}s`);
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };

    audio.onerror = async (e) => {
      if (isStale()) return safeResolve();
      console.warn("⚠️ Audio playback failed:", e);
      dispatcher.dispatch({ type: Events.FINISH });
      await safeResolve();
    };

    try {
      console.log("▶️ Playing audio...");
      // Give metadata a moment; some browsers prefer load() -> play()
      try {
        audio.load();
      } catch {}

      // Kick off playback (must be user-gesture compatible; your mic click is fine)
      await audio.play();

      // Wait a bit for duration to show up
      const waitForMetadata = new Promise((res) => {
        audio.onloadedmetadata = res;
        setTimeout(res, 800);
      });
      await waitForMetadata;

      // Duration fallback: only guess for data: URLs; for blob/remote use a modest cap
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : audioUrl.startsWith("data:")
            ? estimateAudioDurationFromBase64(audioUrl)
            : 8;

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
        // If play() failed, still move UI along so it doesn't get stuck
        dispatcher.dispatch({ type: Events.FINISH });
      }
      await safeResolve();
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
  const newToken = (current.playbackToken || 0) + 1;
  chatState.set({ playbackToken: newToken });

  const { audio } = current;
  if (audio) {
    try {
      audio.pause();
      if (audio.src && audio.src.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(audio.src);
        } catch {}
      }
      audio.src = "";
    } catch {}
    if (chatState.get().audio === audio) chatState.set({ audio: null });
  }
};
