import type { UserID } from "@hanabi-live/data";
import { describe, expect, jest, test } from "@jest/globals";
import { drizzle } from "drizzle-orm/postgres-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as schema from "../databaseSchema";
import type { db } from "../db";
import { evaluationDatabase } from "../experimental/evaluationSupport";
import { userLinkages } from "./userLinkages";

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

databaseDescribe("linked-account seed exclusion", () => {
  test("includes played seeds and directed linked accounts, without reverse or transitive expansion", async () => {
    const database = await evaluationDatabase();
    const client = database.connect();
    try {
      const sql = await readFile(
        path.resolve(__dirname, "../../../../install/database_schema.sql"),
        "utf8",
      );
      await client.unsafe(sql);
      mockDatabase = drizzle(client, { schema });
      await client`INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
        VALUES (1, 'Alice', 'alice', 'test-only', '127.0.0.1'),
        (2, 'Bob', 'bob', 'test-only', '127.0.0.1'),
        (3, 'Carol', 'carol', 'test-only', '127.0.0.1')`;
      await mockDatabase.insert(schema.gamesTable).values(
        [1, 2, 3].map((id) => ({
          id,
          name: "seed fixture",
          numPlayers: 2,
          startingPlayer: 0,
          variantID: 0,
          timed: false,
          timeBase: 0,
          timePerTurn: 0,
          speedrun: false,
          cardCycle: false,
          deckPlays: false,
          emptyClues: false,
          oneExtraCard: false,
          oneLessCard: false,
          allOrNothing: false,
          detrimentalCharacters: false,
          seed: `p2v0s${id}`,
          score: 0,
          numTurns: 1,
          endCondition: 4,
          datetimeStarted: new Date(0),
          datetimeFinished: new Date(1000),
        })),
      );
      await client`INSERT INTO game_participants (game_id, user_id, seat, character_assignment, character_metadata)
        VALUES (1, 1, 0, -1, -1), (2, 2, 0, -1, -1), (3, 3, 0, -1, -1)`;
      await userLinkages.set(1 as UserID, 2 as UserID, true);
      await userLinkages.set(2 as UserID, 3 as UserID, true);
      expect(await userLinkages.getBlockedSeeds([1 as UserID])).toEqual(
        new Set(["p2v0s1", "p2v0s2"]),
      );
      expect(await userLinkages.getBlockedSeeds([3 as UserID])).toEqual(
        new Set(["p2v0s3"]),
      );
      expect(
        await userLinkages.getBlockedSeeds([1 as UserID, 3 as UserID]),
      ).toEqual(new Set(["p2v0s1", "p2v0s2", "p2v0s3"]));
    } finally {
      await client.end({ timeout: 3 });
      await database.close();
    }
  });
});
