import { dispatcher, States, Events, chatState } from "./state.js";
import {
  startBufferedRecognition,
  stopRecognition,
  listenForCancel,
  abortRecognition,
} from "./speech.js";
import { sendCommand, setPlaybackResolver } from "./ws-client.js";
import { stopCurrentAudio } from "./audio-player.js";

dispatcher.setHook((next, prev, event) => {
  console.info(`🔄 ${prev} → ${next} via ${event.type}`);
  updateUI(next);
});

export const start = () => {
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      handleButtonPress();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      handleButtonRelease();
    }
  });
};

export const launcherBtnHandler = async () => {
  const currentState = dispatcher.getState();

  // If not OFF, exit the system
  if (currentState !== States.OFF) {
    dispatcher.dispatch({ type: Events.EXIT });
    abortRecognition();
    chatState.reset();
    return;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.info("✅ Mic permission granted");
    dispatcher.dispatch({ type: Events.START }); // Goes to INITIALIZING
  } catch (err) {
    console.error("❌ Mic permission denied", err);
    dispatcher.dispatch({ type: Events.ERROR });
  }
};

export const updateUI = (newState) => {
  const body = document.body;
  const card = document.querySelector(".card");

  // Clear all state classes
  body.classList.remove(
    "off",
    "initializing",
    "standby",
    "listening",
    "response",
  );

  // Set current state class
  body.classList.add(newState);

  if (!card) return;

  // Update card classes based on state
  card.classList.toggle(
    "active",
    [States.LISTENING, States.STANDBY, States.INITIALIZING].includes(newState),
  );
  card.classList.toggle("response", newState === States.RESPONSE);
  card.classList.toggle("initializing", newState === States.INITIALIZING);
};

// USB button pressed → start buffering recognition
export const handleButtonPress = async () => {
  const currentState = dispatcher.getState();

  if ([States.RESPONSE, States.LISTENING].includes(currentState)) {
    console.warn("ℹ️ Interrupting current activity");
    abortRecognition();
    stopCurrentAudio();
    chatState.set({ cancelRequested: true });
    dispatcher.dispatch({ type: Events.PRESS });
  } else if (currentState === States.STANDBY) {
    dispatcher.dispatch({ type: Events.PRESS });
  } else {
    console.warn(`⚠️ Button press ignored in state: ${currentState}`);
    return;
  }

  try {
    await startBufferedRecognition();
    chatState.set({ cancelRequested: false });
  } catch (err) {
    console.error("Recognition error:", err);
    // If recognition can't start, bounce back to standby
    dispatcher.dispatch({ type: Events.FINISH });
  }
};

// USB button released → stop recognition and process
export const handleButtonRelease = async () => {
  const currentState = dispatcher.getState();

  if (currentState !== States.LISTENING) {
    console.warn(`⚠️ Button release ignored in state: ${currentState}`);
    return;
  }

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
    dispatcher.dispatch({ type: Events.ERROR });
  } finally {
    chatState.set({ cancelRequested: false });
  }
};
