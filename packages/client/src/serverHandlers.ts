import type { ServerEventData } from "@hanabi-live/data";

/** Each server message's generated payload type, keyed by the message's name. */
type Payloads = {
  [Command in keyof ServerEventData as `${Command}`]: ServerEventData[Command];
};

type Handler<Command extends keyof Payloads> = (
  data: Payloads[Command],
) => void;

/**
 * Handlers for server messages. Each handler is typed with its message's schema generated from
 * server/protocol, so it cannot assume a payload shape the server does not send.
 */
export class ServerHandlers {
  private readonly handlers = new Map<keyof Payloads, (data: never) => void>();

  set<Command extends keyof Payloads>(
    command: Command,
    handler: Handler<Command>,
  ): void {
    this.handlers.set(command, handler);
  }

  get<Command extends keyof Payloads>(
    command: Command,
  ): Handler<Command> | undefined {
    return this.handlers.get(command) as Handler<Command> | undefined;
  }

  /**
   * The handlers to install on a connection. The connection validates each message against its
   * schema before calling a handler, which is what makes the payload type hold.
   */
  entries(): ReadonlyArray<readonly [keyof Payloads, Handler<keyof Payloads>]> {
    return [...this.handlers].map(
      ([command, handler]) =>
        [command, handler as Handler<keyof Payloads>] as const,
    );
  }
}
