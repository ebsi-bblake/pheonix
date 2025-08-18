export const States = {
  OFF: "off",
  INITIALIZING: "initializing",
  STANDBY: "standby",
  LISTENING: "listening",
  RESPONSE: "response",
};

export const Events = {
  START: "Start",
  LAUNCHED: "Launched",
  PRESS: "ButtonDown",
  RELEASE: "ButtonUp",
  COMMAND: "Command",
  FINISH: "Finish",
  EXIT: "Exit",
  ERROR: "Error",
};

export const transition = (state, event) => {
  switch (state) {
    case States.OFF:
      if (event.type === Events.START) return States.INITIALIZING;
      return state;

    case States.INITIALIZING:
      if (event.type === Events.LAUNCHED) return States.STANDBY;
      if (event.type === Events.ERROR) return States.OFF;
      if (event.type === Events.EXIT) return States.OFF;
      return state;

    case States.STANDBY:
      if (event.type === Events.PRESS) return States.LISTENING;
      if (event.type === Events.EXIT) return States.OFF;
      return state;

    case States.LISTENING:
      if (event.type === Events.RELEASE) return States.RESPONSE;
      if (event.type === Events.EXIT) return States.OFF;
      return state;

    case States.RESPONSE:
      if (event.type === Events.FINISH) return States.STANDBY;
      if (event.type === Events.EXIT) return States.OFF;
      if (event.type === Events.PRESS) return States.LISTENING; // Interrupt
      return state;

    default:
      return state;
  }
};

// FSM Dispatcher for UI state transitions
let currentUIState = States.OFF;
const hooks = [];

export const dispatcher = {
  getState: () => currentUIState,
  dispatch: (event) => {
    const prev = currentUIState;
    const next = transition(prev, event);
    if (next !== prev) {
      currentUIState = next;
      // notify all hooks
      for (const fn of hooks) {
        try {
          fn(next, prev, event);
        } catch (e) {
          console.warn("hook error:", e);
        }
      }
    }
    return currentUIState;
  },
  /**
   * Back-compat: keep setHook but make it additive (don’t replace).
   * This avoids touching ui.js and main.js.
   */
  setHook: (fn) => {
    if (typeof fn === "function") hooks.push(fn);
  },
  /**
   * Optional: explicit additive API if you want to use it later.
   */
  addHook: (fn) => {
    if (typeof fn === "function") hooks.push(fn);
  },
};

// Chat State: holds playback/chat info
export const ChatStateMonoid = {
  empty: {
    audio: null,
    cancelRequested: false,
    playbackResolve: null,
    playbackToken: 0,
    recognizer: null,
  },
  concat: (a, b) => ({ ...a, ...b }),
};

let currentChatState = ChatStateMonoid.empty;

export const chatState = {
  get: () => currentChatState,
  set: (updates) => {
    currentChatState = ChatStateMonoid.concat(currentChatState, updates);
  },
  reset: () => {
    currentChatState = ChatStateMonoid.empty;
  },
};
