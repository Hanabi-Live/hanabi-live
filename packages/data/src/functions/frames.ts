// The frames of the WebSocket protocol between the clients and the server. Each frame is one JSON
// object. A client request is `{"id": 1, "request": "tableJoin", "data": {...}}`, with an ID that
// the client chooses. The server answers every request that has a valid ID once, with `{"reply":
// 1}` and the reply's `data` if it has any, or with an `error`. A message that the server sends on
// its own is `{"event": "table", "data": {...}}`.

/** A frame from the server, as far as the frame itself goes: its payload is not checked. */
export type ServerFrame =
  | {
      readonly kind: "event";
      readonly name: string;
      readonly data: unknown;
    }
  | {
      readonly kind: "reply";
      readonly id: number;
      readonly data: unknown;
      readonly error: unknown;
    };

/** Encodes a client request. */
export function packRequest(id: number, name: string, data: unknown): string {
  return JSON.stringify({
    id,
    request: name,
    data,
  });
}

/** Encodes a message that the server sends on its own, for tests that stand in for the server. */
export function packEvent(name: string, data: unknown): string {
  return JSON.stringify({
    event: name,
    data,
  });
}

/** Reads a frame from the server, or returns undefined if it is not one. */
export function unpackServerFrame(text: string): ServerFrame | undefined {
  let frame: unknown;
  try {
    frame = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof frame !== "object" || frame === null) {
    return undefined;
  }
  const { event, reply, data, error } = frame as Record<string, unknown>;
  if (typeof event === "string") {
    return {
      kind: "event",
      name: event,
      data,
    };
  }
  if (typeof reply === "number") {
    return {
      kind: "reply",
      id: reply,
      data,
      error,
    };
  }
  return undefined;
}
