// Theme management for dark mode. The preference is stored in localStorage (client-only, not synced
// to the server). The default is light mode.

const STORAGE_KEY = "darkMode";

/** Read the stored preference. Returns null if not set. (Exported for testing.) */
export function getStoredPreference(): boolean | "system" | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    if (value === "system") {
      return "system";
    }
  } catch {
    // localStorage may be unavailable (e.g. private browsing, disabled).
  }
  return null;
}

/** Read the system preference. */
function getSystemPreference(): boolean {
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Determine the effective dark mode state. (Exported for testing.) */
export function isDarkMode(): boolean {
  const stored = getStoredPreference();
  if (typeof stored === "boolean") {
    return stored;
  }
  return stored === "system" && getSystemPreference();
}

/** Apply the current theme to the document. */
function applyTheme() {
  const dark = isDarkMode();
  if (dark) {
    document.documentElement.dataset["theme"] = "dark";
  } else {
    delete document.documentElement.dataset["theme"];
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

/** Set the dark mode preference. */
function setDarkMode(preference: boolean | "system") {
  try {
    localStorage.setItem(STORAGE_KEY, String(preference));
  } catch {
    // The localStorage API may be unavailable.
  }
  applyTheme();
  document.dispatchEvent(new Event("theme_change"));
}

/** Called on page load to wire up the settings dropdown. */
export function init(): void {
  applyTheme();

  // Listen for OS theme changes (only relevant when the system preference is selected).
  globalThis
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const stored = getStoredPreference();
      if (stored === "system") {
        applyTheme();
        document.dispatchEvent(new Event("theme_change"));
      }
    });

  // Wire up the settings dropdown if it exists on the page.
  const select = document.querySelector<HTMLSelectElement>("#darkMode");
  if (select !== null) {
    const stored = getStoredPreference();
    if (stored === true) {
      select.value = "true";
    } else if (stored === "system") {
      select.value = "system";
    } else {
      select.value = "false";
    }
    select.addEventListener("change", () => {
      const { value } = select;
      if (value === "true") {
        setDarkMode(true);
      } else if (value === "false") {
        setDarkMode(false);
      } else {
        setDarkMode("system");
      }
    });
  }
}
