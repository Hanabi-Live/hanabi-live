import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import * as newUiState from "./newUiState.ts";

/**
 * Subscribes to the game's store. The store does not exist until the server sends the "gameInit"
 * message, and it is replaced for every game, so this follows `newUiState.notify`, which runs when
 * the store is created.
 */
function subscribeToGame(listener: () => void): () => void {
  let unsubscribeStore = globals.store?.subscribe(listener);
  const unsubscribeState = newUiState.subscribe(() => {
    unsubscribeStore?.();
    unsubscribeStore = globals.store?.subscribe(listener);
    listener();
  });

  return () => {
    unsubscribeStore?.();
    unsubscribeState();
  };
}

function getGameState(): State | undefined {
  return globals.store?.getState();
}

/** The game's state, or `undefined` before the server has sent enough to draw the game. */
export function useGameState(): State | undefined {
  return useSyncExternalStore(subscribeToGame, getGameState);
}

/** Renders again whenever the screen's own state outside of the store changes. */
export function useNewUiVersion(): number {
  return useSyncExternalStore(newUiState.subscribe, newUiState.getVersion);
}

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
