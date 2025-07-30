import { chatState } from "./state.js";
import { initSocket } from "./ws-client.js";
import { playAudio } from "./audio-player.js";
import { start } from "./ui.js";

initSocket(
  async ({ audioUrl }, resolve) => {
    chatState.set({ audio: new Audio(audioUrl) });
    await playAudio(audioUrl, chatState.get().cancelRequested);
    resolve?.();
  },
  (err) => console.error(err),
).then(() => start());
