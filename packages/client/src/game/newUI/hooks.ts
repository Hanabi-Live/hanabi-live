import { useEffect, useState, useSyncExternalStore } from "react";
import type { State } from "../types/State";
import { globals } from "../ui/UIGlobals";
import * as newUIState from "./newUIState";

/**
 * Subscribes to the game's store. The store does not exist until the server sends the "init"
 * message, and it is replaced for every game, so this follows `newUIState.notify`, which runs when
 * the store is created.
 */
function subscribeToGame(listener: () => void): () => void {
  let unsubscribeStore = globals.store?.subscribe(listener);
  const unsubscribeState = newUIState.subscribe(() => {
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
export function useNewUIVersion(): number {
  return useSyncExternalStore(newUIState.subscribe, newUIState.getVersion);
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
