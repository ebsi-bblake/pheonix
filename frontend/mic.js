import { chatState } from "./state.js";

export const startMicKeepAlive = async () => {
  if (chatState.get().keepAliveStream) return;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  await context.audioWorklet.addModule("/noop-processor.js");
  const dummy = new AudioWorkletNode(context, "noop-processor");
  const source = context.createMediaStreamSource(stream);

  source.connect(dummy).connect(context.destination);

  chatState.set({
    keepAliveStream: stream,
    keepAliveContext: context,
  });
};

export const stopMicKeepAlive = () => {
  const { keepAliveStream, keepAliveContext } = chatState.get();

  keepAliveStream?.getTracks().forEach((t) => t.stop());
  keepAliveContext?.close();

  chatState.set({
    keepAliveStream: null,
    keepAliveContext: null,
  });
};
