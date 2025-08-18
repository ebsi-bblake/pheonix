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

// Track if we're in the middle of an interrupt sequence
let isInterrupting = false;

export const start = () => {
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault(); // Prevent page scroll
      handleButtonPress();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
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
    isInterrupting = false;
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

// Button press → interrupt current activity, prepare for new input
export const handleButtonPress = async () => {
  const currentState = dispatcher.getState();

  // If we're in RESPONSE or LISTENING, this is an interrupt/barge-in
  if ([States.RESPONSE, States.LISTENING].includes(currentState)) {
    console.warn("🚨 Interrupting current activity (barge-in)");
    isInterrupting = true;

    // Stop current audio and recognition immediately
    abortRecognition();
    stopCurrentAudio();
    chatState.set({ cancelRequested: true });

    // Send abort signal to backend to stop streaming
    try {
      const ws = chatState.get().webSocket;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "cancel" }));
      }
    } catch (err) {
      console.warn("Failed to send cancel to backend:", err);
    }

    // Transition to LISTENING state for new input
    dispatcher.dispatch({ type: Events.PRESS });

    // Start recognition immediately after interrupt
    try {
      await startBufferedRecognition();
      chatState.set({ cancelRequested: false });
      console.info("🎤 Recognition started after interrupt");
    } catch (err) {
      console.error("Recognition error after interrupt:", err);
      dispatcher.dispatch({ type: Events.FINISH });
      isInterrupting = false;
    }
    return;
  }

  // Normal flow: STANDBY → LISTENING
  if (currentState === States.STANDBY) {
    isInterrupting = false;
    dispatcher.dispatch({ type: Events.PRESS });

    try {
      await startBufferedRecognition();
      chatState.set({ cancelRequested: false });
      console.info("🎤 Recognition started normally");
    } catch (err) {
      console.error("Recognition error:", err);
      dispatcher.dispatch({ type: Events.FINISH });
    }
    return;
  }

  console.warn(`⚠️ Button press ignored in state: ${currentState}`);
};

// Button release → stop recognition and process command
export const handleButtonRelease = async () => {
  const currentState = dispatcher.getState();

  if (currentState !== States.LISTENING) {
    console.warn(`⚠️ Button release ignored in state: ${currentState}`);
    return;
  }

  dispatcher.dispatch({ type: Events.RELEASE });

  const command = await stopRecognition();
  if (!command || command.trim() === "") {
    console.warn("No command recognized, returning to standby");
    dispatcher.dispatch({ type: Events.FINISH });
    isInterrupting = false;
    return;
  }

  console.info(`🗣️ Command recognized: "${command}"`);
  dispatcher.dispatch({ type: Events.COMMAND });

  // Set playback resolver for response
  const awaitingResponseDone = new Promise((resolve) => {
    setPlaybackResolver(resolve);
  });

  try {
    await sendCommand("ebsi_pheonix", command);

    // Race between response completion and user saying "cancel"
    await Promise.race([
      awaitingResponseDone,
      listenForCancel().then(async (cancelled) => {
        if (cancelled) {
          console.info("🚫 User said 'cancel' during response");
          abortRecognition();
          stopCurrentAudio();
          chatState.set({ cancelRequested: true });
        }
      }),
    ]);
  } catch (err) {
    console.error("Error sending command:", err);
    dispatcher.dispatch({ type: Events.ERROR });
  } finally {
    chatState.set({ cancelRequested: false });
    isInterrupting = false;
  }
};
