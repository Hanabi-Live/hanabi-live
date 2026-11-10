import equal from "fast-deep-equal";
import type { Action, Store, Unsubscribe } from "redux";

/** A selector returns this to skip its listener. Any other value, including undefined, fires it. */
export const SKIP = Symbol("skip");

export type Selector<T, U> = (s: T) => U | typeof SKIP;

/** `previousValue` is undefined while the store initializes, which `initializing` reports. */
export type Listener<U> = (
  currentValue: U,
  previousValue: U | undefined,
  initializing: boolean,
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
          if (nextValue === SKIP) {
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
          const initializing = previousState === undefined;
          const previousValue = initializing
            ? undefined
            : subscription.select(previousState);
          subscription.onChange(
            subscription.select(snapshot) as T,
            previousValue === SKIP ? undefined : previousValue,
            initializing,
          );
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
