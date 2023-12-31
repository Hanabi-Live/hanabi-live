import type { SocketStream } from "@fastify/websocket";
import type { RawData } from "ws";

let blockIncomingWebSocketMessages = false;
let numWSMessages = 0;

export function wsMessage(_connection: SocketStream, _data: RawData): void {
  if (blockIncomingWebSocketMessages) {
    return;
  }

  numWSMessages++;

  try {
    handleWSMessage();
  } finally {
    numWSMessages--;
  }
}

function handleWSMessage() {
  // TODO
}

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setBlockIncomingWebSocketMessages() {
  blockIncomingWebSocketMessages = true;
}

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getNumWSMessages() {
  return numWSMessages;
}
