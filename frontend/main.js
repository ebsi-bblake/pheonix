import { chatState } from "./state.js";
import { initSocket } from "./ws-client.js";
import { playAudio } from "./audio-player.js";
import { start, wakeLoop } from "./ui.js";

initSocket(
  async ({ audioUrl }, resolve) => {
    chatState.set({ audio: new Audio(audioUrl) });
    await playAudio(audioUrl, chatState.get().cancelRequested, wakeLoop);
    resolve?.();
  },
  (err) => console.error(err),
).then(() => start());
