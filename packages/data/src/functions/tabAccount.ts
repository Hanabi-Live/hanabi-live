import { loginResponseSchema } from "../generated/protocol.ts";

// Each tab remembers the account it signed in to, so that reloading or reconnecting does not switch
// it to the account most recently signed in to in another tab. New tabs use that latest account.

const STORAGE_KEY = "hanabi-account";

export function getTabAccount(): number | undefined {
  try {
    const value = Number(sessionStorage.getItem(STORAGE_KEY));
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  } catch {
    // The sessionStorage API may be unavailable.
    return undefined;
  }
}

export function setTabAccount(userID: number): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(userID));
  } catch {
    // Without sessionStorage, the tab uses the latest account like before.
  }
}

export function clearTabAccount(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The sessionStorage API may be unavailable.
  }
}

/** Remembers the account from a successful "/login" response body. */
export function setTabAccountFromLogin(body: unknown): void {
  const result = loginResponseSchema.safeParse(body);
  if (result.success) {
    setTabAccount(result.data.userID);
  }
}

/** Adds this tab's account to a path that the server authenticates. */
export function withTabAccount(path: string): string {
  const account = getTabAccount();
  if (account === undefined) {
    return path;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}account=${account}`;
}
