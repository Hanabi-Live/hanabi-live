import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/u);
const configuration = z.object({
  DISCORD_TOKEN: z.string().trim().min(1),
  DISCORD_GUILD_ID: snowflake,
  DISCORD_CHANNEL_SYNC_WITH_LOBBY: snowflake,
  DISCORD_CHANNEL_WEBSITE_DEVELOPMENT: snowflake,
  DISCORD_PING_CREW_ROLE_NAME: z.string().trim().min(1),
  DISCORD_TRUSTED_TEACHER_ROLE_NAME: z.string().trim().min(1),
});

export type DiscordConfiguration = z.infer<typeof configuration>;
export interface DiscordIncomingMessage {
  readonly id: string;
  readonly channelID: string;
  readonly guildID: string | null;
  readonly authorID: string;
  readonly content: string;
}
export interface DiscordEvents {
  message: (message: DiscordIncomingMessage) => void;
  deletion: (channelID: string, ids: readonly string[]) => void;
  connection: (ready: boolean) => void;
}
export interface DiscordTransport {
  start: (
    configuration: DiscordConfiguration,
    events: DiscordEvents,
  ) => Promise<string>;
  close: () => Promise<void>;
  nickname: (id: string) => Promise<string>;
  channel: (id: string) => Promise<string>;
  roles: () => Promise<ReadonlyArray<{ id: string; name: string }>>;
  send: (
    channelID: string,
    content: string,
    roleIDs: readonly string[],
  ) => Promise<string>;
  subscribe: (
    userID: string,
    roleID: string,
    subscribed: boolean,
  ) => Promise<void>;
}

export function readDiscordConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): DiscordConfiguration | undefined {
  const keys = Object.keys(configuration.shape);
  if (keys.every((key) => (environment[key] ?? "").trim() === "")) {
    return undefined;
  }
  const parsed = configuration.safeParse(environment);
  if (!parsed.success) {
    // Never include Zod's input values: one of them is the bot token.
    throw new Error(
      `Invalid Discord configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  }
  return parsed.data;
}

/** The SDK owns gateway resume, heartbeat and REST rate-limit handling. */
export async function createDiscordTransport(): Promise<DiscordTransport> {
  const { Client, Events, GatewayIntentBits, Partials, PermissionFlagsBits } =
    await import("discord.js");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
    rest: { timeout: 10_000, retries: 0, rejectOnRateLimit: () => true },
  });
  let guildID = "";
  let closed = false;
  let shutdown: Promise<void> | undefined;
  const cancelled = Promise.withResolvers<never>();
  const ready = Promise.withResolvers<undefined>();
  function requireActive() {
    if (closed) {
      throw new Error("Discord transport is closed.");
    }
  }
  // Closing a disabled/unstarted transport must not create an unhandled rejection.
  cancelled.promise.catch(() => undefined);
  return {
    async start(config, events) {
      requireActive();
      guildID = config.DISCORD_GUILD_ID;
      client.on(Events.Error, () => {
        events.connection(false);
      });
      client.on(Events.ShardError, () => {
        events.connection(false);
      });
      client.on(Events.ShardDisconnect, () => {
        events.connection(false);
      });
      client.on(Events.ShardReconnecting, () => {
        events.connection(false);
      });
      client.on(Events.ShardResume, () => {
        events.connection(true);
      });
      client.on(Events.ShardReady, () => {
        events.connection(true);
      });
      client.on(Events.Invalidated, () => {
        events.connection(false);
      });
      client.on(Events.MessageCreate, (message) => {
        events.message({
          id: message.id,
          channelID: message.channelId,
          guildID: message.guildId,
          authorID: message.author.id,
          content: message.content,
        });
      });
      client.on(Events.MessageDelete, (message) => {
        events.deletion(message.channelId, [message.id]);
      });
      client.on(Events.MessageBulkDelete, (messages, channel) => {
        events.deletion(channel.id, [...messages.keys()]);
      });
      client.once(Events.ClientReady, () => {
        ready.resolve(undefined);
      });
      const expired = Promise.withResolvers<never>();
      const timer = setTimeout(() => {
        expired.reject(new Error("Discord connection timed out."));
      }, 20_000);
      try {
        await Promise.race([
          client.login(config.DISCORD_TOKEN).then(async () => {
            await ready.promise;
          }),
          cancelled.promise,
          expired.promise,
        ]);
      } finally {
        clearTimeout(timer);
      }
      requireActive();
      const guild = await client.guilds.fetch(guildID);
      const bot = await guild.members.fetchMe();
      for (const id of [
        config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
        config.DISCORD_CHANNEL_WEBSITE_DEVELOPMENT,
      ]) {
        // There are only two configured channels to validate.
        // eslint-disable-next-line no-await-in-loop
        const channel = await guild.channels.fetch(id);
        if (
          channel === null
          || !channel.isSendable()
          || !channel
            .permissionsFor(bot)
            .has([
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
            ])
        ) {
          throw new Error("Discord channel is unavailable or not sendable.");
        }
      }
      if (client.user === null) {
        throw new Error("Discord connected without a bot identity.");
      }
      return client.user.id;
    },
    async close() {
      if (shutdown === undefined) {
        closed = true;
        cancelled.reject(new Error("Discord connection cancelled."));
        ready.resolve(undefined);
        shutdown = client.destroy().then(() => {
          client.removeAllListeners();
        });
      }
      const attempt = shutdown;
      try {
        await attempt;
      } catch (error) {
        if (shutdown === attempt) {
          shutdown = undefined;
        }
        throw error;
      }
    },
    async nickname(id) {
      requireActive();
      const guild = await client.guilds.fetch(guildID);
      const member = await guild.members.fetch(id);
      return member.nickname ?? member.user.username;
    },
    async channel(id) {
      requireActive();
      const channel = await client.channels.fetch(id);
      if (channel === null || !("name" in channel)) {
        throw new Error("Discord channel is unavailable.");
      }
      return channel.name ?? "[error]";
    },
    async roles(): Promise<ReadonlyArray<{ id: string; name: string }>> {
      requireActive();
      const guild = await client.guilds.fetch(guildID);
      const roles = await guild.roles.fetch();
      return [...roles.values()].map(({ id, name }) => ({ id, name }));
    },
    async send(channelID, content, roleIDs) {
      requireActive();
      const channel = await client.channels.fetch(channelID);
      if (channel === null || !channel.isSendable()) {
        throw new Error("Discord channel is unavailable or not sendable.");
      }
      const message = await channel.send({
        content,
        allowedMentions: {
          parse: [],
          roles: [...roleIDs],
          users: [],
          repliedUser: false,
        },
      });
      return message.id;
    },
    async subscribe(userID, roleID, subscribed) {
      requireActive();
      const guild = await client.guilds.fetch(guildID);
      const member = await guild.members.fetch(userID);
      if (subscribed) {
        await member.roles.add(roleID);
      } else {
        await member.roles.remove(roleID);
      }
    },
  };
}
