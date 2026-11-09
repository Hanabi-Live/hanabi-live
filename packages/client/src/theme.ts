// Dark mode is an account setting. Each browser caches the last value it received so that
// "server/templates/theme-init.html" can apply the theme before the page renders.

/** The cache key and value must match "server/templates/theme-init.html". */
const CACHE_KEY = "theme";
const DARK = "dark";

/** Before dark mode was an account setting, each browser stored its own choice under this key. */
const LEGACY_STORAGE_KEY = "darkMode";

/** Whether the system prefers a dark theme. A new account starts with this as its setting. */
export function systemPrefersDark(): boolean {
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies the dark mode setting and caches it for the next page load. */
export function setDarkMode(dark: boolean): void {
  try {
    if (dark) {
      localStorage.setItem(CACHE_KEY, DARK);
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // The localStorage API may be unavailable.
  }

  const { dataset } = document.documentElement;
  if ((dataset["theme"] === DARK) === dark) {
    return;
  }
  if (dark) {
    dataset["theme"] = DARK;
  } else {
    delete dataset["theme"];
  }
  document.dispatchEvent(new Event("theme_change"));
}

/**
 * Removes the dark mode choice that this browser stored before dark mode was an account setting,
 * returning whether that choice was dark.
 */
export function takeLegacyDarkMode(): boolean {
  try {
    const value = localStorage.getItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return value === "true" || (value === "system" && systemPrefersDark());
  } catch {
    // The localStorage API may be unavailable.
    return false;
  }
}

// ----------------------
// Canvas color palette
// ----------------------

// The game UI is drawn on a Konva canvas, so the normal CSS theming does not apply. The palette
// colors are defined as CSS custom properties (light values in "hanabi.css", dark values in
// "dark.css") and read from the computed style, so that the canvas and the CSS share a single
// source of truth. The palette is re-evaluated on every draw, and the game UI is rebuilt on the
// "theme_change" event so that theme changes are picked up mid-game.

interface CanvasColors {
  /** The turn numbers in the full action log. */
  readonly actionLogNumber: string;
  /** The large current-player text (e.g. "It is Bob's turn"). */
  readonly currentPlayerText: string;
  /** The shared replay shuttle. */
  readonly replayShuttle: string;
  /** The pause / restart overlay rectangles. */
  readonly surfaceArea: string;
  /** The outline of the loading screen labels. */
  readonly loadingLabelStroke: string;
}

/** Reads a CSS custom property from the document root. */
function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/** Get the canvas colors for the currently active theme. */
export function getCanvasColors(): CanvasColors {
  return {
    actionLogNumber: getCSSVariable("--canvas-action-log-number"),
    currentPlayerText: getCSSVariable("--canvas-current-player-text"),
    replayShuttle: getCSSVariable("--canvas-replay-shuttle"),
    surfaceArea: getCSSVariable("--canvas-surface-area"),
    loadingLabelStroke: getCSSVariable("--canvas-loading-label-stroke"),
  };
}
