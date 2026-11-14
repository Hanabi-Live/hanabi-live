import type {
  CLIENT_REQUEST_SCHEMAS,
  ClientRequest,
  ReplyData,
  ServerEvent,
  ServerEventData,
} from "@hanabi-live/data";
import {
  packRequest,
  REPLY_SCHEMAS,
  SERVER_EVENT_SCHEMAS,
  unpackServerFrame,
} from "@hanabi-live/data";
import type { z } from "zod";

/** The commands that `send` delivers before the client is ready. */
const COMMANDS_BEFORE_READY: ReadonlySet<ClientRequest> = new Set([
  "gameInitLoad",
  "gameLoaded",
  "gameStateLoad",
  "tableReattend",
  "tableSpectate",
]);

/** Events from the WebSocket itself, rather than messages from the server. */
type LifecycleEvent = "open" | "close" | "socketError";

const serverSchemas: Readonly<
  Partial<Record<string, (typeof SERVER_EVENT_SCHEMAS)[ServerEvent]>>
> = SERVER_EVENT_SCHEMAS;

const replySchemas: Readonly<Partial<Record<string, z.ZodType>>> =
  REPLY_SCHEMAS;

/** The server's answer to a request: its data, or a failure, which the client has shown. */
export type Reply<Command extends ClientRequest> =
  | { readonly ok: true; readonly data: ReplyData[Command] }
  | { readonly ok: false };

/** A request that the server has not answered. */
interface PendingRequest {
  readonly command: ClientRequest;
  readonly onReply: ((reply: Reply<ClientRequest>) => void) | undefined;
}

/**
 * Manages a WebSocket connection to the server. The frames are described in the data package's
 * "frames.ts".
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
  private nextRequestId = 1;
  private readonly pending = new Map<number, PendingRequest>();

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
    // A closed connection answers nothing more.
    for (const request of this.pending.values()) {
      request.onReply?.({ ok: false });
    }
    this.pending.clear();
    this.lifecycleCallback("close")?.(event);
  }

  onMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") {
      return;
    }

    const frame = unpackServerFrame(event.data);
    if (frame === undefined) {
      console.error(`The server sent an unreadable frame: ${event.data}`);
      return;
    }
    if (frame.kind === "reply") {
      this.onReply(frame.id, frame.data, frame.error);
      return;
    }
    const { name: command, data } = frame;

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

  /** Answers a request: with its data, or, after the "warning" handler shows it, with a failure. */
  private onReply(id: number, data: unknown, error: unknown): void {
    const request = this.pending.get(id);
    if (request === undefined) {
      console.error(
        `The server answered request ${id}, which we did not send.`,
      );
      return;
    }
    this.pending.delete(id);
    const { command } = request;
    function resolve(reply: Reply<ClientRequest>) {
      request?.onReply?.(reply);
    }
    if (error !== undefined) {
      const notice = SERVER_EVENT_SCHEMAS.warning.safeParse(error);
      if (!notice.success) {
        this.invalidMessage?.(
          command,
          new TypeError(
            `The server sent an invalid failure of "${command}": ${notice.error.message}`,
          ),
        );
      } else if (notice.data.code !== "commandIgnored") {
        // `on` registered the warning callback for this payload type.
        const warning = this.callbacks.get("warning") as
          ((data: ServerEventData["warning"]) => void) | undefined;
        warning?.(structuredClone(notice.data));
      }
      resolve({ ok: false });
      return;
    }
    const schema = replySchemas[command];
    if (schema === undefined) {
      // `ReplyData` has no data for a command without a reply schema.
      resolve({
        ok: true,
        data: undefined as ReplyData[ClientRequest],
      });
      return;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      this.invalidMessage?.(
        command,
        new TypeError(
          `The server sent an invalid reply to "${command}": ${result.error.message}`,
        ),
      );
      resolve({ ok: false });
      return;
    }
    if (this.debug) {
      console.log(`%cReceived the reply to ${command}:`, "color: blue;");
      console.log(result.data);
    }
    // The schema of the command's reply checked the data.
    resolve({
      ok: true,
      data: structuredClone(result.data) as ReplyData[ClientRequest],
    });
  }

  onError(event: Event): void {
    this.lifecycleCallback("socketError")?.(event);
  }

  on(name: LifecycleEvent, callback: (event: Event) => void): void;
  on<Command extends ServerEvent>(
    name: Command,
    callback: (data: ServerEventData[Command]) => void,
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

  /**
   * Sends a request. `onReply` gets the server's reply, after every message that the request's work
   * sent. A refused request shows as a warning either way.
   */
  send<Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
    onReply?: (reply: Reply<Command>) => void,
  ): void {
    if (
      this.ws.readyState !== WebSocket.OPEN
      || (!this.ready && !COMMANDS_BEFORE_READY.has(command))
    ) {
      onReply?.({ ok: false });
      return;
    }

    const id = this.nextRequestId;
    this.nextRequestId++;
    this.pending.set(id, {
      command,
      // The reply to this ID is the reply to `command`.
      onReply: onReply as ((reply: Reply<ClientRequest>) => void) | undefined,
    });
    this.ws.send(packRequest(id, command, data));

    console.log(`%cSent ${command}:`, "color: green;");
    console.log(data);
  }

  close(): void {
    this.ws.close();
  }
}
