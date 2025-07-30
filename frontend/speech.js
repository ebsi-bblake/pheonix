import { chatState } from "./state.js";

let recognizer = null;
let interimTranscript = "";

export const startBufferedRecognition = () => {
  return new Promise((resolve, reject) => {
    if (recognizer) {
      try {
        recognizer.abort();
      } catch {}
      recognizer = null;
    }
    recognizer = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    recognizer.lang = "en-US";
    recognizer.interimResults = true;
    recognizer.maxAlternatives = 1;

    interimTranscript = "";

    recognizer.onstart = () => console.log("🎤 audio start");
    recognizer.onaudiostart = () => console.log("🔊 sound start");
    recognizer.onspeechstart = () => console.log("🗣️ speech start");
    recognizer.onspeechend = () => console.log("🛑 speech end");
    recognizer.onaudioend = () => console.log("🎤 audio end");

    recognizer.onresult = (e) => {
      interimTranscript = "";
      for (let i = 0; i < e.results.length; i++) {
        interimTranscript += e.results[i][0].transcript;
      }
      console.log("🎙 Interim transcript:", interimTranscript);
      // We do not resolve here, but wait for stopRecognition()
    };

    recognizer.onerror = (e) => {
      if (["aborted", "no-speech"].includes(e.error)) {
        console.log("⏹️ recognizer aborted");
      } else {
        console.error("❌ onerror", e);
      }
      reject(e);
    };

    recognizer.onend = () => {
      console.log("🔚 recognizer ended");
      recognizer = null;
    };

    chatState.set({ recognizer: recognizer });

    try {
      recognizer.start();
      console.log("🔁 recognizer.start() called");
    } catch (err) {
      console.error("❌ recognizer.start() threw", err);
      reject(err);
    }
  });
};

export const stopRecognition = () => {
  return new Promise((resolve) => {
    if (!recognizer) {
      resolve(null);
      return;
    }

    const onEndHandler = () => {
      resolve(interimTranscript.toLowerCase());
      if (recognizer) {
        recognizer.removeEventListener("end", onEndHandler);
      }
      recognizer = null;
    };

    recognizer.addEventListener("end", onEndHandler);

    try {
      recognizer.stop();
      console.log("🛑 recognizer stopped");
    } catch {
      if (recognizer) {
        recognizer.removeEventListener("end", onEndHandler);
      }
      resolve(null);
    }
  });
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

export const abortRecognition = () => {
  if (recognizer) {
    try {
      recognizer.abort();
      console.log("🛑 Recognition manually aborted");
    } catch (err) {
      console.warn("⚠️ Error aborting recognizer:", err.message);
    }
    recognizer = null;
    chatState.set({ recognizer: null });
  }
};
