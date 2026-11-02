/* eslint-disable @typescript-eslint/require-await, unicorn/no-null */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { assertDefined } from "complete-common";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { CommandAdmission } from "../commandAdmission";
import * as schema from "../databaseSchema";
import { DiscordBridge } from "../discordBridge";
import type { DiscordEvents, DiscordTransport } from "../discordTransport";
import { evaluationDatabase } from "../experimental/evaluationSupport";
import { createDiscordChatStore } from "./discordChat";

const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

databaseDescribe("durable Discord chat identity and tombstones", () => {
  let database: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: postgres.Sql;
  let store: ReturnType<typeof createDiscordChatStore>;

  beforeEach(async () => {
    database = await evaluationDatabase();
    client = database.connect();
    await client.unsafe(
      await readFile(
        path.resolve(__dirname, "../../../../install/database_schema.sql"),
        "utf8",
      ),
    );
    store = createDiscordChatStore(drizzle(client, { schema }));
    await client`TRUNCATE chat_log`;
    await client`
      INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
      VALUES (1, 'Alice', 'alice', 'test-only', '127.0.0.1')
    `;
  });
  afterEach(async () => {
    await client.end({ timeout: 3 });
    await database.close();
  });

  async function insertPublic(source = "user", room = "lobby") {
    const rows = await client<Array<{ id: number }>>`
      INSERT INTO chat_log (user_id, source, message, room)
      VALUES (${source === "user" ? 1 : 0}, ${source}, 'original', ${room}) RETURNING id
    `;
    const row = rows[0];
    assertDefined(row, "Missing inserted chat.");
    return row.id;
  }

  test("concurrent duplicate creates retain one canonical timestamp and author", async () => {
    const results = await Promise.all([
      store.insertDiscord("Discord Alice", "hello", "one"),
      store.insertDiscord("Discord Alice", "hello", "one"),
    ]);
    expect(results.filter((row) => row !== undefined)).toHaveLength(1);
    const rows =
      await client`SELECT user_id, source, discord_name, message FROM chat_log`;
    expect(rows).toEqual([
      {
        user_id: 0,
        source: "discord",
        discord_name: "Discord Alice",
        message: "hello",
      },
    ]);
  });

  test("delete-before-create survives a fresh store and repeated delete without resurrection", async () => {
    const deleted = await store.deleteDiscord("late");
    expect(deleted).toBeGreaterThan(0);
    store = createDiscordChatStore(drizzle(client, { schema }));
    expect(
      await store.insertDiscord("late author", "late text", "late"),
    ).toBeUndefined();
    expect(await store.deleteDiscord("late")).toBeUndefined();
    expect(
      await client`SELECT message, discord_name FROM chat_log WHERE deleted_at IS NOT NULL`,
    ).toEqual([{ message: "", discord_name: null }]);
  });

  test("linking a Discord copy preserves website and server authors", async () => {
    const user = await insertPublic();
    const server = await insertPublic("server");
    await store.linkDiscordMessageID(user, "user-copy");
    await store.linkDiscordMessageID(server, "server-copy");
    expect(
      await client`SELECT user_id, source, discord_message_id FROM chat_log ORDER BY id`,
    ).toEqual([
      { user_id: 1, source: "user", discord_message_id: "user-copy" },
      { user_id: 0, source: "server", discord_message_id: "server-copy" },
    ]);
    expect(await store.getPublicDiscordMessage(user)).toMatchObject({
      username: "Alice",
      source: "user",
    });
    expect(await store.deleteDiscord("user-copy")).toBe(user);
    expect(await store.getPublicDiscordMessage(user)).toBeUndefined();
    expect(
      await client`SELECT user_id, source, message FROM chat_log WHERE id = ${user}`,
    ).toEqual([{ user_id: 1, source: "user", message: "" }]);
  });

  test("outbound link after deletion tombstone scrubs original without changing identity", async () => {
    const original = await insertPublic();
    const tombstone = await store.deleteDiscord("copy");
    expect(await store.linkDiscordMessageID(original, "copy")).toBe(true);
    expect(await store.getPublicDiscordMessage(original)).toBeUndefined();
    expect(
      await client`SELECT user_id, source, message FROM chat_log WHERE id = ${original}`,
    ).toEqual([{ user_id: 1, source: "user", message: "" }]);
    expect(await store.insertDiscord("late", "late", "copy")).toBeUndefined();
    expect(
      await client`SELECT id FROM chat_log WHERE discord_message_id = 'copy'`,
    ).toEqual([{ id: tombstone }]);
  });

  test("simultaneous outbound link and deletion cannot retain visible content", async () => {
    const original = await insertPublic();
    await Promise.all([
      store.linkDiscordMessageID(original, "racing"),
      store.deleteDiscord("racing"),
    ]);
    expect(await store.getPublicDiscordMessage(original)).toBeUndefined();
    expect(await store.insertDiscord("late", "late", "racing")).toBeUndefined();
  });

  test("live ID conflicts fail explicitly and table messages cannot be linked or selected", async () => {
    const original = await insertPublic();
    const table = await insertPublic("user", "table1");
    await store.insertDiscord("Other", "other", "occupied");
    await expect(
      store.linkDiscordMessageID(original, "occupied"),
    ).rejects.toThrow("live message");
    await store.linkDiscordMessageID(table, "private-copy");
    expect(await store.getPublicDiscordMessage(table)).toBeUndefined();
    expect(
      await client`SELECT discord_message_id FROM chat_log WHERE id = ${table}`,
    ).toEqual([{ discord_message_id: null }]);
    expect(await store.getPublicDiscordMessage(original)).toMatchObject({
      message: "original",
    });
  });

  test("real persistence precedes publication; bulk deletion and delayed replay remain durable", async () => {
    let events: DiscordEvents | undefined;
    const admission = new CommandAdmission();
    const published =
      jest.fn<ConstructorParameters<typeof DiscordBridge>[0]["publishChat"]>();
    const deleted = jest.fn<(id: number) => void>();
    const transport: DiscordTransport = {
      async start(_configuration, handlers) {
        events = handlers;
        return "bot";
      },
      close: jest.fn<DiscordTransport["close"]>().mockResolvedValue(undefined),
      nickname: async () => "Nickname",
      channel: async () => "lobby",
      roles: async () => [{ id: "crew", name: "Crew" }],
      send: async () => "outbound",
      subscribe: jest
        .fn<DiscordTransport["subscribe"]>()
        .mockResolvedValue(undefined),
    };
    const bridge = new DiscordBridge({
      environment: {
        DISCORD_TOKEN: "synthetic",
        DISCORD_GUILD_ID: "100000000000000000",
        DISCORD_CHANNEL_SYNC_WITH_LOBBY: "200000000000000000",
        DISCORD_CHANNEL_WEBSITE_DEVELOPMENT: "300000000000000000",
        DISCORD_PING_CREW_ROLE_NAME: "Crew",
        DISCORD_TRUSTED_TEACHER_ROLE_NAME: "Crew",
      },
      transport,
      store,
      admission,
      publishChat: published,
      publishDeletion: deleted,
      classifyCommand: (text) => (text.startsWith("/") ? "public" : "text"),
      command: jest
        .fn<ConstructorParameters<typeof DiscordBridge>[0]["command"]>()
        .mockResolvedValue(undefined),
      log: () => undefined,
    });
    try {
      await bridge.start();
      assertDefined(events, "Missing synthetic events.");
      const message = {
        id: "first",
        channelID: "200000000000000000",
        guildID: "100000000000000000",
        authorID: "author",
        content: "hello",
      };
      events.message(message);
      events.message(message);
      events.deletion("other", ["first"]);
      events.deletion(message.channelID, ["first", "late", "", "late"]);
      events.message({ ...message, id: "late" });
      await admission.drain();
      admission.resume();
      expect(published).toHaveBeenCalledTimes(1);
      expect(deleted).toHaveBeenCalledTimes(2);
      expect(
        await client`SELECT id FROM chat_log WHERE deleted_at IS NULL`,
      ).toHaveLength(0);
      const original = await insertPublic();
      const sending = Promise.withResolvers<undefined>();
      const sent = Promise.withResolvers<string>();
      const deletion = Promise.withResolvers<undefined>();
      transport.send = async () => {
        sending.resolve(undefined);
        return await sent.promise;
      };
      deleted.mockImplementation(() => {
        deletion.resolve(undefined);
      });
      const copying = bridge.sendPublicMessage(original);
      await sending.promise;
      events.deletion(message.channelID, ["outbound"]);
      await deletion.promise;
      sent.resolve("outbound");
      await copying;
      expect(await store.getPublicDiscordMessage(original)).toBeUndefined();
      expect(deleted).toHaveBeenLastCalledWith(original);
      await client`ALTER TABLE chat_log ADD CONSTRAINT reject_new_discord CHECK (message = '') NOT VALID`;
      events.message({ ...message, id: "rejected" });
      await admission.drain();
      expect(published).toHaveBeenCalledTimes(1);
      expect(bridge.status).toBe("degraded");
      expect(
        await client`SELECT id FROM chat_log WHERE discord_message_id = 'rejected'`,
      ).toHaveLength(0);
    } finally {
      await bridge.close();
    }
  });
});
