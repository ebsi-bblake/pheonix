export const States = {
  OFF: "off",
  STANDBY: "on-standby",
  LISTENING: "on-listening",
  RESPONSE: "on-response",
};

export const Events = {
  START: "Start",
  WAKE: "WakeHeard",
  COMMAND: "CommandHeard",
  RESPONSE: "ResponsePlaying",
  CANCEL: "Cancel",
  ERROR: "Error",
  FINISH: "Finish",
  EXIT: "Exit",
};

export const transition = (state, event) => {
  switch (state) {
    case States.OFF:
      return event.type === Events.START ? States.STANDBY : state;
    case States.STANDBY:
      if (event.type === Events.WAKE) return States.LISTENING;
      if (event.type === Events.EXIT) return States.OFF;
      return state;
    case States.LISTENING:
      return event.type === Events.COMMAND ? States.RESPONSE : state;
    case States.RESPONSE:
      if (event.type === Events.CANCEL) return States.STANDBY;
      if (event.type === Events.FINISH) return States.STANDBY;
      if (event.type === Events.ERROR) return States.OFF;
      if (event.type === Events.EXIT) return States.OFF;
      return state;
    default:
      return state;
  }
};

export const ChatStateMonoid = {
  empty: {
    recognizer: null,
    audio: null,
    cancelRequested: false,
    keepAliveStream: null,
    keepAliveContext: null,
    wakeLoopLast: 0,
    wakeLoopRunning: false,
    playbackResolve: null,
  },
  concat: (a, b) => ({ ...a, ...b }),
};

let currentState = ChatStateMonoid.empty;

export const chatState = {
  get: () => currentState,
  set: (updates) => {
    currentState = ChatStateMonoid.concat(currentState, updates);
  },
  reset: () => {
    currentState = ChatStateMonoid.empty;
  },
};
