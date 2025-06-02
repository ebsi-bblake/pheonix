class NoopProcessor extends AudioWorkletProcessor {
  process() {
    return true; // keep node alive
  }
}
registerProcessor("noop-processor", NoopProcessor);
