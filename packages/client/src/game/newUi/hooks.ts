import type { RefObject } from "react";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { onEscapeKey } from "./escapeKey.ts";

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
  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });
  useEffect(() => {
    if (element === null) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
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
      setSize({
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      });
    }
    globalThis.addEventListener("resize", onResize);
    return () => {
      globalThis.removeEventListener("resize", onResize);
    };
  }, []);

  return size;
}

/**
 * Window widths at or below which the game screen makes room: first chat covers the table when
 * open, and then the columns stack and the page scrolls (the phone layout, see the "phone"
 * variant). Before that, the parts beside the hands give up room when the hands need it (see
 * "getWideLayoutRoom"). The first is a breakpoint from "public/css/tokens.css".
 */
export const CHAT_OVERLAY_WIDTH_QUERY = "(max-width: 1280px)";
export const STACKED_WIDTH_QUERY = "(max-width: 959px)";

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

/** Closes an open menu when the player clicks outside of its container or presses Escape. */
export function useCloseOnOutsideClick(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  setOpen: (open: boolean) => void,
): void {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function onPointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node
        && containerRef.current?.contains(event.target) !== true
      ) {
        setOpen(false);
      }
    }

    const stopEscape = onEscapeKey(() => {
      setOpen(false);
    });
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      stopEscape();
    };
  }, [open, containerRef, setOpen]);
}
