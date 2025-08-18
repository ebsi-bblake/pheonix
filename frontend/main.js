// main.js
// main.js
import { initSocket, sendLaunch } from "./ws-client.js";
import { playAudio } from "./audio-player.js";
import { start, launcherBtnHandler } from "./ui.js";
import { dispatcher, States, Events } from "./state.js";

const launcherBtn = document.getElementById("launch-btn");
launcherBtn.addEventListener("click", launcherBtnHandler);
let playbackQueue = Promise.resolve();
let playedThisResponse = false;
const USER_ID = "ebsi_pheonix";

initSocket(
  async (msg, resolve) => {
    // Track whether this response played audio
    if (msg?.resetFlag) playedThisResponse = false;

    if (msg?.audioUrl) {
      playedThisResponse = true;
      playbackQueue = playbackQueue.then(async () => {
        try {
          await playAudio(msg.audioUrl);
        } catch (e) {
          console.warn("playAudio failed:", e);
        }
      });
      return;
    }

    if (msg?.done) {
      await playbackQueue;
      // If no audio was queued or audio failed immediately, still finish UI
      if (!playedThisResponse) {
        dispatcher.dispatch({ type: Events.FINISH });
      }
      resolve?.();
      return;
    }
  },
  (err) => {
    console.error("WS onError:", err);
    // If we're in INITIALIZING state and get an error, go back to OFF
    if (dispatcher.getState() === States.INITIALIZING) {
      dispatcher.dispatch({ type: Events.ERROR });
    }
  },
).then(() => {
  start();

  // Handle state transitions - launch when entering INITIALIZING
  dispatcher.setHook(async (next, prev, ev) => {
    console.info(`🔄 State: ${prev} → ${next} via ${ev.type}`);

    // Launch when entering INITIALIZING state
    if (next === States.INITIALIZING && prev === States.OFF) {
      console.info("🚀 Launching backend connection...");
      try {
        await sendLaunch(USER_ID);
        console.info("✅ Launch successful");
        dispatcher.dispatch({ type: Events.LAUNCHED }); // Go to STANDBY
      } catch (e) {
        console.error("❌ Failed to send launch:", e);
        dispatcher.dispatch({ type: Events.ERROR }); // Back to OFF
      }
    }
  });
});
