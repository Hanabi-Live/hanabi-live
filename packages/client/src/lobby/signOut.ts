import { clearTabAccount, withTabAccount } from "@hanabi-live/data";

export function signOut(): void {
  // Keep "?dev" through signing out. The server rejects any other parameter.
  const dev = new URLSearchParams(globalThis.location.search).has("dev");
  const path = withTabAccount(dev ? "/logout?dev" : "/logout");
  clearTabAccount();
  globalThis.location.assign(path);
}
