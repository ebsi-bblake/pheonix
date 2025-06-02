import { transition, States } from "./state.js";

export const useDispatcher = (onStateChange) => {
  let state = States.OFF;

  const dispatch = (event) => {
    const prevState = state;
    const nextState = transition(prevState, event);
    if (nextState !== prevState) {
      state = nextState;
      onStateChange?.(nextState, prevState, event);
    }
    return state;
  };

  const getState = () => state;

  return { dispatch, getState };
};
