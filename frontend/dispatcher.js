import { transition, States } from "./state.js";

let state = States.OFF;
let onChange = null;

export const dispatcher = {
  dispatch: (event) => {
    const prev = state;
    const next = transition(prev, event);
    if (next !== prev) {
      state = next;
      onChange?.(next, prev, event);
    }
    return state;
  },
  getState: () => state,
  setHook: (fn) => {
    onChange = fn;
  },
};
