// Dark mode is an account setting. Each browser caches the last value it received, so that
// "server/templates/theme-init.html" can apply the theme before the page renders.

/** The cache key and value must match "server/templates/theme-init.html". */
const CACHE_KEY = "theme";
const DARK = "dark";

/** Applies the dark mode setting, and caches it for the next page load. */
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
  if (dark) {
    dataset["theme"] = DARK;
  } else {
    delete dataset["theme"];
  }
}
