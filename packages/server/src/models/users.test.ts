import type { UserID } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as schema from "../databaseSchema";
import type { db } from "../db";
import { evaluationDatabase } from "../experimental/evaluationSupport";
import { users } from "./users";

let mockDatabase: typeof db;
jest.mock("../db", () => ({
  get db() {
    return mockDatabase;
  },
}));
const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

databaseDescribe("prepared WebSocket account metadata", () => {
  let database: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: ReturnType<typeof database.connect>;
  beforeEach(async () => {
    database = await evaluationDatabase();
    client = database.connect();
    await client.unsafe(
      await readFile(
        path.resolve(__dirname, "../../../../install/database_schema.sql"),
        "utf8",
      ),
    );
    mockDatabase = drizzle(client, { schema });
    await client`INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
      VALUES (1, 'Alice', 'alice', 'test-only', '127.0.0.1'),
        (2, 'Bob', 'bob', 'test-only', '127.0.0.2'),
        (3, 'Carol', 'carol', 'test-only', '127.0.0.3')`;
  });
  afterEach(async () => {
    await client.end({ timeout: 3 });
    await database.close();
  });

  test("missing optional rows preserve defaults and deleted users remain absent", async () => {
    expect(await users.getWSData(1, "127.0.0.1")).toEqual({
      username: "Alice",
      normalizedUsername: "alice",
      hyphenated: false,
      muted: false,
      friends: new Set(),
    });
    await client`DELETE FROM users WHERE id = 1`;
    expect(await users.getWSData(1, "127.0.0.1")).toBeUndefined();
  });

  test("concurrent parameter bindings isolate identities, directed friends, and muted addresses", async () => {
    await client`INSERT INTO user_friends (user_id, friend_id) VALUES (1, 2), (1, 3), (2, 1)`;
    await client`INSERT INTO user_settings (user_id, hyphenated_conventions) VALUES (1, true)`;
    await client`INSERT INTO muted_ips (ip) VALUES ('127.0.0.1')`;
    const [alice, bob, unmutedAlice] = await Promise.all([
      users.getWSData(1, "127.0.0.1"),
      users.getWSData(2, "127.0.0.2"),
      users.getWSData(1, "127.0.0.2"),
    ]);
    expect(alice).toEqual({
      username: "Alice",
      normalizedUsername: "alice",
      hyphenated: true,
      muted: true,
      friends: new Set([2, 3]),
    });
    expect(bob).toEqual({
      username: "Bob",
      normalizedUsername: "bob",
      hyphenated: false,
      muted: false,
      friends: new Set([1]),
    });
    expect(unmutedAlice?.muted).toBe(false);
    alice?.friends.add(99 as UserID);
    await client`DELETE FROM user_friends WHERE user_id = 1 AND friend_id = 2`;
    await client`UPDATE user_settings SET hyphenated_conventions = false WHERE user_id = 1`;
    await client`DELETE FROM muted_ips`;
    expect(await users.getWSData(1, "127.0.0.1")).toEqual({
      username: "Alice",
      normalizedUsername: "alice",
      hyphenated: false,
      muted: false,
      friends: new Set([3]),
    });
  });

  test("metadata storage failures are not mistaken for default settings or an absent account", async () => {
    await users.getWSData(1, "127.0.0.1");
    await client`ALTER TABLE user_settings RENAME TO unavailable_settings`;
    await expect(users.getWSData(1, "127.0.0.1")).rejects.toThrow();
  });
});
