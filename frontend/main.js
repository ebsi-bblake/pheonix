import { initSocket } from "./ws-client.js";
import { playAudio } from "./audio-player.js";
import { start } from "./ui.js";

// Queue to ensure audio chunks play sequentially
let playbackQueue = Promise.resolve();

initSocket(
  async ({ audioUrl, done }, resolve) => {
    if (audioUrl) {
      console.debug("AUDIO enqueue", { len: audioUrl.length });
      await playAudio(audioUrl);
      console.debug("AUDIO played");
      resolve?.();
      return;
    }
    if (done) {
      console.debug("STREAM done signal received");
      resolve?.();
    }
  },
  (err) => console.error("WS onError:", err),
).then(() => start());
