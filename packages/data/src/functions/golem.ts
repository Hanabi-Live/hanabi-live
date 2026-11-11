// Functions having to do with the WebSocket protocol between the client and the server. This is
// based on the protocol that the Golem WebSocket framework uses.

const WEBSOCKET_COMMAND_SEPARATOR = " ";

export function unpackWsMessage(
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

/** Frames a client command and its payload as `command JSON`. */
export function packWsMessage(command: string, data: unknown): string {
  if (data === undefined || data === null) {
    return command;
  }

  return command + WEBSOCKET_COMMAND_SEPARATOR + JSON.stringify(data);
}
