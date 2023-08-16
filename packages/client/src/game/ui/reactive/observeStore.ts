import equal from "fast-deep-equal";
import type { Action, Store, Unsubscribe } from "redux";

export type Selector<T, U> = (s: T) => U | undefined;
export type Listener<U> = (
  currentValue: U,
  previousValue: U | undefined,
) => void;
export interface Subscription<T, U> {
  select: Selector<T, U>;
  onChange: Listener<U>;
}

// Observes a property of type T on a Store<S, A> and calls a listener function when it changes.
export function observeStore<S, A extends Action<unknown>, T>(
  store: Store<S, A>,
  subscriptions: Array<Subscription<S, T>>,
): Unsubscribe {
  let currentState: S;

  function handleChange() {
    const nextState = store.getState();
    if (currentState === nextState) {
      // No change
      return;
    }

    // If the path changed, call the function.
    const filteredSubscriptions = subscriptions.filter((subscription) => {
      const nextValue = subscription.select(nextState);
      if (nextValue === undefined) {
        // The selector wants to skip this one.
        return false;
      }
      if (currentState === undefined) {
        // Initializing, always fire all.
        return true;
      }
      // Fire if any part of it changed.
      return !equal(nextValue, subscription.select(currentState));
    });
    for (const subscription of filteredSubscriptions) {
      // `currentState` is undefined during initialization.
      const currentValue =
        currentState !== undefined
          ? subscription.select(currentState)
          : undefined;
      subscription.onChange(subscription.select(nextState)!, currentValue);
    }

    currentState = nextState;
  }

  const unsubscribe = store.subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
