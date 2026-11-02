import type { GameID, UserID } from "@hanabi-live/data";
import { settings } from "@hanabi-live/data";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { drizzle } from "drizzle-orm/postgres-js";
import { fastify } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { parseGameQuery } from "../apiQuery";
import * as schema from "../databaseSchema";
import type { db } from "../db";
import { evaluationDatabase } from "../experimental/evaluationSupport";
import { httpExport } from "../http/httpExport";
import { bannedIPs } from "./bannedIPs";
import { chatLog } from "./chatLog";
import { chatLogPM } from "./chatLogPM";
import { gameQueries } from "./gameQueries";
import { games } from "./games";
import { userFriends } from "./userFriends";
import { userLinkages } from "./userLinkages";
import { userSettings } from "./userSettings";
import { userStats } from "./userStats";
import { users } from "./users";

let mockDatabase: typeof db;
jest.mock("../db", () => ({
  get db() {
    return mockDatabase;
  },
}));
jest.mock("../logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

async function insertGame(id: number, day: number, speedrun = false) {
  await mockDatabase.insert(schema.gamesTable).values({
    id,
    name: "history",
    numPlayers: 2,
    startingPlayer: 0,
    variantID: 0,
    timed: false,
    timeBase: 120,
    timePerTurn: 10,
    speedrun,
    cardCycle: false,
    deckPlays: false,
    emptyClues: false,
    oneExtraCard: false,
    oneLessCard: false,
    allOrNothing: false,
    detrimentalCharacters: false,
    seed: "p2v0s1",
    score: 25,
    numTurns: 40,
    endCondition: 1,
    datetimeStarted: new Date("2026-01-01T00:00:00Z"),
    datetimeFinished: new Date(`2026-01-0${day}T01:00:00Z`),
  });
}

databaseDescribe("application history and settings persistence", () => {
  let database: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: postgres.Sql;

  test("pregame stats return Go zero defaults and the requested user's variant only", async () => {
    expect(await userStats.get(1 as UserID, 0)).toEqual({
      numGames: 0,
      averageScore: 0,
      numStrikeouts: 0,
      bestScores: [2, 3, 4, 5, 6].map((numPlayers) => ({
        numPlayers,
        score: 0,
        modifier: 0,
      })),
    });
    await client`
      INSERT INTO user_stats (user_id, variant_id, num_games, best_score2, best_score2_mod, average_score, num_strikeouts)
      VALUES (1, 0, 7, 25, 4, 22.5, 2), (2, 0, 99, 10, 0, 10, 0), (1, 1, 88, 15, 0, 15, 0)
    `;
    const stats = await userStats.get(1 as UserID, 0);
    expect(stats).toMatchObject({
      numGames: 7,
      averageScore: 22.5,
      numStrikeouts: 2,
    });
    expect(stats.bestScores[0]).toEqual({
      numPlayers: 2,
      score: 25,
      modifier: 4,
    });
  });

  beforeEach(async () => {
    database = await evaluationDatabase();
    client = database.connect();
    const schemaSQL = await readFile(
      path.resolve(__dirname, "../../../../install/database_schema.sql"),
      "utf8",
    );
    await client.unsafe(schemaSQL);
    mockDatabase = drizzle(client, { schema });
    await client`
      INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
      VALUES
        (1, 'alice', 'alice', 'test-only', '127.0.0.1'),
        (2, 'Bob', 'bob', 'test-only', '127.0.0.1'),
        (3, 'Other', 'other', 'test-only', '127.0.0.1')
    `;
  });

  afterEach(async () => {
    await client.end({ timeout: 3 });
    await database.close();
  });

  test("counts participation by game_id, not the unrelated participant ID", async () => {
    await insertGame(10, 3);
    await insertGame(20, 2, true);
    await insertGame(30, 2);
    await client`UPDATE games SET end_condition = 2, score = 0 WHERE id = 30`;
    await client`
      INSERT INTO game_participants
        (id, game_id, user_id, seat, character_assignment, character_metadata)
      VALUES
        (101, 10, 1, 0, -1, 0), (102, 20, 1, 0, -1, 0),
        (103, 30, 1, 0, -1, 0)
    `;
    expect(await games.getNumGamesForUser(1 as UserID, true)).toBe(2);
    expect(await games.getNumGamesForUser(1 as UserID, false)).toBe(1);
    expect(await games.getNumGamesForUser(2 as UserID, true)).toBe(0);
  });

  test("loads multiple games with options, names, tags and completion-based ordering", async () => {
    await insertGame(10, 3);
    await insertGame(20, 2);
    await client`
      INSERT INTO game_participants
        (game_id, user_id, seat, character_assignment, character_metadata)
      VALUES
        (10, 2, 0, -1, 0), (10, 1, 1, -1, 0),
        (20, 1, 0, -1, 0), (20, 3, 1, -1, 0)
    `;
    await client`
      INSERT INTO game_tags (game_id, user_id, tag)
      VALUES (10, 1, 'z'), (10, 2, 'a'), (10, 2, 'z')
    `;
    await client`
      INSERT INTO seeds (seed, num_games) VALUES ('p2v0s1', 2), ('other', 999)
    `;
    const ids = await games.getGameIDsForUser(1 as UserID, 0, 10);
    expect(ids).toEqual([10, 20]);
    const history = await games.getHistory(ids);
    expect(history.map((game) => game.id)).toEqual([10, 20]);
    expect(history[0]).toMatchObject({
      options: {
        numPlayers: 2,
        variantID: 0,
        variantName: "No Variant",
        timeBase: 120,
        timePerTurn: 10,
      },
      playerNames: ["alice", "Bob"],
      tags: "a, z",
      numGamesOnThisSeed: 2,
      incrementNumGames: false,
      datetimeFinished: new Date("2026-01-03T01:00:00Z"),
    });
    expect(history[1]?.tags).toBe("");
    const seedIDs = await games.getGameIDsForSeed("p2v0s1");
    const ranked = await games.getHistory(seedIDs, "seed");
    expect(ranked.map((game) => game.id)).toEqual([20, 10]);
    expect(await games.getHistory([999 as GameID])).toEqual([]);
  });

  test("friend history excludes shared games and paginates by completion time", async () => {
    await insertGame(10, 3);
    await insertGame(20, 2);
    await insertGame(30, 1);
    await client`
      INSERT INTO game_participants
        (game_id, user_id, seat, character_assignment, character_metadata)
      VALUES
        (10, 1, 0, -1, 0), (10, 2, 1, -1, 0),
        (20, 2, 0, -1, 0), (20, 3, 1, -1, 0),
        (30, 2, 0, -1, 0), (30, 3, 1, -1, 0)
    `;
    const ids = await games.getGameIDsForUserFriends(
      1 as UserID,
      new Set([2 as UserID]),
      1,
      1,
    );
    expect(ids).toEqual([30]);
  });

  test("concurrent first settings writes preserve both values without duplicate rows", async () => {
    await Promise.all([
      userSettings.set(1 as UserID, "volume", 0),
      userSettings.set(1 as UserID, "hyphenatedConventions", true),
      userSettings.set(1 as UserID, "createTableTimeBaseMinutes", 2.5),
    ]);
    const rows = await client`SELECT user_id FROM user_settings`;
    expect(rows).toHaveLength(1);
    const saved = settings.parse(await userSettings.get(1 as UserID));
    expect(saved).toMatchObject({
      volume: 0,
      hyphenatedConventions: true,
      createTableTimeBaseMinutes: 2.5,
    });
    await expect(userSettings.set(999 as UserID, "volume", 1)).rejects.toThrow(
      "missing user",
    );
  });

  test("chat insertion returns the same durable identity and timestamp as history", async () => {
    const stored = await chatLog.insert(1 as UserID, "&lt;hello&gt;", "lobby");
    const history = await chatLog.get("lobby", 1);
    expect(history[0]).toMatchObject({
      chatID: stored.chatID,
      datetimeSent: stored.datetimeSent,
      source: "user",
      username: "alice",
      message: "&lt;hello&gt;",
    });
  });

  test("concurrent friend requests create one forward and reverse relationship", async () => {
    const changes = await Promise.all([
      userFriends.set(1 as UserID, 2 as UserID, true),
      userFriends.set(1 as UserID, 2 as UserID, true),
    ]);
    expect(changes.filter(Boolean)).toHaveLength(1);
    const forward = await client`SELECT user_id, friend_id FROM user_friends`;
    const reverse =
      await client`SELECT user_id, friend_id FROM user_reverse_friends`;
    expect([...forward]).toEqual([{ user_id: 1, friend_id: 2 }]);
    expect([...reverse]).toEqual([{ user_id: 2, friend_id: 1 }]);
    expect(await userFriends.getList(1 as UserID)).toEqual(["Bob"]);
    expect(await userFriends.set(1 as UserID, 2 as UserID, false)).toBe(true);
    expect(await userFriends.getList(1 as UserID)).toEqual([]);
    expect(await client`SELECT user_id FROM user_reverse_friends`).toHaveLength(
      0,
    );
    expect(await userFriends.set(1 as UserID, 2 as UserID, false)).toBe(false);
  });

  test("a failed reverse-friend write rolls back the forward relation", async () => {
    await client`
      ALTER TABLE user_reverse_friends
      ADD CONSTRAINT injected_relation_failure CHECK (friend_id <> 1)
    `;
    await expect(
      userFriends.set(1 as UserID, 2 as UserID, true),
    ).rejects.toThrow();
    expect(await client`SELECT user_id FROM user_friends`).toHaveLength(0);
    expect(await client`SELECT user_id FROM user_reverse_friends`).toHaveLength(
      0,
    );
    await client`
      ALTER TABLE user_reverse_friends DROP CONSTRAINT injected_relation_failure
    `;
    expect(await userFriends.set(1 as UserID, 2 as UserID, true)).toBe(true);
  });

  test("account links are directional, duplicate-safe and sorted for display", async () => {
    const changes = await Promise.all([
      userLinkages.set(1 as UserID, 3 as UserID, true),
      userLinkages.set(1 as UserID, 3 as UserID, true),
    ]);
    expect(changes.filter(Boolean)).toHaveLength(1);
    await userLinkages.set(1 as UserID, 2 as UserID, true);
    expect(await userLinkages.getList(1 as UserID)).toEqual(["Bob", "Other"]);
    expect(await userLinkages.getList(2 as UserID)).toEqual([]);
    expect(await userLinkages.set(1 as UserID, 2 as UserID, false)).toBe(true);
    expect(await userLinkages.set(1 as UserID, 2 as UserID, false)).toBe(false);
    expect(await userLinkages.getList(1 as UserID)).toEqual(["Other"]);
  });

  test("private history paginates only the requesting participant's messages", async () => {
    const first = await chatLogPM.insert(1 as UserID, 2 as UserID, "first");
    const second = await chatLogPM.insert(2 as UserID, 1 as UserID, "second");
    await chatLogPM.insert(2 as UserID, 3 as UserID, "not visible to Alice");
    const latest = await chatLogPM.getHistory(1 as UserID, 1, 0);
    expect(latest.hasMore).toBe(true);
    expect(latest.list.map((message) => message.pmID)).toEqual([second.pmID]);
    const older = await chatLogPM.getHistory(1 as UserID, 1, second.pmID);
    expect(older.hasMore).toBe(false);
    expect(older.list.map((message) => message.pmID)).toEqual([first.pmID]);
    const all = await chatLogPM.getHistory(1 as UserID, 100, -1);
    expect(all.list.map((message) => message.pmID)).toEqual([
      first.pmID,
      second.pmID,
    ]);
    const unrelated = await chatLogPM.getHistory(
      3 as UserID,
      100,
      undefined,
      1 as UserID,
    );
    expect(unrelated.list).toEqual([]);
  });

  test("authentication sees newly added and removed bans without a process restart", async () => {
    expect(await bannedIPs.check("127.0.0.2")).toBe(false);
    await client`INSERT INTO banned_ips (ip) VALUES ('127.0.0.2')`;
    expect(await bannedIPs.check("127.0.0.2")).toBe(true);
    await client`DELETE FROM banned_ips WHERE ip = '127.0.0.2'`;
    expect(await bannedIPs.check("127.0.0.2")).toBe(false);
  });

  test("legacy password migration writes the modern hash and clears the old verifier together", async () => {
    await client`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`;
    await client`
      UPDATE users SET password_hash = NULL, old_password_hash = 'synthetic-old-hash'
      WHERE id = 1
    `;
    const old = await users.get("alice");
    expect(old?.passwordHash).toBeNull();
    expect(old?.oldPasswordHash).toBe("synthetic-old-hash");
    await users.setPassword(1, "synthetic-modern-hash");
    const updated = await users.get("alice");
    expect(updated?.passwordHash).toBe("synthetic-modern-hash");
    expect(updated?.oldPasswordHash).toBeNull();
  });

  test("public game queries intersect players, paginate, and keep games without a seed cache row", async () => {
    await insertGame(10, 3);
    await insertGame(20, 2);
    await insertGame(30, 1);
    await client`
      INSERT INTO game_participants
        (game_id, user_id, seat, character_assignment, character_metadata)
      VALUES
        (10, 1, 0, -1, 0), (10, 2, 1, -1, 0),
        (20, 1, 0, -1, 0), (20, 3, 1, -1, 0),
        (30, 2, 0, -1, 0), (30, 3, 1, -1, 0)
    `;
    const shared = await gameQueries.list({
      ...parseGameQuery({}, "history"),
      userIDs: [1 as UserID, 2 as UserID],
    });
    expect(shared.totalRows).toBe(1);
    expect(shared.rows).toHaveLength(1);
    expect(shared.rows[0]).toMatchObject({
      id: 10,
      users: "alice, Bob",
      other_scores: 0,
      variant: 0,
    });
    const page = await gameQueries.list({
      ...parseGameQuery({ page: "1", size: "1" }, "history"),
      userIDs: [1 as UserID],
    });
    expect(page.totalRows).toBe(2);
    expect(page.rows.map((row) => row.id)).toEqual([10]);
    expect(
      await gameQueries.fullIDs({
        userIDs: [1 as UserID],
        start: 11,
        end: 20,
      }),
    ).toEqual([20]);
    const empty = await gameQueries.list({
      ...parseGameQuery({ size: "0" }, "variant"),
      variantID: 0,
    });
    expect(empty).toEqual({ totalRows: 3, rows: [] });
  });

  test("exports actual history with seeded cards, seat order, action order and authored notes", async () => {
    await insertGame(10, 3);
    await client`UPDATE games SET starting_player = 1, detrimental_characters = TRUE WHERE id = 10`;
    await client`
      INSERT INTO game_participants
        (id, game_id, user_id, seat, character_assignment, character_metadata)
      VALUES (301, 10, 2, 0, 0, 2), (302, 10, 1, 1, 24, 0)
    `;
    await client`
      INSERT INTO game_actions (game_id, turn, type, target, value)
      VALUES (10, 2, 0, 9, 0), (10, 1, 2, 1, 0)
    `;
    await client`
      INSERT INTO game_participant_notes (game_participant_id, card_order, note)
      VALUES (301, 0, 'first'), (301, 54, 'stack base'), (302, 2, 'Alice note')
    `;
    const server = fastify();
    server.get("/export/:databaseID", httpExport);
    try {
      const response = await server.inject({ url: "/export/10" });
      expect(response.statusCode).toBe(200);
      const exported: unknown = response.json();
      expect(exported).toMatchObject({
        id: 10,
        players: ["Bob", "alice"],
        options: { startingPlayer: 1, detrimentalCharacters: true },
        actions: [
          { type: 2, target: 1, value: 0 },
          { type: 0, target: 9, value: 0 },
        ],
        characters: [
          { name: "Fuming", metadata: 1 },
          { name: "Genius", metadata: -1 },
        ],
        notes: [
          expect.arrayContaining(["first", "stack base"]),
          ["", "", "Alice note"],
        ],
        seed: "p2v0s1",
        deck: expect.arrayContaining([{ suitIndex: 3, rank: 5 }]),
      });
      const missing = await server.inject({ url: "/export/999" });
      expect(missing.statusCode).toBe(404);
      const invalid = await server.inject({ url: "/export/not-an-id" });
      expect(invalid.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });
});
