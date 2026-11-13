import equal from "fast-deep-equal";
import type { StateSource } from "../../gameStateSource.ts";

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

/**
 * Observes the parts of a state that the subscriptions select, and calls their listeners when they
 * change. Nothing fires while the source has no state.
 */
export function observeStore<S, T>(
  source: StateSource<S>,
  subscriptions: ReadonlyArray<Subscription<S, T>>,
): () => void {
  let currentState: S | undefined;
  let isUpdating = false;

  function handleChange() {
    if (isUpdating) {
      // A listener dispatched another action. Finish this update before rendering the next one.
      return;
    }

    isUpdating = true;
    try {
      let nextState = source.getState();
      while (nextState !== undefined && currentState !== nextState) {
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
        nextState = source.getState();
      }
    } finally {
      isUpdating = false;
    }
  }

  const unsubscribe = source.subscribe(handleChange);
  handleChange();
  return unsubscribe;
}
