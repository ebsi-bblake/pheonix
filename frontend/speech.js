import { chatState } from "./state.js";
import { startMicKeepAlive, stopMicKeepAlive } from "./mic.js";

export const recognizeSpeech = () => {
  const existing = chatState.get().recognizer;
  if (existing) {
    try {
      console.log("🛑 Aborting previous recognizer");
      existing.abort();
    } catch { }
    chatState.set({ recognizer: null });
  }

  console.log("🎤 [recognizeSpeech] starting...", chatState.get());

  return new Promise((resolve, reject) => {
    const r = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onstart = () => console.log("🎤 audio start");
    r.onaudiostart = () => console.log("🔊 sound start");
    r.onspeechstart = () => console.log("🗣️ speech start");
    r.onspeechend = () => console.log("🛑 speech end");
    r.onaudioend = () => console.log("🎤 audio end");
    r.onresult = (e) => {
      const text = e.results[0][0].transcript.toLowerCase();
      console.log("📥 onresult:", text);
      resolve(text);
    };
    r.onerror = (e) => {
      if (e.error === "aborted") {
        console.log("⏹️ recognizer aborted");
      } else {
        console.error("❌ onerror", e);
      }
      reject(e);
    };
    r.onend = () => {
      console.log("🔚 onend");
      chatState.set({ recognizer: null });
      startMicKeepAlive();
    };

    console.log("🧪 about to call recognizer.start()");
    stopMicKeepAlive();
    chatState.set({ recognizer: r });
    console.log("🧪 recognizer set, mic stopped");

    try {
      r.start();
      console.log("🔁 recognizer.start() called");
    } catch (err) {
      console.error("❌ recognizer.start() threw", err);
      reject(err);
    }
  });
};

export const waitForWakeWord = async () => {
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
  console.log("phrase", phrase);
  return isFuzzyMatch(phrase, triggerPhrases) ? phrase : null;
};

export const listenForCancel = () =>
  new Promise((resolve) => {
    const r = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const t = e.results[0][0].transcript.toLowerCase();
      if (t.includes("cancel")) {
        r.stop();
        resolve(true);
      }
    };
    r.onend = () => resolve(false);
    r.onerror = () => resolve(false);
    r.start();
  });
