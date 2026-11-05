import type { GameID, UserID } from "@hanabi-live/data";
import { defaultOptions, EndCondition } from "@hanabi-live/game";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type postgres from "postgres";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import type { CompletedGame, GameStore } from "./gameStore";
import { createGameStore } from "./gameStore";

const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

function completed(id: GameID): CompletedGame {
  return {
    id,
    name: "Durable game",
    options: defaultOptions,
    seed: "p2v0s1",
    score: 1,
    numTurns: 1,
    endCondition: EndCondition.Normal,
    datetimeStarted: new Date("2026-01-01T00:00:00Z"),
    datetimeFinished: new Date("2026-01-01T00:01:00Z"),
    players: [
      {
        userID: 1 as UserID,
        character: "",
        characterMetadata: -1,
        notes: ["saved note"],
      },
      { userID: 2 as UserID, character: "", characterMetadata: -1, notes: [] },
    ],
    actions: [{ type: 0, target: 9, value: 0 }],
    chat: [{ userID: 1, message: "saved chat", room: "table123" }],
    tags: [{ userID: 2 as UserID, tag: "saved-tag" }],
  };
}

async function occupyPool(client: postgres.Sql) {
  const ready = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let started = 0;
  const holders = Array.from({ length: client.options.max }, async () => {
    await client.begin(async (tx) => {
      await tx`SELECT 1`;
      started++;
      if (started === client.options.max) {
        ready.resolve(undefined);
      }
      await release.promise;
    });
  });
  const settled = Promise.all(holders);
  try {
    await Promise.race([ready.promise, settled]);
  } catch (error) {
    release.resolve(undefined);
    await Promise.allSettled(holders);
    throw error;
  }
  return async () => {
    release.resolve(undefined);
    await settled;
  };
}

databaseDescribe("durable application game storage", () => {
  let database: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: postgres.Sql;
  let statisticsClient: postgres.Sql;
  let store: GameStore;

  beforeEach(async () => {
    database = await evaluationDatabase();
    client = database.connect();
    statisticsClient = database.connect();
    const schema = await readFile(
      path.resolve(__dirname, "../../../install/database_schema.sql"),
      "utf8",
    );
    await client.unsafe(schema);
    await client`
      INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
      VALUES
        (1, 'Alice', 'alice', 'test-only', '127.0.0.1'),
        (2, 'Bob', 'bob', 'test-only', '127.0.0.1')
    `;
    store = createGameStore(client, statisticsClient);
  });

  afterEach(async () => {
    await store.close();
    await statisticsClient.end({ timeout: 5 });
    await database.close();
  });

  test("reserves IDs without rows and fences stale or competing checkpoint writers", async () => {
    const id = await store.reserveID();
    const next = await store.reserveID();
    expect(next).toBeGreaterThan(id);
    expect(await client`SELECT id FROM games`).toHaveLength(0);
    expect(await store.save(id, 0, "first")).toBe(1);
    const other = createGameStore(database.connect(), statisticsClient);
    try {
      const attempts = await Promise.allSettled([
        store.save(id, 1, "second"),
        other.save(id, 1, "competing"),
      ]);
      expect(
        attempts.filter((attempt) => attempt.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        attempts.filter((attempt) => attempt.status === "rejected"),
      ).toHaveLength(1);
      const loaded = await store.load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({ id, revision: 2 });
      await expect(store.save(id, 0, "stale")).rejects.toThrow("conflicts");
      await expect(store.save(next, 5, "skipped revision")).rejects.toThrow(
        "conflicts",
      );
    } finally {
      await other.close();
    }
  });

  test("rejects an invalid stored game identity before restoring its checkpoint", async () => {
    await client`
      INSERT INTO active_games (game_id, revision, checkpoint) VALUES (0, 1, 'invalid')
    `;
    await expect(store.load()).rejects.toThrow("identity");
  });

  test("atomically commits authored metadata and retries without duplicate rows", async () => {
    const id = await store.reserveID();
    const record = completed(id);
    await store.save(id, 0, "terminal");
    const first = await store.complete(record, 1);
    expect(first.inserted).toBe(true);
    expect(await store.completed(id)).toBe(true);
    expect(await store.load()).toEqual([]);
    const repeated = await store.complete(
      {
        ...record,
        datetimeFinished: new Date("2026-01-02T00:00:00Z"),
      },
      1,
    );
    expect(repeated).toEqual({ ...first, inserted: false });
    expect(await client`SELECT id FROM games`).toHaveLength(1);
    expect(await client`SELECT id FROM game_participants`).toHaveLength(2);
    expect(await client`SELECT game_id FROM game_actions`).toHaveLength(1);
    expect(await client`SELECT note FROM game_participant_notes`).toHaveLength(
      1,
    );
    expect(
      await client`SELECT id FROM chat_log WHERE room = 'table123'`,
    ).toHaveLength(1);
    expect(await client`SELECT game_id FROM game_tags`).toHaveLength(1);
    await expect(store.save(id, 1, "resurrection")).rejects.toThrow(
      "completion",
    );
    await expect(store.complete({ ...record, score: 2 }, 1)).rejects.toThrow(
      "conflicts",
    );
    await expect(
      store.complete(
        {
          ...record,
          players: record.players.toReversed(),
        },
        1,
      ),
    ).rejects.toThrow("participants");
    await expect(
      store.complete(
        {
          ...record,
          actions: [{ type: 0, target: 10, value: 0 }],
        },
        1,
      ),
    ).rejects.toThrow("actions");
  });

  test("rejects completed rows with incompatible timestamp types", async () => {
    const id = await store.reserveID();
    const record = completed(id);
    await store.save(id, 0, "terminal");
    await store.complete(record, 1);
    await client`
      ALTER TABLE games ALTER COLUMN datetime_finished TYPE text
      USING datetime_finished::text
    `;
    const recovering = createGameStore(database.connect(), statisticsClient);
    try {
      await expect(recovering.complete(record, 1)).rejects.toThrow(
        "datetime_finished",
      );
    } finally {
      await recovering.close();
    }
    expect(await client`SELECT id FROM games`).toHaveLength(1);
  });

  test("metadata failure rolls back the game and retains its recovery checkpoint", async () => {
    const id = await store.reserveID();
    const record = completed(id);
    await store.save(id, 0, "terminal");
    await client`
      ALTER TABLE game_tags ADD CONSTRAINT injected_save_failure CHECK (tag <> 'saved-tag')
    `;
    await expect(store.complete(record, 1)).rejects.toThrow();
    expect(await client`SELECT id FROM games`).toHaveLength(0);
    expect(await client`SELECT id FROM game_participants`).toHaveLength(0);
    expect(await client`SELECT game_id FROM game_actions`).toHaveLength(0);
    expect(await client`SELECT note FROM game_participant_notes`).toHaveLength(
      0,
    );
    expect(
      await client`SELECT id FROM chat_log WHERE room = 'table123'`,
    ).toHaveLength(0);
    expect(await store.load()).toEqual([{ id, revision: 1, data: "terminal" }]);
    await client`ALTER TABLE game_tags DROP CONSTRAINT injected_save_failure`;
    const saved = await store.complete(record, 1);
    expect(saved.inserted).toBe(true);
  });

  test.each([
    { character: "Dumbfounded", metadata: 2, assignment: 1, storedMetadata: 3 },
    {
      character: "Conservative",
      metadata: 4,
      assignment: 4,
      storedMetadata: 0,
    },
  ])(
    "preserves Go character encoding for $character and unassigned seats",
    async ({ character, metadata, assignment, storedMetadata }) => {
      const id = await store.reserveID();
      const record = {
        ...completed(id),
        options: { ...defaultOptions, detrimentalCharacters: true },
        players: [
          {
            userID: 1 as UserID,
            character,
            characterMetadata: metadata,
            notes: [],
          },
          {
            userID: 2 as UserID,
            character: "n/a",
            characterMetadata: -1,
            notes: [],
          },
        ],
      };
      await store.save(id, 0, "terminal");
      await store.complete(record, 1);
      const rows = await client`
      SELECT character_assignment, character_metadata FROM game_participants
      WHERE game_id = ${id} ORDER BY seat
    `;
      expect(rows).toEqual([
        {
          character_assignment: assignment,
          character_metadata: storedMetadata,
        },
        { character_assignment: -1, character_metadata: 0 },
      ]);
    },
  );

  test("completion requires the current checkpoint revision", async () => {
    const id = await store.reserveID();
    await store.save(id, 0, "first");
    await store.save(id, 1, "terminal");
    await expect(store.complete(completed(id), 1)).rejects.toThrow("revision");
    expect(await client`SELECT id FROM games`).toHaveLength(0);
    const loaded = await store.load();
    expect(loaded[0]?.revision).toBe(2);
  });

  test("refreshes seed and score caches idempotently across concurrent completions", async () => {
    async function persist(overrides: Partial<CompletedGame>) {
      const id = await store.reserveID();
      const record = { ...completed(id), ...overrides };
      await store.save(id, 0, "terminal");
      await store.complete(record, 1);
      return record;
    }

    const modified = await persist({
      score: 10,
      options: { ...defaultOptions, deckPlays: true },
    });
    const normal = await persist({ score: 10 });
    await Promise.all([
      store.refreshStatistics(modified),
      store.refreshStatistics(normal),
    ]);
    const failed = await persist({
      score: 0,
      endCondition: EndCondition.Strikeout,
    });
    await store.refreshStatistics(failed);
    await store.refreshStatistics(modified);
    const users = await client`SELECT * FROM user_stats ORDER BY user_id`;
    expect(users).toHaveLength(2);
    expect(users[0]).toMatchObject({
      best_score2: 10,
      best_score2_mod: 0,
      num_games: 3,
      average_score: 10,
      num_strikeouts: 1,
    });
    const variants = await client`SELECT * FROM variant_stats`;
    expect(variants[0]).toMatchObject({
      best_score2: 10,
      num_games: 3,
      average_score: 10,
      num_strikeouts: 1,
      num_max_scores: 0,
    });

    // Go includes speedruns in best-score updates, but not aggregate counts.
    const speedrun = await persist({
      score: 25,
      options: { ...defaultOptions, speedrun: true },
    });
    await store.refreshStatistics(speedrun);
    const updated = await client`SELECT * FROM user_stats WHERE user_id = 1`;
    expect(updated[0]).toMatchObject({
      best_score2: 25,
      num_games: 3,
      average_score: 10,
    });
    const seeds =
      await client`SELECT num_games FROM seeds WHERE seed = 'p2v0s1'`;
    expect(seeds[0]).toEqual({ num_games: 4 });
  });

  test("failed derived statistics do not undo a completed game and can be retried", async () => {
    const id = await store.reserveID();
    const record = completed(id);
    await store.save(id, 0, "terminal");
    await store.complete(record, 1);
    await client`
      ALTER TABLE variant_stats ADD CONSTRAINT injected_stats_failure CHECK (num_games = 0)
    `;
    await expect(store.refreshStatistics(record)).rejects.toThrow();
    expect(await store.completed(id)).toBe(true);
    expect(await store.load()).toEqual([]);
    expect(await client`SELECT user_id FROM user_stats`).toHaveLength(0);
    await client`ALTER TABLE variant_stats DROP CONSTRAINT injected_stats_failure`;
    await store.refreshStatistics(record);
    const rows =
      await client`SELECT num_games FROM user_stats WHERE user_id = 1`;
    expect(rows[0]).toEqual({ num_games: 1 });
  });

  test("queued statistics do not consume the checkpoint pool", async () => {
    const id = await store.reserveID();
    const record = completed(id);
    await store.save(id, 0, "terminal");
    await store.complete(record, 1);
    const activeID = await store.reserveID();
    const release = await occupyPool(statisticsClient);
    const refreshes = Array.from({ length: client.options.max }, async () => {
      await store.refreshStatistics(record);
    });
    try {
      expect(await store.save(activeID, 0, "accepted")).toBe(1);
      expect(await client`SELECT seed FROM seeds`).toHaveLength(0);
    } finally {
      await release();
      await Promise.all(refreshes);
    }
    const seeds =
      await client`SELECT num_games FROM seeds WHERE seed = ${record.seed}`;
    expect(seeds[0]).toEqual({ num_games: 1 });
  });

  test("a checkpoint waiting behind completion takes a fresh snapshot after the advisory lock", async () => {
    const sourceID = await store.reserveID();
    await store.save(sourceID, 0, "terminal");
    await store.complete(completed(sourceID), 1);
    const id = await store.reserveID();
    const ready = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const writer = client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(17482, ${id})`;
      await tx`
        INSERT INTO games
        SELECT ${id}, name, num_players, starting_player, variant_id, timed,
          time_base, time_per_turn, speedrun, card_cycle, deck_plays, empty_clues,
          one_extra_card, one_less_card, all_or_nothing, detrimental_characters,
          seed, score, num_turns, end_condition, datetime_started, datetime_finished
        FROM games WHERE id = ${sourceID}
      `;
      ready.resolve(undefined);
      await release.promise;
    });
    let rejected: Promise<void> | undefined;
    try {
      await ready.promise;
      rejected = expect(store.save(id, 0, "stale")).rejects.toThrow(
        "completion",
      );
      let waiting = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        // eslint-disable-next-line no-await-in-loop
        const locks = await client`
          SELECT granted FROM pg_locks
          WHERE locktype = 'advisory' AND classid = 17482 AND objid = ${id} AND NOT granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        `;
        if (locks.length > 0) {
          waiting = true;
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      }
      expect(waiting).toBe(true);
    } finally {
      release.resolve(undefined);
      await writer;
      await rejected;
    }
    expect(await store.load()).toEqual([]);
  });

  test("expired pool waiters cannot later mutate checkpoints and draining waits for them", async () => {
    const id = await store.reserveID();
    const release = await occupyPool(client);
    try {
      jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
      const pending = store.save(id, 0, "expired");
      const rejected = expect(pending).rejects.toThrow("timed out");
      await jest.advanceTimersByTimeAsync(30_001);
      await rejected;
      let drained = false;
      const draining = store.drain().then(() => {
        drained = true;
      });
      await Promise.resolve();
      expect(drained).toBe(false);
      await release();
      await draining;
      expect(drained).toBe(true);
    } finally {
      jest.useRealTimers();
      await release();
      await store.drain();
    }
    expect(await store.load()).toEqual([]);
  });
});
