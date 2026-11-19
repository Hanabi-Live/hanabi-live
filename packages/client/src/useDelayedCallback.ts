// Calls a callback once a run of calls pauses, such as when the player stops typing in a filter
// box.

import { useEffect, useRef } from "react";

/** How long to wait after the last keystroke in a filter box before applying it. */
const FILTER_DELAY_MILLISECONDS = 300;

/**
 * Returns a function that calls `callback` with its value after `delay` milliseconds, unless it is
 * called again first. A delay of 0 calls the callback soon, and still cancels a waiting call. A
 * waiting call is dropped when the component goes away.
 */
export function useDelayedCallback<T>(
  callback: (value: T) => void,
): (value: T, delay?: number) => void {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (value, delay = FILTER_DELAY_MILLISECONDS) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      callback(value);
    }, delay);
  };
}
