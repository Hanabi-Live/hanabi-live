// The state of the redesigned game screen (the "New UI" setting) that lives outside of React, so
// that the classic game code can read and change it without importing any components.

let active = false;
let chatOpen = true;
let version = 0;
const listeners = new Set<() => void>();

/** Whether the redesigned game screen is showing the current game. */
export function isActive(): boolean {
  return active;
}

export function setActive(isNowActive: boolean): void {
  active = isNowActive;
  notify();
}

/** Whether the chat panel is open, as opposed to collapsed into a thin rail. */
export function isChatOpen(): boolean {
  return chatOpen;
}

export function setChatOpen(open: boolean): void {
  chatOpen = open;
  notify();
}

/**
 * Calls the listener whenever something that the game screen shows outside of the store changes.
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever `notify` runs, so that React can tell that it must render again. */
export function getVersion(): number {
  return version;
}

/**
 * Tells the game screen to render again. The classic code calls this when it changes something that
 * is not in the store, such as the unread chat count or the store itself being created.
 */
export function notify(): void {
  version++;
  for (const listener of listeners) {
    listener();
  }
}
