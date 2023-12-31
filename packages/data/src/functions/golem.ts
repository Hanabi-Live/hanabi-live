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
    data.length,
  );

  if (argsString === "") {
    return [command, undefined];
  }

  try {
    const args = JSON.parse(argsString) as unknown;
    return [command, args];
  } catch {
    return [command, undefined];
  }
}

/**
 * This function should only be used on the client, because the server has optimized stringification
 * functions from the "fast-json-stringify" library.
 */
export function packWSMessageOnClient(command: string, data: unknown): string {
  return packWSMessageOnServer(command, data, JSON.stringify);
}

/**
 * This function should only be used on the server, because the server has optimized stringification
 * functions from the "fast-json-stringify" library.
 */
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
