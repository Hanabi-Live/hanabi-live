// Functions having to do with the WebSocket protocol between the client and the server. This is
// based on the protocol that the Golem WebSocket framework uses.

const WEBSOCKET_COMMAND_SEPARATOR = " ";

export function unpackWSMessage(
  data: string,
): readonly [command: string, data: unknown] | undefined {
  const command = data.split(WEBSOCKET_COMMAND_SEPARATOR)[0];
  if (command === undefined || command === "") {
    return undefined;
  }

  const argsString = data.slice(
    command.length + WEBSOCKET_COMMAND_SEPARATOR.length,
  );

  if (argsString === "") {
    return [command, undefined];
  }

  try {
    const args: unknown = JSON.parse(argsString);
    return [command, args];
  } catch {
    return [command, undefined];
  }
}

/**
 * This function should only be used on the client. The server validates outgoing payloads before
 * passing them to its encoder.
 */
export function packWSMessageOnClient(command: string, data: unknown): string {
  return packWSMessageOnServer(command, data, JSON.stringify);
}

/** Works on local HTTP development origins as well as HTTPS. */
export function createClientRequestID(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (word) =>
    word.toString(16).padStart(8, "0"),
  ).join("");
}

/** Frames an already prepared payload using the supplied encoder. */
export function packWSMessageOnServer(
  command: string,
  data: unknown,
  stringifyFunc: (data: unknown) => string,
): string {
  if (data === undefined || data === null) {
    return command;
  }

  return command + WEBSOCKET_COMMAND_SEPARATOR + stringifyFunc(data);
}
