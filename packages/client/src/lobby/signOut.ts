import { markTabSignedOut, withTabAccount } from "@hanabi-live/data";

export function signOut(): void {
  // Keep "?dev" through signing out. The server rejects any other parameter.
  const dev = new URLSearchParams(globalThis.location.search).has("dev");
  const path = withTabAccount(dev ? "/logout?dev" : "/logout");
  markTabSignedOut();

  // The server signs out only with a POST, so that other sites cannot sign a player out. A form
  // navigates to the page that the server redirects to.
  const form = document.createElement("form");
  form.method = "post";
  form.action = path;
  document.body.append(form);
  form.submit();
}
