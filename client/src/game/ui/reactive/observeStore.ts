import equal from 'fast-deep-equal';
import { Store, Action } from 'redux';

export type Selector<T, U> = (s: T) => U | undefined;
export type Listener<U> = (prop: U) => void;
export type Subscription<T, U> = {
  select: Selector<T, U>;
  onChange: Listener<U>;
};

// Observes a property of type T on a Store<S, A> and calls a listener function when it changes
export default function observeStore<S, A extends Action<any>, T>(
  store: Store<S, A>,
  subscriptions: Array<Subscription<S, T>>,
) {
  let currentState: S;

  function handleChange() {
    const nextState = store.getState();
    if (currentState === nextState) {
      // No change
      return;
    }

    // If the path changed, call the function
    subscriptions
      .filter((s) => {
        const nextValue = s.select(nextState);
        if (nextValue === undefined) {
          // The selector wants to skip this one
          return false;
        }
        if (currentState === undefined) {
          // Initializing, always fire all
          return true;
        }
        // Fire if any part of it changed
        return !equal(nextValue, s.select(currentState));
      })
      .forEach((s) => s.onChange(s.select(nextState)!));

    currentState = nextState;
  }

  const unsubscribe = store.subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
