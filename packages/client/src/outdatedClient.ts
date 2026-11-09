// The server rejects clients from a different release. Reloading the page fetches the current
// client, since its bundle URL carries the release version.

import {
  OUTDATED_CLIENT_CODE,
  VERSION,
  apiErrorSchema,
} from "@hanabi-live/data";

/** Remembers the client version that last reloaded, so that a reload that did not help stops. */
const RELOADED_VERSION_KEY = "outdatedClientReloadedVersion";

/**
 * Reloads the page to get the server's client version. Returns false if this client already
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
  globalThis.location.reload();
  return true;
}

/** Whether an HTTP error response rejects this client's version. */
export async function isOutdatedClientResponse(
  response: Response,
): Promise<boolean> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.clone().json());
    return parsed.success && parsed.data.code === OUTDATED_CLIENT_CODE;
  } catch {
    return false;
  }
}
