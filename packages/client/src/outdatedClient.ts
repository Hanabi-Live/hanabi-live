// The server rejects clients from a different release. Reloading the page fetches the current
// client, since its bundle URL carries the release version.

import { VERSION } from "@hanabi-live/data";

/** Remembers the client version that last reloaded, so that a reload that did not help stops. */
const RELOADED_VERSION_KEY = "outdatedClientReloadedVersion";

/**
 * After a deploy, every open client is rejected as soon as the new server starts. Each one waits a
 * random time up to this before it reloads, so that their reloads do not all reach the new server
 * at once.
 */
const MAX_RELOAD_DELAY_MILLISECONDS = 2000;

/**
 * Soon reloads the page to get the server's client version. Returns false if this client already
 * reloaded for that reason (such as when something serves a stale page), so the caller can explain
 * the problem instead.
 */
export function reloadOutdatedClient(): boolean {
  try {
    if (sessionStorage.getItem(RELOADED_VERSION_KEY) === VERSION) {
      return false;
    }
    sessionStorage.setItem(RELOADED_VERSION_KEY, VERSION);
  } catch {
    // Without storage, a reload could repeat forever.
    return false;
  }
  setTimeout(() => {
    globalThis.location.reload();
  }, Math.random() * MAX_RELOAD_DELAY_MILLISECONDS);
  return true;
}
