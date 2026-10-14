/** An internal chat destination, parsed from the legacy WebSocket room string. */
export type ChatTarget =
  | { readonly kind: "lobby" }
  | { readonly kind: "table"; readonly tableID: number };

/** Returns undefined for malformed room strings and non-representable table IDs. */
export function parseChatTarget(room: string): ChatTarget | undefined {
  if (room === "lobby") {
    return { kind: "lobby" };
  }

  const match = /^table(\d+)$/u.exec(room);
  const idString = match?.[1];
  if (idString === undefined) {
    return undefined;
  }

  const tableID = Number(idString);
  if (!Number.isSafeInteger(tableID)) {
    return undefined;
  }

  return { kind: "table", tableID };
}
