import HID from "node-hid";
import readline from "readline";

export const startDelcomButtonWatcher = (broadcast) => {
  // ---- Try Delcom HID first ----
  try {
    const deviceInfo = HID.devices().find(
      (d) =>
        d.vendorId === 0x0fc5 &&
        d.productId === 0xb080 &&
        d.usagePage === 65280,
    );

    if (deviceInfo) {
      const device = new HID.HID(deviceInfo.path);
      console.info("✅ Delcom button opened:", deviceInfo.path);

      let lastState = false;

      const loop = () => {
        device.read((err, data) => {
          if (err) {
            console.error("⚠️ Delcom read error:", err?.message || err);
            return setTimeout(loop, 50);
          }

          const isPressed = data && data[3] !== 0x00;

          if (isPressed && !lastState) {
            broadcast("buttonDown");
          } else if (!isPressed && lastState) {
            broadcast("buttonUp");
          }

          lastState = !!isPressed;
          loop();
        });
      };

      loop();
      return { mode: "delcom" };
    }
  } catch (e) {
    console.warn(
      "⚠️ HID init failed, falling back to keyboard if possible.",
      e?.message || e,
    );
  }

  // ---- Keyboard fallback (TTY only) ----
  const canUseTTY =
    process.stdin &&
    process.stdin.isTTY &&
    typeof process.stdin.setRawMode === "function";

  if (!canUseTTY) {
    console.warn(
      "⚠️ Delcom not found and no TTY available; keyboard fallback disabled. Backend will run without button events.",
    );
    return { mode: "none" };
  }

  console.warn(
    "⚠️ Delcom not found, using keyboard fallback (Space toggles press/release).",
  );

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let pressed = false;

  const onKeypress = (_str, key = {}) => {
    // Ctrl+C exits
    if (key.sequence === "\u0003" || (key.ctrl && key.name === "c")) {
      cleanup();
      process.exit(0);
      return;
    }

    // Toggle press/release on space
    if (key.name === "space" && !key.meta && !key.ctrl && !key.shift) {
      if (!pressed) {
        pressed = true;
        broadcast("buttonDown");
      } else {
        pressed = false;
        broadcast("buttonUp");
      }
    }
  };

  const cleanup = () => {
    try {
      process.stdin.off("keypress", onKeypress);
    } catch { }
    try {
      process.stdin.setRawMode(false);
    } catch { }
    try {
      process.stdin.pause();
    } catch { }
  };

  process.stdin.on("keypress", onKeypress);

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  return { mode: "keyboard" };
};
