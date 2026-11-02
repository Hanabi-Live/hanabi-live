import type { ServerCommandChatData } from "@hanabi-live/data";
import { chatMessageToWire } from "./chatMessage";
import type { CommandAdmission } from "./commandAdmission";
import {
  decodeDiscordHTML,
  discordOutboundText,
  escapeDiscordHTML,
  normalizeDiscordMessage,
  renderDiscordMessage,
} from "./discordRendering";
import type {
  DiscordConfiguration,
  DiscordIncomingMessage,
  DiscordTransport,
} from "./discordTransport";
import {
  createDiscordTransport,
  readDiscordConfiguration,
} from "./discordTransport";
import type { models } from "./models";

interface DiscordPublicCommand {
  /** Normalized raw command text, not HTML; the dispatcher escapes arguments exactly once. */
  readonly text: string;
  readonly username: string;
  readonly chatID: number;
  readonly datetime: string;
}

interface DiscordBridgeOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly store: Pick<
    typeof models.chatLog,
    | "insertDiscord"
    | "deleteDiscord"
    | "linkDiscordMessageID"
    | "getPublicDiscordMessage"
  >;
  readonly admission: CommandAdmission;
  readonly publishChat: (message: ServerCommandChatData) => void;
  readonly publishDeletion: (chatID: number) => void;
  /** Private website responses and unknown commands must never enter public history. */
  readonly classifyCommand: (
    text: string,
  ) => "text" | "public" | "private" | "unknown";
  /** Called for accepted public commands after their message is persisted and published. */
  readonly command: (message: DiscordPublicCommand) => Promise<void>;
  readonly log: (message: string) => void;
  readonly transport?: DiscordTransport;
}

type DiscordStatus =
  "disabled" | "connecting" | "ready" | "degraded" | "closed";
const MAX_PENDING_EVENTS = 1000;

export class DiscordBridge {
  private state: DiscordStatus = "disabled";
  private config: DiscordConfiguration | undefined;
  private transport: DiscordTransport | undefined;
  private botID = "";
  private readonly pending = new Set<Promise<void>>();
  private tail: Promise<void> = Promise.resolve();
  private outboundTail: Promise<void> = Promise.resolve();
  private started = false;
  private closing = false;
  private startup: Promise<void> | undefined;
  private shutdown: Promise<void> | undefined;
  private readonly options: DiscordBridgeOptions;

  constructor(options: DiscordBridgeOptions) {
    this.options = options;
  }

  get status(): DiscordStatus {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.started || this.closing) {
      await this.startup;
      return;
    }
    this.started = true;
    this.startup = this.connect();
    await this.startup;
  }

  private async connect(): Promise<void> {
    let phase = "configuration";
    try {
      this.config = readDiscordConfiguration(this.options.environment);
      if (this.config === undefined) {
        this.options.log(
          "Discord integration disabled: configuration is absent.",
        );
        return;
      }
      phase = "connection";
      this.state = "connecting";
      this.transport =
        this.options.transport ?? (await createDiscordTransport());
      if (this.closing) {
        await this.transport.close();
        return;
      }
      this.botID = await this.transport.start(this.config, {
        message: (message) => {
          this.enqueue(async () => {
            await this.receive(message);
          }).catch(() => {
            this.fail("message admission");
          });
        },
        deletion: (channelID, ids) => {
          this.enqueue(async () => {
            await this.delete(channelID, ids);
          }).catch(() => {
            this.fail("deletion admission");
          });
        },
        connection: (ready) => {
          if (!this.closing && this.botID !== "") {
            this.state = ready ? "ready" : "degraded";
            this.options.log(
              ready
                ? "Discord connection resumed."
                : "Discord connection unavailable.",
            );
          }
        },
      });
      phase = "configured roles";
      const roles = await this.transport.roles();
      if (
        [
          this.config.DISCORD_PING_CREW_ROLE_NAME,
          this.config.DISCORD_TRUSTED_TEACHER_ROLE_NAME,
        ].some((name) => roles.every((role) => role.name !== name))
      ) {
        throw new Error("Configured Discord roles are unavailable.");
      }
      // Shutdown can begin while SDK initialization is awaiting network work.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!this.closing) {
        this.state = "ready";
        this.options.log("Discord integration connected.");
      }
    } catch {
      this.botID = "";
      this.fail(phase);
      try {
        await this.transport?.close();
      } catch {
        this.fail("initialization cleanup");
      }
    }
  }

  private fail(operation: string): void {
    if (!this.closing) {
      this.state = "degraded";
    }
    // Transport errors may contain authorization headers or private Discord content.
    this.options.log(`Discord ${operation} failed; integration is degraded.`);
  }

  private async enqueue(
    work: () => Promise<void>,
    outbound = false,
  ): Promise<void> {
    if (
      this.closing
      || this.config === undefined
      || (!outbound && this.options.admission.paused)
    ) {
      return;
    }
    if (this.pending.size >= MAX_PENDING_EVENTS) {
      this.fail("event capacity");
      return;
    }
    const previous = outbound ? this.outboundTail : this.tail;
    async function execute() {
      await previous;
      await work();
    }
    // Outbound hooks belong to their already-admitted caller, including during drain.
    const execution = outbound
      ? execute()
      : this.options.admission.run(execute);
    const task = execution
      .then(() => undefined)
      .catch(() => {
        this.fail("operation");
      });
    if (outbound) {
      this.outboundTail = task;
    } else {
      this.tail = task;
    }
    this.pending.add(task);
    task
      .then(() => {
        this.pending.delete(task);
      })
      .catch(() => {
        this.fail("completion");
      });
    return await task;
  }

  /**
   * Mirror existing public rows from already-admitted callers, including during admission drain.
   * This never accepts PMs or tokens; callers should await completion before leaving admission.
   */
  async sendPublicMessage(
    chatID: number,
    development = false,
    rawText?: string,
  ): Promise<void> {
    await this.enqueue(async () => {
      const { config, transport } = this;
      if (
        config === undefined
        || transport === undefined
        || this.botID === ""
      ) {
        return;
      }
      const row = await this.options.store.getPublicDiscordMessage(chatID);
      if (
        row === undefined
        || row.source === "discord"
        || row.discordMessageID !== null
      ) {
        return;
      }
      const persistedText =
        row.source === "user" ? decodeDiscordHTML(row.message) : row.message;
      const text = rawText ?? persistedText;
      if (parseCommand(text) === "token") {
        return;
      }
      if (row.source === "user") {
        const classification = this.options.classifyCommand(text);
        if (classification === "private" || classification === "unknown") {
          return;
        }
      }
      if (rawText !== undefined && rawText !== persistedText) {
        // A caller can preserve original Discord mention tokens, but cannot substitute unrelated
        // content (for example a PM whose numeric ID collides with this row).
        const rendered =
          row.source === "user" ? await this.render(rawText) : rawText;
        if (rendered !== row.message) {
          throw new Error(
            "Outbound Discord text does not match the persisted public message.",
          );
        }
      }
      const username = row.source === "server" ? "" : (row.username ?? "");
      const roles = await this.allowedRoles();
      const content = discordOutboundText(username, text);
      const id = await transport.send(
        config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
        content,
        roles,
      );
      if (await this.options.store.linkDiscordMessageID(chatID, id)) {
        this.options.publishDeletion(chatID);
      }
      if (development && row.source === "server") {
        await transport.send(
          config.DISCORD_CHANNEL_WEBSITE_DEVELOPMENT,
          content,
          roles,
        );
      }
    }, true);
  }

  /**
   * Render validated lobby input from an already-admitted caller, including during admission drain.
   * Keep the raw text for its Discord copy.
   */
  async renderPublicMessage(text: string): Promise<string> {
    let rendered = escapeDiscordHTML(text);
    await this.enqueue(async () => {
      if (this.botID !== "" && this.transport !== undefined) {
        rendered = await this.render(text);
      }
    }, true);
    return rendered;
  }

  private async allowedRoles(): Promise<readonly string[]> {
    const { config, transport } = this;
    if (config === undefined || transport === undefined) {
      throw new Error("Discord is not initialized.");
    }
    const names = new Set([
      config.DISCORD_PING_CREW_ROLE_NAME,
      config.DISCORD_TRUSTED_TEACHER_ROLE_NAME,
    ]);
    const roles = await transport.roles();
    return roles.filter((role) => names.has(role.name)).map((role) => role.id);
  }

  private async receive(message: DiscordIncomingMessage): Promise<void> {
    const { config, transport } = this;
    if (
      config === undefined
      || transport === undefined
      || this.botID === ""
      || message.authorID === this.botID
      || message.id === ""
      || message.guildID !== config.DISCORD_GUILD_ID
      || message.channelID !== config.DISCORD_CHANNEL_SYNC_WITH_LOBBY
    ) {
      return;
    }
    const subscription = message.content
      .split("\n")
      .map(parseCommand)
      .find((command) => command === "subscribe" || command === "unsubscribe");
    const text = normalizeDiscordMessage(
      subscription === undefined ? message.content : `/${subscription}`,
    );
    if (text === undefined || parseCommand(text) === "token") {
      return;
    }
    const classification =
      subscription === undefined
        ? this.options.classifyCommand(text)
        : "public";
    if (classification === "private" || classification === "unknown") {
      return;
    }
    const username = await this.lookup(
      async () => await transport.nickname(message.authorID),
      "[error]",
    );
    const rendered = await this.render(text);
    const inserted = await this.options.store.insertDiscord(
      username,
      rendered,
      message.id,
    );
    if (inserted === undefined) {
      return;
    }
    if (subscription !== undefined) {
      await this.subscribe(
        message.authorID,
        username,
        subscription === "subscribe",
      );
      return;
    }
    this.publish(username, rendered, inserted);
    if (classification === "public") {
      await this.options.command({
        text,
        username,
        chatID: inserted.chatID,
        datetime: inserted.datetimeSent.toISOString(),
      });
    }
  }

  private async lookup(
    work: () => Promise<string>,
    fallback: string,
  ): Promise<string> {
    try {
      return await work();
    } catch {
      this.fail("name lookup");
      return fallback;
    }
  }

  private async render(text: string): Promise<string> {
    const { transport } = this;
    if (transport === undefined) {
      throw new Error("Discord is not initialized.");
    }
    return await renderDiscordMessage(text, {
      nickname: async (id) =>
        await this.lookup(async () => await transport.nickname(id), "[error]"),
      channel: async (id) =>
        await this.lookup(async () => await transport.channel(id), "[error]"),
      role: async (id) =>
        await this.lookup(async () => {
          const roles = await transport.roles();
          return roles.find((role) => role.id === id)?.name ?? "[unknown role]";
        }, "[unknown role]"),
    });
  }

  private publish(
    username: string,
    text: string,
    inserted: { chatID: number; datetimeSent: Date },
  ): void {
    this.options.publishChat(
      chatMessageToWire({
        kind: "lobby",
        source: "discord",
        text,
        who: username,
        room: "lobby",
        chatID: inserted.chatID,
        datetime: inserted.datetimeSent.toISOString(),
      }),
    );
  }

  private async subscribe(
    userID: string,
    username: string,
    subscribed: boolean,
  ): Promise<void> {
    const { config, transport } = this;
    if (config === undefined || transport === undefined) {
      return;
    }
    const roles = await transport.roles();
    const role = roles.find(
      (entry) => entry.name === config.DISCORD_PING_CREW_ROLE_NAME,
    );
    if (role === undefined) {
      this.fail("subscription role lookup");
      await transport.send(
        config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
        "Error: The `@Ping Crew` role could not be found.",
        [],
      );
      return;
    }
    try {
      await transport.subscribe(userID, role.id, subscribed);
    } catch {
      this.fail("subscription");
      await transport.send(
        config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
        `Error: the \`@Ping Crew\` role could not be ${subscribed ? "added to" : "removed from"} your profile.`,
        [],
      );
      return;
    }
    const action = subscribed ? "is now a member of" : "has left";
    const notice = subscribed
      ? `@${username} ${action} the @Ping Crew.`
      : `\`@${username}\` ${action} the \`@Ping Crew\`.`;
    const rendered = await this.render(notice);
    const inserted = await this.options.store.insertDiscord("", rendered, "");
    if (inserted === undefined) {
      throw new Error("Discord notice insertion returned no row.");
    }
    this.publish("", rendered, inserted);
    await transport.send(
      config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
      `\`@${username}\` ${action} the \`@Ping Crew\`.`,
      [],
    );
  }

  private async delete(
    channelID: string,
    ids: readonly string[],
  ): Promise<void> {
    if (
      this.botID === ""
      || channelID === ""
      || channelID !== this.config?.DISCORD_CHANNEL_SYNC_WITH_LOBBY
    ) {
      return;
    }
    for (const id of new Set(ids)) {
      if (id !== "") {
        try {
          // Serialize writes so bulk moderation remains bounded and ordered.
          // eslint-disable-next-line no-await-in-loop
          const chatID = await this.options.store.deleteDiscord(id);
          if (chatID !== undefined) {
            this.options.publishDeletion(chatID);
          }
        } catch {
          this.fail("deletion persistence");
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.shutdown === undefined) {
      this.closing = true;
      this.shutdown = this.finishClose();
    }
    const attempt = this.shutdown;
    try {
      await attempt;
    } catch (error) {
      if (this.shutdown === attempt) {
        this.shutdown = undefined;
        this.state = "degraded";
      }
      throw error;
    }
  }

  private async finishClose(): Promise<void> {
    // New work is rejected; finish accepted sends before destroying the SDK transport.
    let stopped = false;
    try {
      await Promise.all(this.pending);
    } finally {
      try {
        await this.transport?.close();
        stopped = true;
      } finally {
        await this.startup;
        this.state = stopped ? "closed" : "degraded";
      }
    }
  }
}

function parseCommand(text: string): string {
  const first = text.split(" ", 1)[0] ?? "";
  return first.startsWith("/") ? first.slice(1).toLowerCase() : "";
}
