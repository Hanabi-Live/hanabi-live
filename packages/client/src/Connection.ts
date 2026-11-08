import type {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  ServerCommand,
} from "@hanabi-live/data";
import {
  packWSMessageOnClient,
  SERVER_COMMAND_SCHEMAS,
  unpackWSMessage,
} from "@hanabi-live/data";
import type { z } from "zod";

type WebSocketCallbackCommands = Record<string, (data: unknown) => void>;

type WebSocketCallbacks = WebSocketCallbackCommands & {
  open?: (event: Event) => void;
  close?: (event: Event) => void;
  socketError?: (event: Event) => void;
};

const serverSchemas: Readonly<
  Partial<Record<string, (typeof SERVER_COMMAND_SCHEMAS)[ServerCommand]>>
> = SERVER_COMMAND_SCHEMAS;

/**
 * Manages a WebSocket connection to the server.
 *
 * On top of the WebSocket protocol, the client and the server communicate using a specific format
 * based on the protocol that the Golem WebSocket framework uses: `command JSON`.
 *
 * Based on: https://github.com/trevex/golem_client/blob/master/golem.js
 */
export class Connection {
  ws: WebSocket;
  callbacks: WebSocketCallbacks = {};
  debug: boolean;
  /** Called instead of the command's callback when a message does not match its schema. */
  invalidMessage?: (command: string, error: Error) => void;
  private readonly allowApplicationCommands: boolean;
  private ready = true;

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  constructor(addr: string, debug: boolean, allowApplicationCommands = true) {
    this.ws = new WebSocket(addr);
    this.debug = debug;
    this.allowApplicationCommands = allowApplicationCommands;

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
    if (typeof event.data !== "string") {
      return;
    }

    const msg = unpackWSMessage(event.data);
    if (msg === undefined) {
      return;
    }

    const [command, data] = msg;

    const callback = this.callbacks[command];
    if (callback === undefined) {
      if (!this.allowApplicationCommands) {
        // Older servers send normal bootstrap messages during reconnect.
        return;
      }
      console.error(
        `Received a WebSocket message with no corresponding callback: ${command}`,
      );
      return;
    }

    // Handlers receive the validated payload, with the schema's defaults applied, rather than
    // whatever the server sent.
    const schema = serverSchemas[command];
    const result = schema?.safeParse(data);
    if (result?.success !== true) {
      const error = new TypeError(
        result === undefined
          ? `The server sent "${command}", which has no schema.`
          : `The server sent an invalid "${command}" message: ${result.error.message}`,
      );
      console.error(error.message);
      this.invalidMessage?.(command, error);
      return;
    }

    if (this.debug) {
      console.log(`%cReceived ${command}:`, "color: blue;");
      console.log(result.data);
    }

    // Read-only schemas freeze what they parse, but the classic client updates some payloads (such
    // as the welcome settings) in place, so it gets its own copy.
    callback(structuredClone(result.data));
  }

  onError(event: Event): void {
    if (this.callbacks.socketError !== undefined) {
      this.callbacks.socketError(event);
    }
  }

  on(name: string, callback: (data: unknown) => void): void {
    this.callbacks[name] = callback;
  }

  send<Command extends ClientCommand>(
    command: Command,
    data: z.input<(typeof CLIENT_COMMAND_SCHEMAS)[Command]>,
  ): void {
    // Resume probes must never submit gameplay commands to a stateful server.
    if (
      !this.allowApplicationCommands
      || this.ws.readyState !== WebSocket.OPEN
      || (!this.ready
        && ![
          "getGameInfo1",
          "getGameInfo2",
          "loaded",
          "tableReattend",
          "tableSpectate",
        ].includes(command))
    ) {
      return;
    }

    const msg = packWSMessageOnClient(command, data);
    this.ws.send(msg);

    console.log(`%cSent ${command}:`, "color: green;");
    console.log(data);
  }

  close(): void {
    this.ws.close();
  }
}
