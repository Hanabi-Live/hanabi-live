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
export function observeStore<S, A extends Action, T>(
  store: Store<S, A>,
  subscriptions: ReadonlyArray<Subscription<S, T>>,
): Unsubscribe {
  let currentState: S;
  let isUpdating = false;

  function handleChange() {
    if (isUpdating) {
      // A listener dispatched another action. Finish this update before rendering the next one.
      return;
    }

    isUpdating = true;
    try {
      let nextState = store.getState();
      while (currentState !== nextState) {
        const previousState = currentState;
        const snapshot = nextState;

        // If the path changed, call the function.
        const filteredSubscriptions = subscriptions.filter((subscription) => {
          const nextValue = subscription.select(snapshot);
          if (nextValue === undefined) {
            // The selector wants to skip this one.
            return false;
          }

          if (previousState === undefined) {
            // Initializing, always fire all.
            return true;
          }

          // Fire if any part of it changed.
          return !equal(nextValue, subscription.select(previousState));
        });

        for (const subscription of filteredSubscriptions) {
          // `previousState` is undefined during initialization.
          const previousValue =
            previousState === undefined
              ? undefined
              : subscription.select(previousState);
          subscription.onChange(subscription.select(snapshot)!, previousValue);
        }

        // Commit only after every callback succeeds, then process any nested dispatch.
        currentState = snapshot;
        nextState = store.getState();
      }
    } finally {
      isUpdating = false;
    }
  }

  const unsubscribe = store.subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
