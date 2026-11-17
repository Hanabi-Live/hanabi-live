// Timings that the development build writes to the console, to find out how slow a change of the
// screen is on a player's own computer. The production build leaves them out.

/**
 * Writes how long a change that an input event started takes to show: until React has made the
 * change, and until the browser has painted it. Call it in the event's handler, after the state
 * changes, so that React's update runs before the first measurement.
 */
export function logInputTiming(label: string, event: Event): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const start = event.timeStamp;
  // React makes a change from a click or a key press in a microtask at the end of the event. This
  // microtask was queued after React's, so it runs after the change.
  queueMicrotask(() => {
    const react = performance.now() - start;
    // The frame after this callback shows the change. A task queued in it runs after that frame.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const painted = performance.now() - start;
        console.info(
          `${label}: React ${react.toFixed(1)} ms, painted after ${painted.toFixed(1)} ms.`,
        );
      }, 0);
    });
  });
}
