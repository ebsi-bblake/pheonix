import HID from "node-hid";

export const startDelcomButtonWatcher = (broadcast) => {
  const deviceInfo = HID.devices().find(
    (d) =>
      d.vendorId === 0x0fc5 && d.productId === 0xb080 && d.usagePage === 65280,
  );

  if (deviceInfo) {
    const device = new HID.HID(deviceInfo.path);
    console.info("✅ Delcom button opened:", deviceInfo.path);

    let lastState = false;

    const loop = () => {
      device.read((err, data) => {
        if (err) {
          console.error("⚠️ Delcom read error:", err);
          return setTimeout(loop, 50);
        }

        const isPressed = data[3] !== 0x00;

        if (isPressed && !lastState) {
          broadcast("buttonDown");
        } else if (!isPressed && lastState) {
          broadcast("buttonUp");
        }

        lastState = isPressed;
        loop();
      });
    };

    loop();
  } else {
    console.warn(
      "⚠️ Delcom button not found, using keyboard fallback (Spacebar)",
    );

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let pressed = false;

    process.stdin.on("data", (key) => {
      if (key === " ") {
        if (!pressed) {
          pressed = true;
          broadcast("buttonDown");
        }
      } else if (key === "\u0003") {
        process.exit(); // Ctrl+C
      }
    });

    process.stdin.on("keypress", (_, key) => {
      if (key && key.name === "space" && !key.ctrl && !key.meta && !key.shift) {
        if (pressed) {
          pressed = false;
          broadcast("buttonUp");
        }
      }
    });
  }
};
