import { dispatcher, States, Events, chatState } from "./state.js";
import {
  startBufferedRecognition,
  stopRecognition,
  listenForCancel,
  abortRecognition,
} from "./speech.js";
import { sendCommand, setPlaybackResolver } from "./ws-client.js";

dispatcher.setHook((next, prev, event) => {
  console.log(`🔄 ${prev} → ${next} via ${event.type}`);
  updateUI(next);
});

const micBtn = document.getElementById("mic-btn");

export const start = () => {
  if (!micBtn) {
    console.warn("Mic button element not found");
    return;
  }

  micBtn.addEventListener("click", micButtonHandler);
  micBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      micButtonHandler();
    }
  });
};

const micButtonHandler = async () => {
  if (dispatcher.getState() !== States.OFF) {
    dispatcher.dispatch({ type: Events.EXIT });
    abortRecognition();
    chatState.reset();
    return;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Mic permission granted");
    dispatcher.dispatch({ type: Events.START });
  } catch (err) {
    console.error("❌ Mic permission denied", err);
  }
};

export const updateUI = (newState) => {
  const body = document.body;
  const card = document.querySelector(".card");

  body.classList.toggle("off", newState === States.OFF);
  body.classList.toggle("standby", newState === States.STANDBY);
  body.classList.toggle("listening", newState === States.LISTENING);
  body.classList.toggle("response", newState === States.RESPONSE);

  if (!card) return;

  card.classList.toggle(
    "active",
    newState === States.LISTENING || newState === States.STANDBY,
  );
  card.classList.toggle("response", newState === States.RESPONSE);
};

// USB button pressed → start buffering recognition
export const handleButtonPress = async () => {
  const currentState = dispatcher.getState();

  if (currentState === States.RESPONSE || currentState === States.LISTENING) {
    console.info("⏹️ Interrupting current activity");

    abortRecognition();

    const { audio, playbackResolve } = chatState.get();
    if (audio) {
      audio.pause();
      audio.src = "";
      chatState.set({ audio: null });
      playbackResolve?.(); // explicitly resolve to prevent warnings
    }

    chatState.set({ cancelRequested: true });
    dispatcher.dispatch({ type: Events.FINISH });
  }

  if (dispatcher.getState() === States.STANDBY) {
    dispatcher.dispatch({ type: Events.PRESS });
    try {
      await startBufferedRecognition();
      chatState.set({
        audio: null,
        cancelRequested: false,
      });
    } catch (err) {
      console.warn("Recognition error:", err);
      dispatcher.dispatch({ type: Events.FINISH });
    }
  }
};

// USB button released → stop recognition and process
export const handleButtonRelease = async () => {
  if (dispatcher.getState() !== States.LISTENING) return;

  dispatcher.dispatch({ type: Events.RELEASE });

  const command = await stopRecognition();
  if (!command) {
    dispatcher.dispatch({ type: Events.FINISH });
    return;
  }

  dispatcher.dispatch({ type: Events.COMMAND });

  // Set playback resolver explicitly here:
  const awaitingResponseDone = new Promise((resolve) => {
    setPlaybackResolver(resolve);
  });

  try {
    await sendCommand("ebsi_pheonix", command);
    await Promise.race([
      awaitingResponseDone,
      listenForCancel().then(async (cancelled) => {
        if (cancelled) {
          abortRecognition();
          chatState.set({ cancelRequested: true });
        }
      }),
    ]);
  } catch (err) {
    console.error("Error sending command:", err);
  } finally {
    dispatcher.dispatch({ type: Events.FINISH });
    chatState.set({ cancelRequested: false });
  }
};
