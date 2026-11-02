/* eslint-disable @typescript-eslint/require-await */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import type * as DiscordSDK from "discord.js";
import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { EventEmitter } from "node:events";
import type { DiscordConfiguration, DiscordEvents } from "./discordTransport";
import { createDiscordTransport } from "./discordTransport";

const mockSend = jest
  .fn<(...args: readonly unknown[]) => Promise<{ id: string }>>()
  .mockResolvedValue({ id: "sent-copy" });
const mockRoleAdd = jest
  .fn<(...args: readonly unknown[]) => Promise<undefined>>()
  .mockResolvedValue(undefined);
const mockRoleRemove = jest
  .fn<(...args: readonly unknown[]) => Promise<undefined>>()
  .mockResolvedValue(undefined);
const mockPermissions = jest.fn<() => boolean>().mockReturnValue(true);
const mockChannel = {
  name: "lobby",
  isSendable: () => true,
  permissionsFor: () => ({ has: mockPermissions }),
  send: mockSend,
};
const mockGuild = {
  channels: { fetch: jest.fn(async () => mockChannel) },
  members: {
    fetchMe: jest.fn(async () => ({ id: "bot" })),
    fetch: jest.fn(async () => ({
      nickname: "Nickname",
      user: { username: "Username" },
      roles: { add: mockRoleAdd, remove: mockRoleRemove },
    })),
  },
  roles: {
    fetch: jest.fn(
      async () => new Map([["crew", { id: "crew", name: "Crew" }]]),
    ),
  },
};
// The SDK itself uses EventEmitter, not DOM EventTarget.
// eslint-disable-next-line unicorn/prefer-event-target
const mockClient = Object.assign(new EventEmitter(), {
  login: jest.fn<() => Promise<string>>(),
  destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  guilds: { fetch: jest.fn(async () => mockGuild) },
  channels: { fetch: jest.fn(async () => mockChannel) },
  user: { id: "bot" },
});
jest.mock("discord.js", () => ({
  ...jest.requireActual<typeof DiscordSDK>("discord.js"),
  Client: jest.fn(() => mockClient),
}));
const config: DiscordConfiguration = {
  DISCORD_TOKEN: "synthetic-only",
  DISCORD_GUILD_ID: "100000000000000000",
  DISCORD_CHANNEL_SYNC_WITH_LOBBY: "200000000000000000",
  DISCORD_CHANNEL_WEBSITE_DEVELOPMENT: "300000000000000000",
  DISCORD_PING_CREW_ROLE_NAME: "Crew",
  DISCORD_TRUSTED_TEACHER_ROLE_NAME: "Teacher",
};
function handlers() {
  return {
    message: jest.fn<DiscordEvents["message"]>(),
    deletion: jest.fn<DiscordEvents["deletion"]>(),
    connection: jest.fn<DiscordEvents["connection"]>(),
  };
}

describe("production Discord SDK adapter without network", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissions.mockReturnValue(true);
    mockClient.removeAllListeners();
    mockClient.login.mockImplementation(async () => {
      mockClient.emit(Events.ClientReady);
      return "synthetic-only";
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("subscribes to reachable Go events and sanitizes outgoing mention permissions", async () => {
    const transport = await createDiscordTransport();
    const events = handlers();
    expect(await transport.start(config, events)).toBe("bot");
    expect(Client).toHaveBeenCalledWith(
      expect.objectContaining({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Message, Partials.Channel],
      }),
    );
    mockClient.emit(Events.MessageCreate, {
      id: "message",
      channelId: "channel",
      guildId: "guild",
      author: { id: "author" },
      content: "hello",
    });
    expect(events.message).toHaveBeenCalledWith({
      id: "message",
      channelID: "channel",
      guildID: "guild",
      authorID: "author",
      content: "hello",
    });
    mockClient.emit(Events.MessageDelete, { id: "one", channelId: "channel" });
    mockClient.emit(
      Events.MessageBulkDelete,
      new Map([
        ["three", {}],
        ["two", {}],
      ]),
      { id: "channel" },
    );
    expect(events.deletion.mock.calls).toEqual([
      ["channel", ["one"]],
      ["channel", ["three", "two"]],
    ]);
    expect(
      await transport.send("channel", "@everyone <@user> <@&crew>", ["crew"]),
    ).toBe("sent-copy");
    expect(mockSend).toHaveBeenCalledWith({
      content: "@everyone <@user> <@&crew>",
      allowedMentions: {
        parse: [],
        roles: ["crew"],
        users: [],
        repliedUser: false,
      },
    });
    expect(await transport.nickname("author")).toBe("Nickname");
    await transport.subscribe("author", "crew", true);
    await transport.subscribe("author", "crew", false);
    expect(mockRoleAdd).toHaveBeenCalledWith("crew");
    expect(mockRoleRemove).toHaveBeenCalledWith("crew");
    mockClient.emit(Events.ShardDisconnect);
    mockClient.emit(Events.ShardResume);
    mockClient.emit(Events.Invalidated);
    mockClient.emit(Events.ShardReady);
    expect(events.connection.mock.calls).toEqual([
      [false],
      [true],
      [false],
      [true],
    ]);
    await Promise.all([transport.close(), transport.close()]);
    expect(mockClient.destroy).toHaveBeenCalledTimes(1);
    expect(mockClient.eventNames()).toHaveLength(0);
    await expect(transport.send("channel", "late", [])).rejects.toThrow(
      "closed",
    );
  });

  test("startup without usable channel permissions fails explicitly", async () => {
    const transport = await createDiscordTransport();
    mockPermissions.mockReturnValue(false);
    await expect(transport.start(config, handlers())).rejects.toThrow(
      "not sendable",
    );
    await transport.close();
  });

  test("SDK cleanup failure is retryable without allowing a new login or outgoing request", async () => {
    const transport = await createDiscordTransport();
    await transport.start(config, handlers());
    mockClient.destroy.mockRejectedValueOnce(new Error("destroy failed"));
    await expect(transport.close()).rejects.toThrow("destroy failed");
    expect(mockClient.eventNames().length).toBeGreaterThan(0);
    await expect(transport.start(config, handlers())).rejects.toThrow("closed");
    await expect(transport.send("channel", "late", [])).rejects.toThrow(
      "closed",
    );
    expect(mockClient.login).toHaveBeenCalledTimes(1);
    expect(mockSend).not.toHaveBeenCalled();
    await Promise.all([transport.close(), transport.close()]);
    expect(mockClient.destroy).toHaveBeenCalledTimes(2);
    expect(mockClient.eventNames()).toHaveLength(0);
    await transport.close();
    expect(mockClient.destroy).toHaveBeenCalledTimes(2);
  });

  test("connection timeout is bounded and close clears connection waiters", async () => {
    jest.useFakeTimers();
    const login = Promise.withResolvers<string>();
    mockClient.login.mockImplementation(async () => await login.promise);
    const transport = await createDiscordTransport();
    const starting = expect(
      transport.start(config, handlers()),
    ).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(20_000);
    await starting;
    await transport.close();
    login.resolve("synthetic");
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
    expect(mockClient.eventNames()).toHaveLength(0);
  });

  test("close cancels startup immediately rather than awaiting gateway readiness", async () => {
    jest.useFakeTimers();
    const login = Promise.withResolvers<string>();
    mockClient.login.mockImplementation(async () => await login.promise);
    const transport = await createDiscordTransport();
    const starting = expect(
      transport.start(config, handlers()),
    ).rejects.toThrow("cancelled");
    await transport.close();
    await starting;
    login.resolve("synthetic");
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
    expect(mockGuild.channels.fetch).not.toHaveBeenCalled();
  });
});
