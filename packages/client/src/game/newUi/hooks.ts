import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** The current time, updated at the given interval, for clocks that count down. */
export function useNow(intervalMilliseconds: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, intervalMilliseconds);
    return () => {
      clearInterval(interval);
    };
  }, [intervalMilliseconds]);

  return now;
}

/** The size of an element, which changes as the window does. */
export function useElementSize(element: HTMLElement | null): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (element === null) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);

  return size;
}

/** The size of the window, which changes as it is resized. */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }));
  useEffect(() => {
    function onResize() {
      setSize({ width: globalThis.innerWidth, height: globalThis.innerHeight });
    }
    globalThis.addEventListener("resize", onResize);
    return () => {
      globalThis.removeEventListener("resize", onResize);
    };
  }, []);

  return size;
}

/** Whether a media query, such as a window width, matches. It updates as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = globalThis.matchMedia(query);
      media.addEventListener("change", listener);
      return () => {
        media.removeEventListener("change", listener);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia(query).matches,
  );
}
