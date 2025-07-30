export const States = {
  OFF: "off",
  STANDBY: "standby",
  LISTENING: "listening",
  RESPONSE: "response",
};

export const Events = {
  START: "Start",
  PRESS: "ButtonDown",
  RELEASE: "ButtonUp",
  FINISH: "Finish",
  EXIT: "Exit",
};

export const transition = (state, event) => {
  switch (state) {
    case States.OFF:
      if (event.type === Events.START) return States.STANDBY;
      return state;
    case States.STANDBY:
      if (event.type === Events.PRESS) return States.LISTENING;
      if (event.type === Events.EXIT) return States.OFF;
      return state;
    case States.LISTENING:
      if (event.type === Events.RELEASE) return States.RESPONSE;
      return state;
    case States.RESPONSE:
      if (event.type === Events.FINISH) return States.STANDBY;
      if (event.type === Events.EXIT) return States.OFF;
      return state;
    default:
      return state;
  }
};

// FSM Dispatcher for UI state transitions
let currentUIState = States.OFF;

export const dispatcher = {
  getState: () => currentUIState,
  dispatch: (event) => {
    const prev = currentUIState;
    const next = transition(prev, event);
    if (next !== prev) {
      currentUIState = next;
      dispatcher.onChange?.(next, prev, event);
    }
    return currentUIState;
  },
  setHook: (fn) => {
    dispatcher.onChange = fn;
  },
};

// Chat State: holds playback/chat info
export const ChatStateMonoid = {
  empty: {
    audio: null,
    cancelRequested: false,
    playbackResolve: null,
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
