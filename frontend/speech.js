import { chatState } from "./state.js";

let recognizer = null;
let interimTranscript = "";

export const startBufferedRecognition = () => {
  return new Promise((resolve, reject) => {
    if (recognizer) {
      try {
        recognizer.abort();
      } catch { }
      recognizer = null;
    }
    recognizer = new (window.SpeechRecognition ||
      window.webkitSpeechRecognition)();
    recognizer.lang = "en-US";
    recognizer.interimResults = true;
    recognizer.continuous = true;
    recognizer.maxAlternatives = 1;

    interimTranscript = "";

    recognizer.onstart = () => console.info("🎤 audio start");
    recognizer.onaudiostart = () => console.info("🔊 sound start");
    recognizer.onspeechstart = () => console.info("🗣️ speech start");
    recognizer.onspeechend = () => console.info("🛑 speech end");
    recognizer.onaudioend = () => console.info("🎤 audio end");

    recognizer.onresult = (e) => {
      interimTranscript = "";
      for (let i = 0; i < e.results.length; i++) {
        interimTranscript += e.results[i][0].transcript;
      }
      console.info("🎙 Interim transcript:", interimTranscript);
      // We do not resolve here, but wait for stopRecognition()
    };

    recognizer.onerror = (e) => {
      if (["aborted", "no-speech"].includes(e.error)) {
        console.info("⏹️ recognizer aborted");
      } else {
        console.error("❌ onerror", e);
      }
      reject(e);
    };

    recognizer.onend = () => {
      console.info("🔚 recognizer ended");
      recognizer = null;
    };

    chatState.set({ recognizer: recognizer });

    try {
      recognizer.start();
      console.info("🔁 recognizer.start() called");
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
      console.warn("🛑 recognizer stopped");
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
      // console.log(e.results[0][0].transcript);
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
      console.warn("🛑 Recognition manually aborted");
    } catch (err) {
      console.warn("⚠️ Error aborting recognizer:", err.message);
    }
    recognizer = null;
    chatState.set({ recognizer: null });
  }
};
