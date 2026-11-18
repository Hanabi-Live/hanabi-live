// "Reduced motion" is an account setting. Each browser caches the last value it received, so that
// the pages that show before the server sends the settings, such as the public pages and the login
// screen, also leave out their animations.

import { settingsChanged } from "./sessionSlice.ts";
import { store } from "./store.ts";

const CACHE_KEY = "reducedMotion";

/** Puts the cached "Reduced motion" setting in the store, until the server sends the settings. */
export function loadCachedReducedMotion(): void {
  let cached = false;
  try {
    cached = localStorage.getItem(CACHE_KEY) !== null;
  } catch {
    // The localStorage API may be unavailable.
  }
  if (cached) {
    store.dispatch(
      settingsChanged({
        ...store.getState().session.settings,
        reducedMotion: true,
      }),
    );
  }
}

/** Caches the "Reduced motion" setting each time that it changes. */
export function cacheReducedMotion(): void {
  let last = store.getState().session.settings.reducedMotion;
  store.subscribe(() => {
    const { reducedMotion } = store.getState().session.settings;
    if (reducedMotion === last) {
      return;
    }
    last = reducedMotion;
    try {
      if (reducedMotion) {
        localStorage.setItem(CACHE_KEY, "true");
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    } catch {
      // The localStorage API may be unavailable.
    }
  });
}
