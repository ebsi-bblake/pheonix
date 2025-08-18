// frontend/audio-worklet.js
// Minimal audio pipeline for streamed PCM -> AudioWorklet with resampling.
// Exports: initializeAudio, ensureRunning, postPCMChunk, interruptAudio, isInitialized

let audioContext = null;
let workletNode = null;
let initialized = false;

// ---------- Public helpers ----------
export async function initializeAudio() {
  if (initialized) return true;

  // Create context first so we know the destination sampleRate
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  console.info(
    "🔊 AudioContext created",
    JSON.stringify({ sampleRate: audioContext.sampleRate }),
  );

  // Build the worklet from an inline blob
  const workletURL = URL.createObjectURL(
    new Blob(
      [
        `
/**
 * AudioConcatProcessor
 * Accepts Int16 PCM at arbitrary sample rates and resamples to the context's rate.
 * Messages:
 *  - {type:'chunk', chunk:{ buffer:ArrayBuffer(Int16), sampleRate:number, markIndex:number }}
 *  - {type:'interrupt'}
 * Outputs mono audio.
 */
class AudioConcatProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];           // [{ data:Int16Array, rate:number, mark:number }]
    this.active = null;        // current { data, rate, mark, pos }
    this.isPlaying = false;

    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'chunk' && msg.chunk?.buffer) {
        const arr = new Int16Array(msg.chunk.buffer);
        const rate = Number(msg.chunk.sampleRate) || 24000; // default if missing
        const mark = msg.chunk.markIndex ?? 0;
        this.queue.push({ data: arr, rate, mark, pos: 0 });
      } else if (msg.type === 'interrupt') {
        this.queue.length = 0;
        this.active = null;
        if (this.isPlaying) {
          this.isPlaying = false;
          this.port.postMessage({ type: 'finished' });
        }
      }
    };
  }

  _ensureActive() {
    if (!this.active) {
      if (this.queue.length === 0) {
        if (this.isPlaying) {
          this.isPlaying = false;
          this.port.postMessage({ type: 'finished' });
        }
        return false;
      }
      this.active = this.queue.shift();
      this.active.pos = 0;
      if (!this.isPlaying) {
        this.isPlaying = true;
        this.port.postMessage({ type: 'playing' });
      }
    }
    return true;
  }

  /**
   * Naive resampler per sample using linear interpolation.
   * in: Int16 at srcRate
   * out: write into output[] at processorRate (audioContext sample rate)
   */
  _renderResampled(output) {
    const destRate = sampleRate; // context/output rate
    while (true) {
      if (!this._ensureActive()) {
        // fill remaining with silence
        for (let i = 0; i < output.length; i++) output[i] = 0;
        return;
      }

      const src = this.active.data;
      const srcRate = this.active.rate;
      if (srcRate === destRate) {
        // Fast path: no resample
        let i = 0;
        for (; i < output.length && this.active.pos < src.length; i++, this.active.pos++) {
          output[i] = src[this.active.pos] / 32768;
        }
        // If we finished the source, swap to next and continue filling remainder.
        if (this.active.pos >= src.length) {
          this.port.postMessage({ type: 'mark_update', mark: this.active.mark });
          this.active = null;
          // continue loop to load next or fill silence
          // Fill remainder with next chunks (tail recursion via while)
          if (i < output.length) {
            // fill the rest by re-looping
            output = output.subarray(i);
            continue;
          }
        }
        return; // fully filled
      } else {
        // Linear resampling
        const ratio = srcRate / destRate; // src samples per 1 out sample
        let outIndex = 0;
        while (outIndex < output.length) {
          // Where we are in source in float index
          const srcFloatIndex = this.active.pos;
          const srcIndex = Math.floor(srcFloatIndex);
          const frac = srcFloatIndex - srcIndex;

          if (srcIndex >= src.length - 1) {
            // Last sample: output it then advance chunk
            const s = src[src.length - 1] / 32768;
            output[outIndex++] = s;
            this.port.postMessage({ type: 'mark_update', mark: this.active.mark });
            this.active = null;
            break; // break inner loop to load next chunk
          } else {
            const s1 = src[srcIndex] / 32768;
            const s2 = src[srcIndex + 1] / 32768;
            const val = s1 + (s2 - s1) * frac;
            output[outIndex++] = val;
            this.active.pos += ratio;
          }
        }

        // If we filled all output but still in same chunk, return.
        if (outIndex >= output.length && this.active) return;
        // Else we exhausted current chunk; loop to pick next chunk and fill remainder.
        if (!this.active) {
          // Continue outer while to either pick next or fill silence
          continue;
        }
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    this._renderResampled(out);

    // If queue is empty and nothing is active, ask host for next mark (optional protocol)
    if (!this.active && this.queue.length === 0) {
      this.port.postMessage({ type: 'send_mark' });
    }
    return true;
  }
}

registerProcessor('audio-concat-processor', AudioConcatProcessor);
        `,
      ],
      { type: "application/javascript" },
    ),
  );

  await audioContext.audioWorklet.addModule(workletURL);
  URL.revokeObjectURL(workletURL);

  workletNode = new AudioWorkletNode(audioContext, "audio-concat-processor");
  workletNode.connect(audioContext.destination);

  workletNode.port.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.type === "playing") console.debug("🎧 Worklet: playing");
    if (msg.type === "finished") console.debug("🏁 Worklet: finished");
    if (msg.type === "mark_update") console.debug("🔖 Worklet mark:", msg.mark);
    if (msg.type === "send_mark")
      console.debug("📩 Worklet requested next mark");
  };

  initialized = true;
  return true;
}

export async function ensureRunning() {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
      console.debug("🔊 AudioContext resumed (ensureRunning)");
    } catch (e) {
      console.warn("AudioContext resume failed:", e);
    }
  }
}

export function postPCMChunk(arrayBuffer, sampleRate, markIndex) {
  if (!initialized || !workletNode) throw new Error("worklet not initialized");
  // Transfer the ArrayBuffer into the worklet (zero-copy)
  workletNode.port.postMessage(
    { type: "chunk", chunk: { buffer: arrayBuffer, sampleRate, markIndex } },
    [arrayBuffer],
  );
}

export function interruptAudio() {
  if (!initialized || !workletNode) return;
  workletNode.port.postMessage({ type: "interrupt" });
}

export function isInitialized() {
  return initialized;
}
