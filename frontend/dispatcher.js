import { States, transition } from "./state.js";

const FSMMonoid = {
  empty: States.OFF,
  concat: (prev, event) => transition(prev, event),
};

let state = FSMMonoid.empty;
let onChange = null;

export const dispatcher = {
  dispatch: (event) => {
    const prev = state;
    const next = FSMMonoid.concat(prev, event);
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
