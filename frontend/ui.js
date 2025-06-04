import { States } from "./state.js";

export const updateUI = (newState) => {
  const micBtn = document.getElementById("mic-btn");
  console.log(micBtn.classList);
  document.body.classList.toggle("listening", newState === States.LISTENING);
  micBtn.classList.toggle(
    "active",
    newState !== States.OFF && newState !== States.RESPONSE,
  );
  micBtn.classList.toggle("response", newState === States.RESPONSE);
};
