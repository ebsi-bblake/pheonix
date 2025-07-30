import { dispatcher, States, Events, chatState } from "./state.js";
import {
  startBufferedRecognition,
  stopRecognition,
  listenForCancel,
  abortRecognition,
} from "./speech.js";
import { sendCommand, setPlaybackResolver } from "./ws-client.js";

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

dispatcher.setHook((next, prev, event) => {
  console.log(`🔄 ${prev} → ${next} via ${event.type}`);
  updateUI(next);
});

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
  if (dispatcher.getState() !== States.STANDBY) return;

  dispatcher.dispatch({ type: Events.PRESS });

  try {
    await startBufferedRecognition();
  } catch (err) {
    console.warn("Recognition error:", err);
    dispatcher.dispatch({ type: Events.FINISH });
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

  const awaitingResponseDone = new Promise((resolve) => {
    setPlaybackResolver(resolve);
  });

  try {
    await sendCommand("ebsi_pheonix", command);
  } catch (err) {
    console.error("Failed to send command:", err);
    dispatcher.dispatch({ type: Events.FINISH });
  }

  await Promise.race([
    awaitingResponseDone,
    listenForCancel().then(async (cancelled) => {
      if (cancelled) {
        abortRecognition();
        chatState.set({ cancelRequested: true });
        dispatcher.dispatch({ type: Events.FINISH });
      }
    }),
  ]);

  chatState.set({ cancelRequested: false });
};
