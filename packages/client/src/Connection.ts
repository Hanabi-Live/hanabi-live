import type {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  ServerCommand,
  ServerCommandData,
} from "@hanabi-live/data";
import {
  packWSMessage,
  SERVER_COMMAND_SCHEMAS,
  unpackWSMessage,
} from "@hanabi-live/data";
import type { z } from "zod";

/** Events from the WebSocket itself, rather than messages from the server. */
type LifecycleEvent = "open" | "close" | "socketError";

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
  /**
   * Callbacks by server command or lifecycle event. `on` pairs each name with its callback type, so
   * reading one back requires that name's type.
   */
  readonly callbacks = new Map<string, (data: never) => void>();
  debug: boolean;
  /** Called instead of the command's callback when a message does not match its schema. */
  invalidMessage?: (command: string, error: Error) => void;
  private ready = true;

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  constructor(addr: string, debug: boolean) {
    this.ws = new WebSocket(addr);
    this.debug = debug;

    this.ws.addEventListener("close", this.onClose.bind(this));
    this.ws.addEventListener("open", this.onOpen.bind(this));
    this.ws.addEventListener("message", this.onMessage.bind(this));
    this.ws.addEventListener("error", this.onError.bind(this));
  }

  onOpen(event: Event): void {
    this.lifecycleCallback("open")?.(event);
  }

  onClose(event: CloseEvent): void {
    this.lifecycleCallback("close")?.(event);
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

    // `on` registered this command's callback for its payload type, which the schema check below
    // establishes.
    const callback = this.callbacks.get(command) as
      ((data: unknown) => void) | undefined;
    if (callback === undefined) {
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
    this.lifecycleCallback("socketError")?.(event);
  }

  on(name: LifecycleEvent, callback: (event: Event) => void): void;
  on<Command extends ServerCommand>(
    name: Command,
    callback: (data: ServerCommandData[Command]) => void,
  ): void;
  on(name: string, callback: (data: never) => void): void {
    this.callbacks.set(name, callback);
  }

  private lifecycleCallback(
    name: LifecycleEvent,
  ): ((event: Event) => void) | undefined {
    // `on` only registers lifecycle names with event callbacks.
    return this.callbacks.get(name) as ((event: Event) => void) | undefined;
  }

  send<Command extends ClientCommand>(
    command: Command,
    data: z.input<(typeof CLIENT_COMMAND_SCHEMAS)[Command]>,
  ): void {
    if (
      this.ws.readyState !== WebSocket.OPEN
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

    const msg = packWSMessage(command, data);
    this.ws.send(msg);

    console.log(`%cSent ${command}:`, "color: green;");
    console.log(data);
  }

  close(): void {
    this.ws.close();
  }
}
