/** A reconnect query is only a hint: cookie authentication is unchanged. */
export function isReconnectRequest(url: string): boolean {
  return new URL(url, "http://localhost").searchParams.get("reconnect") === "1";
}
