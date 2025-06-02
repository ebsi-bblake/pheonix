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
};

export const transition = (state, event) => {
  switch (state) {
    case States.OFF:
      return event.type === Events.START ? States.STANDBY : state;
    case States.STANDBY:
      return event.type === Events.WAKE ? States.LISTENING : state;
    case States.LISTENING:
      return event.type === Events.COMMAND ? States.RESPONSE : state;
    case States.RESPONSE:
      if (event.type === Events.CANCEL) return States.STANDBY;
      if (event.type === Events.FINISH) return States.STANDBY;
      if (event.type === Events.ERROR) return States.OFF;
      return state;
    default:
      return state;
  }
};

export const StateMonoid = {
  empty: States.OFF,
  concat: (_, b) => b,
};

export const createChatState = () => {
  let state = {
    recognizer: null,
    audio: null,
    cancelRequested: false,
    keepAliveStream: null,
    keepAliveContext: null,
  };

  const set = (updates) => {
    state = { ...state, ...updates };
  };

  const get = () => state;

  const reset = () => {
    state = {
      recognizer: null,
      audio: null,
      cancelRequested: false,
      keepAliveStream: null,
      keepAliveContext: null,
    };
  };

  return { set, get, reset };
};
