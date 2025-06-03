import { useDispatcher } from "./dispatcher.js";
import { Events, States, createChatState } from "./state.js";

const socket = io();
socket.on("connect", () => {
  console.log("✅ Connected to backend with ID:", socket.id);
});

const micBtn = document.getElementById("mic-btn");
const chatState = createChatState();

const dispatcher = useDispatcher((nextState, prevState, event) => {
  console.log(`🔄 ${prevState} → ${nextState} via ${event.type}`);
  updateUI(nextState);
});

const updateUI = (newState) => {
  document.body.classList.toggle("listening", newState === States.LISTENING);
  micBtn.classList.toggle(
    "active",
    newState !== States.OFF && newState !== States.RESPONSE,
  );
  micBtn.classList.toggle("response", newState === States.RESPONSE);
};

export const getAudioDuration = async (audioUrl) => {
  const audio = new Audio(audioUrl);

  // Try to load metadata first
  const duration = await new Promise((resolve) => {
    audio.onloadedmetadata = () => {
      resolve(isNaN(audio.duration) ? null : audio.duration);
    };
    audio.onerror = () => resolve(null);
  });

  if (duration !== null) return duration;

  // Fallback: estimate from base64
  const base64 = audioUrl.split(",")[1];
  const estimatedBytes = (base64.length * 3) / 4;
  const estimatedSeconds = estimatedBytes / 1000; // assume ~1KB/sec
  return estimatedSeconds;
};

const recognizeSpeech = () => {
  if (chatState.get().recognizer) {
    try {
      chatState.get().recognizer.abort(); // force stop if one exists
    } catch { }
    chatState.set({ recognizer: null });
  }
  return new Promise((resolve, reject) => {
    stopMicKeepAlive();
    const r = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    chatState.set({ recognizer: r });
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript.toLowerCase());
    r.onerror = reject;
    r.onend = () => {
      chatState.set({ recognizer: null });
      startMicKeepAlive();
    };
    r.onaudiostart = () => console.log("🎤 audio start");
    r.onaudioend = () => console.log("🎤 audio end");
    r.onsoundstart = () => console.log("🔊 sound start");
    r.onspeechstart = () => console.log("🗣️ speech start");
    r.onspeechend = () => console.log("🛑 speech end");

    r.start();
  });
};

const waitForWakeWord = async () => {
  const triggerPhrases = [
    "hey anthony",
    "hey empyrean",
    "hey imperium",
    "hey empirin",
    "hey emporium",
    "hey period",
    "hey empire in",
    "hey mp erin",
    "hey empyrion",
    "hey in korean",
    "hey in pidgin",
  ];
  const levenshtein = (a, b) => {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let v0 = Array(b.length + 1)
      .fill(0)
      .map((_, i) => i);
    let v1 = new Array(b.length + 1);
    for (let i = 0; i < a.length; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < b.length; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      [v0, v1] = [v1, v0];
    }
    return v0[b.length];
  };
  const isFuzzyMatch = (input, phrases, maxDistance = 3) =>
    phrases.some(
      (p) => levenshtein(input.trim().toLowerCase(), p) <= maxDistance,
    );
  console.log("🧠 recognizer start", chatState.get().recognizer);
  const phrase = await recognizeSpeech().catch(() => "");
  return isFuzzyMatch(phrase, triggerPhrases) ? phrase : null;
};

const listenForCancel = () =>
  new Promise((resolve) => {
    const r = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript.toLowerCase();
      if (transcript.includes("cancel")) {
        r.stop();
        resolve(true);
      }
    };
    r.onend = () => resolve(false);
    r.onerror = () => resolve(false);
    r.start();
  });

const cancelPlayback = (resolve) => {
  chatState.set({ cancelRequested: true });
  const { audio } = chatState.get();
  if (audio) {
    audio.pause();
    audio.src = "";
    chatState.set({ audio: null });
  }
  resolve?.();
};

const startMicKeepAlive = async () => {
  if (chatState.get().keepAliveStream) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  await context.audioWorklet.addModule("/noop-processor.js");
  const dummy = new AudioWorkletNode(context, "noop-processor");
  const source = context.createMediaStreamSource(stream);
  source.connect(dummy).connect(context.destination);
  chatState.set({ keepAliveStream: stream, keepAliveContext: context });
};

const stopMicKeepAlive = () => {
  const { keepAliveStream, keepAliveContext } = chatState.get();
  keepAliveStream?.getTracks().forEach((t) => t.stop());
  keepAliveContext?.close();
  chatState.set({ keepAliveStream: null, keepAliveContext: null });
};

const sendCommandToBackend = (text) => {
  socket.emit("command", { userID: "ebsi_pheonix", text });
};

let lastWakeLoop = 0;
const wakeLoop = async () => {
  const now = Date.now();
  if (now - lastWakeLoop < 500) return; // skip if too soon
  lastWakeLoop = now;

  console.log("🔁 wakeLoop() entered, current state:", dispatcher.getState());

  const trigger = await waitForWakeWord().catch(() => null);
  if (!trigger) {
    dispatcher.dispatch({ type: Events.START });
    return wakeLoop();
  }

  dispatcher.dispatch({ type: Events.WAKE });
  await listenForCommand();
  await wakeLoop();
};

const handleInteraction = async () => {
  if (dispatcher.getState() !== States.OFF) {
    dispatcher.dispatch({ type: Events.ERROR });
    stopMicKeepAlive();
    return;
  }
  dispatcher.dispatch({ type: Events.START });
  await startMicKeepAlive();
  await wakeLoop();
};

const listenForCommand = async () => {
  console.log("🧠 recognizer start", chatState.get().recognizer);
  const command = await recognizeSpeech().catch(() => null);
  if (!command) {
    dispatcher.dispatch({ type: Events.ERROR });
    return;
  }

  dispatcher.dispatch({ type: Events.COMMAND });

  let playbackResolve;
  const playback = new Promise((resolve) => {
    playbackResolve = resolve;

    socket.once("response", async ({ audioUrl, text }) => {
      console.log("🎧 Got response:", { audioUrl, text });

      if (!audioUrl || chatState.get().cancelRequested) {
        console.warn("⚠️ No audio or cancel requested.");
        await wakeLoop();
        return resolve();
      }

      const audio = new Audio(audioUrl);
      chatState.set({ audio });

      let resolved = false;
      let timeout;
      const start = performance.now();

      const safeResolve = async () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          chatState.set({ audio: null });
          resolve();
        }
      };

      const attachHandlers = () => {
        audio.onended = async () => {
          const actual = (performance.now() - start) / 1000;
          console.log(`🟢 Audio ended after ${actual.toFixed(2)}s`);

          if (!chatState.get().cancelRequested) {
            dispatcher.dispatch({ type: Events.FINISH });
            await wakeLoop(); // ✅ resume listening
          }

          safeResolve();
        };

        audio.onerror = async (e) => {
          console.warn("⚠️ Audio playback failed:", e);
          await wakeLoop();
          safeResolve();
        };
      };

      try {
        console.log("▶️ Playing audio...");
        await audio.play();

        attachHandlers();

        const waitForMetadata = new Promise((res) => {
          audio.onloadedmetadata = res;
          setTimeout(res, 500); // fallback in case metadata doesn’t load
        });

        await waitForMetadata;

        const expectedDuration =
          isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : estimateAudioDurationFromBase64(audioUrl);

        console.log(`🎯 Expected duration: ${expectedDuration.toFixed(2)}s`);

        timeout = setTimeout(
          async () => {
            const elapsed = (performance.now() - start) / 1000;
            console.warn(
              `⏳ Timeout: playback exceeded ${elapsed.toFixed(2)}s`,
            );
            if (!chatState.get().cancelRequested) {
              dispatcher.dispatch({ type: Events.FINISH });
              await wakeLoop(); // ✅ resume listening
            }
            safeResolve();
          },
          (expectedDuration + 1.5) * 1000,
        );
      } catch (err) {
        console.warn("🚫 audio.play() threw:", err);
        await wakeLoop();
        safeResolve();
      }
    });
  });

  sendCommandToBackend(command);

  await Promise.race([
    playback,
    listenForCancel().then(async (cancelled) => {
      if (cancelled) {
        cancelPlayback(playbackResolve);
        dispatcher.dispatch({ type: Events.CANCEL });
        await wakeLoop();
      }
    }),
  ]);

  // if (!chatState.get().cancelRequested) {
  //   dispatcher.dispatch({ type: Events.FINISH });
  //   await wakeLoop();
  // }

  chatState.set({ cancelRequested: false });
};

micBtn.addEventListener("click", handleInteraction);
