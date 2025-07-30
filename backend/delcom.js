import HID from "node-hid";

export const startDelcomButtonWatcher = (broadcast) => {
  const deviceInfo = HID.devices().find(
    (d) =>
      d.vendorId === 0x0fc5 && d.productId === 0xb080 && d.usagePage === 65280,
  );

  if (!deviceInfo) throw new Error("Delcom device not found.");

  const device = new HID.HID(deviceInfo.path);
  console.log("✅ Delcom button opened:", deviceInfo.path);

  let lastState = false;

  const loop = () => {
    device.read((err, data) => {
      if (err) return setTimeout(loop, 50);

      const isPressed = data[3] !== 0x00;

      if (isPressed && !lastState) {
        broadcast("buttonDown");
      }

      if (!isPressed && lastState) {
        broadcast("buttonUp");
      }

      lastState = isPressed;
      loop();
    });
  };

  loop();
};
