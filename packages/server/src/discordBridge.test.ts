/* eslint-disable unicorn/no-null, @typescript-eslint/require-await */
import { describe, expect, jest, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import { CommandAdmission } from "./commandAdmission";
import { DiscordBridge } from "./discordBridge";
import type {
  DiscordConfiguration,
  DiscordEvents,
  DiscordIncomingMessage,
  DiscordTransport,
} from "./discordTransport";
import { readDiscordConfiguration } from "./discordTransport";

const config: DiscordConfiguration = {
  DISCORD_TOKEN: "synthetic-token-never-sent",
  DISCORD_GUILD_ID: "100000000000000000",
  DISCORD_CHANNEL_SYNC_WITH_LOBBY: "200000000000000000",
  DISCORD_CHANNEL_WEBSITE_DEVELOPMENT: "300000000000000000",
  DISCORD_PING_CREW_ROLE_NAME: "Ping Crew",
  DISCORD_TRUSTED_TEACHER_ROLE_NAME: "Trusted Teacher",
};
const message: DiscordIncomingMessage = {
  id: "400000000000000000",
  channelID: config.DISCORD_CHANNEL_SYNC_WITH_LOBBY,
  guildID: config.DISCORD_GUILD_ID,
  authorID: "500000000000000000",
  content: "Hello",
};

function harness(
  environment: Readonly<Record<string, string | undefined>> = config,
) {
  let events: DiscordEvents | undefined;
  const admission = new CommandAdmission();
  const transport = {
    start: jest
      .fn<DiscordTransport["start"]>()
      .mockImplementation(async (_config, handlers) => {
        events = handlers;
        return "bot";
      }),
    close: jest.fn<DiscordTransport["close"]>().mockResolvedValue(undefined),
    nickname: jest
      .fn<DiscordTransport["nickname"]>()
      .mockResolvedValue("Nickname"),
    channel: jest.fn<DiscordTransport["channel"]>().mockResolvedValue("lobby"),
    roles: jest.fn<DiscordTransport["roles"]>().mockResolvedValue([
      { id: "crew", name: "Ping Crew" },
      { id: "teacher", name: "Trusted Teacher" },
      { id: "other", name: "Other" },
    ]),
    send: jest.fn<DiscordTransport["send"]>().mockResolvedValue("copy"),
    subscribe: jest
      .fn<DiscordTransport["subscribe"]>()
      .mockResolvedValue(undefined),
  };
  type Store = ConstructorParameters<typeof DiscordBridge>[0]["store"];
  const store = {
    insertDiscord: jest.fn<Store["insertDiscord"]>().mockResolvedValue({
      chatID: 1,
      datetimeSent: new Date("2026-01-01T00:00:00Z"),
    }),
    deleteDiscord: jest.fn<Store["deleteDiscord"]>().mockResolvedValue(1),
    linkDiscordMessageID: jest
      .fn<Store["linkDiscordMessageID"]>()
      .mockResolvedValue(false),
    getPublicDiscordMessage: jest
      .fn<Store["getPublicDiscordMessage"]>()
      .mockResolvedValue({
        chatID: 7,
        source: "user",
        username: "Alice",
        message: "hi &lt;friend&gt;",
        discordMessageID: null,
      }),
  };
  const publishChat =
    jest.fn<ConstructorParameters<typeof DiscordBridge>[0]["publishChat"]>();
  const publishDeletion = jest.fn<(chatID: number) => void>();
  const command = jest
    .fn<ConstructorParameters<typeof DiscordBridge>[0]["command"]>()
    .mockResolvedValue(undefined);
  const classifyCommand = jest
    .fn<ConstructorParameters<typeof DiscordBridge>[0]["classifyCommand"]>()
    .mockImplementation((text) => (text.startsWith("/") ? "public" : "text"));
  const log = jest.fn<(text: string) => void>();
  const bridge = new DiscordBridge({
    environment,
    transport,
    store,
    admission,
    publishChat,
    publishDeletion,
    classifyCommand,
    command,
    log,
  });
  return {
    bridge,
    transport,
    store,
    admission,
    publishChat,
    publishDeletion,
    classifyCommand,
    command,
    log,
    events() {
      assertDefined(events, "Missing synthetic Discord event handlers.");
      return events;
    },
    async settle() {
      await admission.drain();
      admission.resume();
    },
  };
}

describe("optional Discord lifecycle", () => {
  test("absent configuration disables without constructing a live connection", async () => {
    const h = harness({});
    await h.bridge.start();
    expect(h.bridge.status).toBe("disabled");
    expect(h.transport.start).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("partial/unusable configuration is explicit and never exposes a token", async () => {
    expect(() =>
      readDiscordConfiguration({ DISCORD_TOKEN: config.DISCORD_TOKEN }),
    ).toThrow("DISCORD_GUILD_ID");
    const h = harness({ ...config, DISCORD_GUILD_ID: "wrong" });
    await h.bridge.start();
    expect(h.bridge.status).toBe("degraded");
    expect(h.transport.start).not.toHaveBeenCalled();
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(
      config.DISCORD_TOKEN,
    );
    await h.bridge.close();
  });

  test("connection and role failures cannot pretend to be healthy", async () => {
    const h = harness();
    h.transport.start.mockRejectedValue(new Error(config.DISCORD_TOKEN));
    await h.bridge.start();
    expect(h.bridge.status).toBe("degraded");
    expect(h.transport.close).toHaveBeenCalled();
    expect(JSON.stringify(h.log.mock.calls)).not.toContain(
      config.DISCORD_TOKEN,
    );
    const missing = harness();
    missing.transport.roles.mockResolvedValue([]);
    await missing.bridge.start();
    expect(missing.bridge.status).toBe("degraded");
    await Promise.all([h.bridge.close(), missing.bridge.close()]);
  });

  test("events participate in admission and close waits for accepted persistence", async () => {
    const h = harness();
    const completion = Promise.withResolvers<{
      chatID: number;
      datetimeSent: Date;
    }>();
    const entered = Promise.withResolvers<undefined>();
    h.store.insertDiscord.mockImplementation(async () => {
      entered.resolve(undefined);
      return await completion.promise;
    });
    await h.bridge.start();
    h.events().message(message);
    await entered.promise;
    h.admission.pause();
    h.events().message({ ...message, id: "ignored" });
    let closed = false;
    const closing = h.bridge.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    completion.resolve({ chatID: 1, datetimeSent: new Date() });
    await closing;
    expect(h.store.insertDiscord).toHaveBeenCalledTimes(1);
    expect(h.publishChat).toHaveBeenCalledTimes(1);
    expect(h.bridge.status).toBe("closed");
    h.events().message(message);
    expect(h.store.insertDiscord).toHaveBeenCalledTimes(1);
  });

  test("accepted public work renders and mirrors after admission pauses following persistence", async () => {
    const h = harness();
    const persisted = Promise.withResolvers<undefined>();
    const continueCommand = Promise.withResolvers<undefined>();
    const run = jest.spyOn(h.admission, "run");
    await h.bridge.start();
    const caller = h.admission.run(async () => {
      persisted.resolve(undefined);
      await continueCommand.promise;
      expect(await h.bridge.renderPublicMessage("<@123456789012345678>")).toBe(
        "@Nickname",
      );
      await h.bridge.sendPublicMessage(7);
    });
    await persisted.promise;
    const draining = h.admission.drain();
    h.events().message(message);
    continueCommand.resolve(undefined);
    await Promise.all([caller, draining]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(h.transport.send).toHaveBeenCalledTimes(1);
    expect(h.store.linkDiscordMessageID).toHaveBeenCalledWith(7, "copy");
    expect(h.store.insertDiscord).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("close drains active and queued outbound copies before destroying the transport", async () => {
    const h = harness();
    const sending = Promise.withResolvers<undefined>();
    const sent = Promise.withResolvers<string>();
    h.transport.send.mockImplementationOnce(async () => {
      sending.resolve(undefined);
      return await sent.promise;
    });
    await h.bridge.start();
    const first = h.bridge.sendPublicMessage(7);
    await sending.promise;
    const second = h.bridge.sendPublicMessage(8);
    const closing = h.bridge.close();
    await h.bridge.sendPublicMessage(9);
    expect(h.transport.close).not.toHaveBeenCalled();
    sent.resolve("first-copy");
    await Promise.all([first, second, closing]);
    expect(h.transport.send).toHaveBeenCalledTimes(2);
    expect(h.store.linkDiscordMessageID.mock.calls).toEqual([
      [7, "first-copy"],
      [8, "copy"],
    ]);
    expect(h.transport.close).toHaveBeenCalledTimes(1);
    expect(h.bridge.status).toBe("closed");
  });

  test("failed cleanup can be retried without reopening admission or accepting bridge work", async () => {
    const h = harness();
    h.transport.close.mockRejectedValueOnce(new Error("cleanup failed"));
    await h.bridge.start();
    h.admission.pause();
    await expect(h.bridge.close()).rejects.toThrow("cleanup failed");
    expect(h.bridge.status).toBe("degraded");
    expect(h.admission.paused).toBe(true);
    h.events().message(message);
    await h.bridge.sendPublicMessage(7);
    await h.bridge.start();
    expect(h.store.insertDiscord).not.toHaveBeenCalled();
    expect(h.transport.send).not.toHaveBeenCalled();
    expect(h.transport.start).toHaveBeenCalledTimes(1);
    await Promise.all([h.bridge.close(), h.bridge.close()]);
    expect(h.transport.close).toHaveBeenCalledTimes(2);
    expect(h.bridge.status).toBe("closed");
    expect(h.admission.paused).toBe(true);
    await h.bridge.close();
    expect(h.transport.close).toHaveBeenCalledTimes(2);
  });
});

describe("public Discord mirroring", () => {
  test("filters own echoes, DMs, other guilds/channels and identity-token commands", async () => {
    const h = harness();
    await h.bridge.start();
    for (const patch of [
      { authorID: "bot" },
      { channelID: "elsewhere" },
      { guildID: null },
      { guildID: "another" },
      { content: "/ToKeN" },
    ]) {
      h.events().message({ ...message, ...patch });
    }
    await h.settle();
    expect(h.store.insertDiscord).not.toHaveBeenCalled();
    expect(h.command).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("publishes only after persistence, suppresses duplicates and fails closed on DB errors", async () => {
    const h = harness();
    await h.bridge.start();
    h.events().message(message);
    await h.settle();
    expect(h.publishChat).toHaveBeenCalledWith({
      chatID: 1,
      datetime: "2026-01-01T00:00:00.000Z",
      msg: "Hello",
      room: "lobby",
      source: "discord",
      who: "Nickname",
    });
    h.store.insertDiscord
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("database down"));
    h.events().message(message);
    h.events().message({ ...message, id: "second" });
    await h.settle();
    expect(h.publishChat).toHaveBeenCalledTimes(1);
    expect(h.bridge.status).toBe("degraded");
    expect(h.transport.send).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("single/bulk deletes filter empty, duplicate, and unrelated channel IDs", async () => {
    const h = harness();
    await h.bridge.start();
    h.events().deletion("elsewhere", ["private"]);
    h.events().deletion(message.channelID, ["one", "", "two", "one"]);
    await h.settle();
    expect(h.store.deleteDiscord.mock.calls).toEqual([["one"], ["two"]]);
    expect(h.publishDeletion).toHaveBeenCalledTimes(2);
    await h.bridge.close();
  });

  test("outbound copies retain canonical identity and allow only configured role mentions", async () => {
    const h = harness();
    await h.bridge.start();
    h.store.linkDiscordMessageID.mockResolvedValue(true);
    await h.bridge.sendPublicMessage(7, true);
    expect(h.transport.send).toHaveBeenCalledWith(
      message.channelID,
      "<**Alice**> hi <friend>",
      ["crew", "teacher"],
    );
    expect(h.transport.send).toHaveBeenCalledTimes(1);
    expect(h.store.linkDiscordMessageID).toHaveBeenCalledWith(7, "copy");
    expect(h.publishDeletion).toHaveBeenCalledWith(7);
    expect(h.store.insertDiscord).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("website rendering preserves original mention tokens only for matching persisted public text", async () => {
    const h = harness();
    await h.bridge.start();
    const raw = "<@123456789012345678> ||hello||";
    const rendered = await h.bridge.renderPublicMessage(raw);
    expect(rendered).toBe('@Nickname <span class="spoiler">hello</span>');
    h.store.getPublicDiscordMessage.mockResolvedValue({
      chatID: 7,
      source: "user",
      username: "Alice",
      message: rendered,
      discordMessageID: null,
    });
    await h.bridge.sendPublicMessage(7, false, raw);
    expect(h.transport.send).toHaveBeenCalledWith(
      message.channelID,
      `<**Alice**> ${raw}`,
      ["crew", "teacher"],
    );
    await h.bridge.sendPublicMessage(
      7,
      false,
      "private text from an unrelated PM",
    );
    expect(h.transport.send).toHaveBeenCalledTimes(1);
    expect(h.bridge.status).toBe("degraded");
    await h.bridge.close();
    const disabled = harness({});
    await disabled.bridge.start();
    expect(await disabled.bridge.renderPublicMessage("<tag>")).toBe(
      "&lt;tag&gt;",
    );
    await disabled.bridge.close();
  });

  test("missing/private/deleted/already linked/Discord rows are not sent", async () => {
    const h = harness();
    await h.bridge.start();
    h.store.getPublicDiscordMessage
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        chatID: 1,
        source: "discord",
        message: "echo",
        username: null,
        discordMessageID: "incoming",
      })
      .mockResolvedValueOnce({
        chatID: 1,
        source: "user",
        message: "/token",
        username: "Alice",
        discordMessageID: null,
      })
      .mockResolvedValueOnce({
        chatID: 1,
        source: "user",
        message: "copied",
        username: "Alice",
        discordMessageID: "copy",
      });
    await Promise.all(
      [1, 2, 3, 4].map(async (id) => {
        await h.bridge.sendPublicMessage(id);
      }),
    );
    expect(h.transport.send).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("only explicit server notices reach the development channel; send failures do not reject core work", async () => {
    const h = harness();
    await h.bridge.start();
    h.store.getPublicDiscordMessage.mockResolvedValue({
      chatID: 1,
      source: "server",
      message: "Started.",
      username: null,
      discordMessageID: null,
    });
    await h.bridge.sendPublicMessage(1, true);
    expect(h.transport.send.mock.calls.map((call) => call[0])).toEqual([
      message.channelID,
      config.DISCORD_CHANNEL_WEBSITE_DEVELOPMENT,
    ]);
    h.transport.send.mockRejectedValue(new Error("network"));
    await expect(h.bridge.sendPublicMessage(2)).resolves.toBeUndefined();
    expect(h.bridge.status).toBe("degraded");
    await h.bridge.close();
  });

  test.each(["subscribe", "unsubscribe"])(
    "%s is reachable on any line; role mutation is deduplicated",
    async (command) => {
      const h = harness();
      await h.bridge.start();
      h.events().message({
        ...message,
        content: `hello\n/${command.toUpperCase()}`,
      });
      await h.settle();
      expect(h.transport.subscribe).toHaveBeenCalledWith(
        message.authorID,
        "crew",
        command === "subscribe",
      );
      expect(h.store.insertDiscord).toHaveBeenNthCalledWith(
        1,
        "Nickname",
        `/${command}`,
        message.id,
      );
      expect(h.publishChat).toHaveBeenCalledTimes(1);
      expect(h.command).not.toHaveBeenCalled();
      h.store.insertDiscord.mockResolvedValue(undefined);
      h.events().message({ ...message, content: `/${command}` });
      await h.settle();
      expect(h.transport.subscribe).toHaveBeenCalledTimes(1);
      await h.bridge.close();
    },
  );

  test("public commands go to the dispatcher after persistence without fabricating a WS user", async () => {
    const h = harness();
    await h.bridge.start();
    h.command.mockImplementation(async () => {
      expect(h.store.insertDiscord).toHaveBeenCalledTimes(1);
      expect(h.publishChat).toHaveBeenCalledTimes(1);
    });
    h.events().message({ ...message, content: '  /replay <b>& "quoted"\n ' });
    await h.settle();
    expect(h.command).toHaveBeenCalledWith({
      text: '/replay <b>& "quoted"',
      username: "Nickname",
      chatID: 1,
      datetime: "2026-01-01T00:00:00.000Z",
    });
    expect(h.publishChat).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "/replay &lt;b&gt;&amp; &#34;quoted&#34;",
      }),
    );
    expect(h.publishChat).toHaveBeenCalledTimes(1);
    expect(h.transport.send).not.toHaveBeenCalled();
    await h.bridge.close();
  });

  test("a public command can await its persisted server response without queue deadlock", async () => {
    const h = harness();
    const completed = Promise.withResolvers<undefined>();
    h.command.mockImplementation(async () => {
      h.admission.pause();
      expect(await h.bridge.renderPublicMessage("<@123456789012345678>")).toBe(
        "@Nickname",
      );
      await h.bridge.sendPublicMessage(7);
      completed.resolve(undefined);
    });
    await h.bridge.start();
    h.events().message({ ...message, content: "/uptime" });
    await completed.promise;
    await h.settle();
    expect(h.transport.send).toHaveBeenCalledTimes(1);
    expect(h.publishChat).toHaveBeenCalledTimes(1);
    await h.bridge.close();
  });

  test.each(["private", "unknown"] as const)(
    "%s commands are filtered before persistence, lookup, and publication",
    async (classification) => {
      const h = harness();
      await h.bridge.start();
      h.classifyCommand.mockReturnValue(classification);
      h.events().message({
        ...message,
        content: classification === "private" ? "/help" : "/unknown",
      });
      await h.settle();
      expect(h.store.insertDiscord).not.toHaveBeenCalled();
      expect(h.transport.nickname).not.toHaveBeenCalled();
      expect(h.publishChat).not.toHaveBeenCalled();
      expect(h.command).not.toHaveBeenCalled();
      expect(h.transport.send).not.toHaveBeenCalled();
      await h.bridge.close();
    },
  );

  test("role failures produce an explicit Discord error, not a successful subscription notice", async () => {
    const h = harness();
    await h.bridge.start();
    h.transport.subscribe.mockRejectedValue(new Error("forbidden"));
    h.events().message({ ...message, content: "/subscribe" });
    await h.settle();
    expect(h.store.insertDiscord).toHaveBeenCalledTimes(1);
    expect(h.publishChat).not.toHaveBeenCalled();
    expect(h.transport.send).toHaveBeenCalledWith(
      message.channelID,
      "Error: the `@Ping Crew` role could not be added to your profile.",
      [],
    );
    expect(h.bridge.status).toBe("degraded");
    await h.bridge.close();
  });

  test("event capacity is bounded and reported while accepted work can drain", async () => {
    const h = harness();
    const completion = Promise.withResolvers<undefined>();
    h.store.insertDiscord.mockImplementation(async () => {
      await completion.promise;
      return undefined;
    });
    await h.bridge.start();
    for (let i = 0; i < 1001; i++) {
      h.events().message({ ...message, id: String(i) });
    }
    expect(h.log).toHaveBeenCalledWith(
      "Discord event capacity failed; integration is degraded.",
    );
    completion.resolve(undefined);
    await h.bridge.close();
    expect(h.store.insertDiscord).toHaveBeenCalledTimes(1000);
    expect(h.bridge.status).toBe("closed");
  });
});
