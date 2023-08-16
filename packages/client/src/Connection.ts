type WebSocketCallbackCommands = Record<string, (data: unknown) => void>;

type WebSocketCallbacks = WebSocketCallbackCommands & {
  open?: (event: Event) => void;
  close?: (event: Event) => void;
  socketError?: (event: Event) => void;
};

/**
 * Manages a WebSocket connection to the server.
 *
 * On top of the WebSocket protocol, the client and the server communicate using a specific format
 * based on the protocol that the Golem WebSocket framework uses. For more information, see
 * "websocketMessage.go".
 *
 * Based on: https://github.com/trevex/golem_client/blob/master/golem.js
 */
export class Connection {
  ws: WebSocket;
  callbacks: WebSocketCallbacks = {};
  debug: boolean;

  constructor(addr: string, debug: boolean) {
    this.ws = new WebSocket(addr);
    this.debug = debug;

    this.ws.addEventListener("close", this.onClose.bind(this));
    this.ws.addEventListener("open", this.onOpen.bind(this));
    this.ws.addEventListener("message", this.onMessage.bind(this));
    this.ws.addEventListener("error", this.onError.bind(this));
  }

  onOpen(event: Event): void {
    if (this.callbacks.open !== undefined) {
      this.callbacks.open(event);
    }
  }

  onClose(event: CloseEvent): void {
    if (this.callbacks.close !== undefined) {
      this.callbacks.close(event);
    }
  }

  onMessage(event: MessageEvent): void {
    const data = unpack(event.data as string);
    const command = data[0]!;
    if (this.callbacks[command] !== undefined) {
      const obj = unmarshal(data[1]!);
      if (this.debug) {
        console.log(`%cReceived ${command}:`, "color: blue;");
        console.log(obj);
      }
      this.callbacks[command]!(obj);
    } else {
      console.error(
        "Received WebSocket message with no callback:",
        command,
        JSON.parse(data[1]!),
      );
    }
  }

  onError(event: Event): void {
    if (this.callbacks.socketError !== undefined) {
      this.callbacks.socketError(event);
    }
  }

  on(name: string, callback: (data: unknown) => void): void {
    this.callbacks[name] = callback;
  }

  send(command: string, data?: unknown): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    console.log(`%cSent ${command}:`, "color: green;");
    console.log(data);
    this.ws.send(marshalAndPack(command, data ?? {}));
  }

  close(): void {
    this.ws.close();
  }
}

const SEPARATOR = " ";

function unpack(data: string) {
  const name = data.split(SEPARATOR)[0]!;
  return [name, data.slice(name.length + 1, data.length)];
}

function unmarshal(data: string) {
  return JSON.parse(data) as unknown;
}

function marshalAndPack(name: string, data: unknown) {
  return name + SEPARATOR + JSON.stringify(data);
}
