// === Config Constants ===
const VoiceFlowUrl = "/api/voiceflow";
const HEADERS = {
  versionID: "production",
  Accept: "application/json",
  "Content-Type": "application/json",
  "transfer-encoding": "chunked",
};
const CONFIG = {
  tts: true,
  stripSSML: true,
  stopAll: false,
  excludeTypes: ["block", "debug", "flow"],
};
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

// === State ===
let state = "off";
let currentRecognizer = null;
let currentAudio = null;
const micBtn = document.getElementById("mic-btn");

// === Utilities ===
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

// === Services ===
const recognizeSpeech = (maxAlternatives = 5) =>
  new Promise((resolve, reject) => {
    const r = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    currentRecognizer = r;
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = maxAlternatives;

    r.onresult = (e) => {
      currentRecognizer = null;
      const results = Array.from(e.results[0]).map((r) =>
        r.transcript.toLowerCase(),
      );
      resolve(results);
    };
    r.onerror = (err) => {
      currentRecognizer = null;
      reject(err);
    };
    r.start();
  });

const sendToVoiceflow = async (message) => {
  const res = await fetch(VoiceFlowUrl, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      action: { type: "text", payload: message },
      config: CONFIG,
    }),
  });

  if (!res.ok) {
    console.error("Voiceflow error:", res.status, await res.text());
    return [];
  }

  return res.json();
};

const playSpeakTraces = async (traces) => {
  for (const trace of traces) {
    if (trace.type === "text" && trace.payload?.audio?.src) {
      const audio = new Audio(trace.payload.audio.src);
      audio.preload = "auto";
      currentAudio = audio;

      try {
        await audio.play();
        await new Promise((resolve) => {
          audio.onended = audio.onerror = () => {
            currentAudio = null;
            resolve();
          };
        });
      } catch (err) {
        console.warn("Audio playback failed:", err);
        currentAudio = null;
      }
    }
  }
};

// === UI + State Transitions ===
const updateUI = (newState) => {
  document.body.classList.toggle("listening", newState === "on-listening");
  micBtn.classList.toggle(
    "active",
    newState !== "off" && newState !== "on-response",
  );
  micBtn.classList.toggle("response", newState === "on-response");
};

const transitionTo = async (nextState) => {
  if (currentRecognizer) {
    try {
      currentRecognizer.abort();
    } catch { }
    currentRecognizer = null;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch { }
    currentAudio = null;
  }
  console.log(`from : ${state} to ${nextState}`);
  state = nextState;
  updateUI(state);
};

// === Interaction Loop ===
const waitForWakeWord = async () => {
  const wakeWords = await recognizeSpeech().catch(() => []);
  return wakeWords.find((w) => isFuzzyMatch(w, triggerPhrases));
};

const captureCommand = async () => {
  const [command] = await recognizeSpeech(1).catch(() => []);
  return command;
};

const handleInteraction = async () => {
  if (state !== "off") {
    await transitionTo("off");
    return;
  }

  try {
    await transitionTo("on-standby");

    while (state !== "off") {
      const trigger = await waitForWakeWord();
      if (!trigger) continue;

      console.log("🔊 Wake word detected:", trigger);
      await transitionTo("on-listening");

      const command = await captureCommand();
      if (!command) {
        await transitionTo("on-standby");
        continue;
      }

      console.log("💬 Command:", command);
      await transitionTo("on-response");
      const traces = await sendToVoiceflow(command);
      await playSpeakTraces(traces);
      await transitionTo("on-standby");
    }
  } catch (err) {
    console.error("Interaction error:", err);
  }

  await transitionTo("off");
};

// === Event Binding ===
micBtn.addEventListener("click", handleInteraction);
