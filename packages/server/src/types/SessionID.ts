/** Used for WebSocket sessions. */
export type SessionID = number & { readonly __sessionIDBrand: unique symbol };
