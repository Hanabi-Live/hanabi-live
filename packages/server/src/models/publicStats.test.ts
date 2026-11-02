// cspell:words timestamptz lodie elodie
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
import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { pino } from "pino";
import type postgres from "postgres";
import * as schema from "../databaseSchema";
import type { db } from "../db";
import { evaluationDatabase } from "../experimental/evaluationSupport";
import { createHTTPServer } from "../http";
import { publicStats } from "./publicStats";
import { userStats } from "./userStats";

let mockDatabase: typeof db;
jest.mock("../db", () => ({
  get db() {
    return mockDatabase;
  },
}));
jest.mock("../env", () => ({
  env: {
    DOMAIN: "localhost",
    SESSION_SECRET: "synthetic-session-key-".repeat(8),
    TLS_CERT_FILE: "",
    TLS_KEY_FILE: "",
  },
  IS_DEV: true,
}));
jest.mock("../logger", () => {
  const actual = jest.requireActual<{ pino: typeof pino }>("pino");
  return { logger: actual.pino({ level: "silent" }) };
});
jest.mock("../version", () => ({ getClientVersion: () => 1 }));
jest.mock("../motd", () => ({ getMessageOfTheDay: jest.fn() }));
const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

databaseDescribe("public-page read-only statistics", () => {
  let database: Awaited<ReturnType<typeof evaluationDatabase>>;
  let client: postgres.Sql;
  let server: FastifyInstance;

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
    await client`
      INSERT INTO users (id, username, normalized_username, password_hash, last_ip, datetime_created)
      VALUES (1, 'Alice', 'alice', 'synthetic', '127.0.0.1', '2020-01-21T00:00:00Z'),
        (2, 'Bob', 'bob', 'synthetic', '127.0.0.1', '2020-01-22T00:00:00Z')
    `;
    server = await createHTTPServer();
  });

  afterEach(async () => {
    await server.close();
    await client.end({ timeout: 3 });
    await database.close();
  });

  async function insertGames() {
    await client`
      INSERT INTO games (
        id, name, num_players, starting_player, variant_id, timed, time_base, time_per_turn,
        speedrun, card_cycle, deck_plays, empty_clues, one_extra_card, one_less_card,
        all_or_nothing, detrimental_characters, seed, score, num_turns, end_condition,
        datetime_started, datetime_finished
      ) SELECT id, 'synthetic', 2, 0, variant, false, 120, 10, speedrun, false, false,
        false, false, false, false, false, seed, score, 40, ending,
        '2026-01-01T00:00:00Z'::timestamptz,
        '2026-01-01T00:00:00Z'::timestamptz + seconds * interval '1 second'
      FROM (VALUES
        (10, 0, false, 1, 25, 60, 'seed-a'),
        (20, 0, false, 2, 0, 120, 'seed-a'),
        (30, 0, true, 1, 25, 30, 'seed-a'),
        (40, 0, true, 2, 0, 40, 'seed-a'),
        (50, 1, false, 1, 20, 600, 'seed-b'),
        (60, 0, false, 3, 10, 180, 'seed-a')
      ) AS fixtures(id, variant, speedrun, ending, score, seconds, seed)
    `;
    await client`
      INSERT INTO game_participants (game_id, user_id, seat, character_assignment, character_metadata)
      SELECT id, 1, 0, -1, 0 FROM games WHERE id != 50
      UNION ALL SELECT id, 2, 1, -1, 0 FROM games
    `;
  }

  test("separates normal endings, other endings and speedruns and weights variant time by participants", async () => {
    await insertGames();
    expect(await publicStats.profile(1 as UserID)).toEqual({
      dateJoined: new Date("2020-01-21T00:00:00Z"),
      numGamesNormal: 1,
      numGamesOther: 2,
      numGamesSpeedrun: 2,
      timePlayed: 360,
      timePlayedSpeedrun: 70,
    });
    expect(await publicStats.variant(0)).toEqual({
      numGamesNormal: 1,
      numGamesOther: 2,
      numGamesSpeedrun: 2,
      timePlayed: 720,
      timePlayedSpeedrun: 140,
    });
    expect(await publicStats.seedScores("seed-a")).toEqual([
      { score: 0, numTimes: 2 },
      { score: 10, numTimes: 1 },
      { score: 25, numTimes: 2 },
    ]);
    expect(await publicStats.variant(1)).toMatchObject({
      numGamesNormal: 1,
      timePlayed: 600,
    });
  });

  test("reads derived statistics with true zero defaults only for absent rows", async () => {
    expect(await publicStats.variantScores(0)).toEqual({
      numGames: 0,
      bestScores: [0, 0, 0, 0, 0],
      averageScore: 0,
      numMaxScores: 0,
      numStrikeouts: 0,
    });
    expect(await publicStats.profile(1 as UserID)).toMatchObject({
      numGamesNormal: 0,
      numGamesOther: 0,
      numGamesSpeedrun: 0,
      timePlayed: 0,
      timePlayedSpeedrun: 0,
    });
    expect(await userStats.getAll(1 as UserID)).toEqual(new Map());
    expect(await publicStats.seedScores("unplayed")).toEqual([]);
    await client`
      INSERT INTO variant_stats (variant_id, num_games, best_score2, best_score6, average_score, num_max_scores, num_strikeouts)
      VALUES (0, 3, 25, 20, 22.5, 1, 2), (1, 99, 10, 10, 10, 0, 0)
    `;
    expect(await publicStats.variantScores(0)).toEqual({
      numGames: 3,
      bestScores: [25, 0, 0, 0, 20],
      averageScore: 22.5,
      numMaxScores: 1,
      numStrikeouts: 2,
    });
    await client`DROP TABLE variant_stats`;
    await expect(publicStats.variantScores(0)).rejects.toThrow();
    await client`DROP TABLE user_stats`;
    await expect(userStats.getAll(1 as UserID)).rejects.toThrow();
    const failedPages = await Promise.all([
      server.inject("/variant/0"),
      server.inject("/scores/Alice"),
      server.inject("/missing-scores/Alice"),
    ]);
    for (const response of failedPages) {
      expect(response.statusCode).toBe(500);
      expect(response.body).toBe("Internal server error.");
    }
    await expect(publicStats.profile(999 as UserID)).rejects.toThrow(
      "nonexistent user",
    );
  });

  test("renders every mounted public page against an empty database through Fastify and ETA", async () => {
    const cases = [
      ["/scores/ALICE", "0 normally finished"],
      ["/profile/ALICE", "January 21st, 2020"],
      ["/history/ALICE", 'data-api-path="/api/v1/history/Alice"'],
      ["/missing-scores/ALICE/2", 'id="filter-by-players"'],
      ["/tags/ALICE", "No tagged games."],
      ["/seed/unplayed", 'data-api-path="/api/v1/seed/unplayed"'],
      ["/variant/0", "No-one has played a game on this variant yet."],
      ["/tag/unplayed", "No games played."],
      ["/videos", "The Rules of the Game"],
      ["/password-reset", 'id="generate-hash-button"'],
    ] as const;
    await Promise.all(
      cases.map(async ([url, content]) => {
        const response = await server.inject(url);
        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.body).toContain(content);
        expect(response.body).toContain('id="page-wrapper"');
        expect(response.body).toContain('id="main"');
        expect(response.body).toContain("/public/css/hanabi.css");
        expect(response.body).not.toContain("NaN");
      }),
    );
    const history = await server.inject("/api/v1/history/Alice?page=0&size=10");
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({ total_rows: 0, rows: [] });
    const disabled = await server.inject("/stats");
    expect(disabled.statusCode).toBe(404);
  });

  test("renders persisted Unicode names, statistics and tags and follows the page's actual paginated API URL", async () => {
    const username = "\u{C9}lodie <img src=x>";
    const requested = encodeURIComponent("\u{C9}LODIE <IMG SRC=X>");
    const canonical = encodeURIComponent(username);
    await client`
      UPDATE users SET username = ${username}, normalized_username = 'elodie <img src=x>'
      WHERE id = 1
    `;
    await insertGames();
    await client`
      INSERT INTO user_stats (user_id, variant_id, num_games, best_score2, best_score2_mod, average_score, num_strikeouts)
      VALUES (1, 0, 3, 25, 16, 20.25, 1)
    `;
    await client`
      INSERT INTO variant_stats (variant_id, num_games, best_score2, average_score, num_max_scores, num_strikeouts)
      VALUES (0, 3, 25, 20.25, 1, 1)
    `;
    await client`INSERT INTO seeds (seed, num_games) VALUES ('seed-a', 5)`;
    await client`
      INSERT INTO game_tags (game_id, user_id, tag)
      VALUES (10, 1, '<img src=x>'), (10, 1, 'zulu'), (10, 2, 'other user only')
    `;
    const [scores, tags, tag, history, variant, seed, missing] =
      await Promise.all([
        server.inject(`/scores/${requested}`),
        server.inject(`/tags/${requested}`),
        server.inject(`/tag/${encodeURIComponent("<img src=x>")}`),
        server.inject(`/history/${requested}/BOB`),
        server.inject("/variant/0"),
        server.inject("/seed/seed-a"),
        server.inject(`/missing-scores/${requested}/2`),
      ]);
    for (const response of [
      scores,
      tags,
      tag,
      history,
      variant,
      seed,
      missing,
    ]) {
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(username);
      expect(response.body).not.toContain("<img src=x>");
    }
    expect(scores.body).toContain(
      "\u{C9}lodie &lt;img src=x&gt;&#39;s Profile",
    );
    expect(scores.body).toContain(`href="/history/${canonical}"`);
    expect(scores.body).toContain("3 (1 normally finished)");
    expect(scores.body).toContain("6 minutes");
    expect(scores.body).toContain("20.2");
    expect(scores.body).toContain(
      'data-tooltip-content="#modifier-allornothing"',
    );
    expect(tags.body).toContain('id="history-row-0"');
    expect(tags.body).toContain("&lt;img src=x&gt;, zulu");
    expect(tags.body).not.toContain("other user only");
    expect(tags.body).toContain(`href="/history/Bob/${canonical}"`);
    expect(tag.body).toContain("Games With a Tag of: &lt;img src=x&gt;");
    expect(tag.body).toContain('href="/replay/10"');
    expect(variant.body).toContain("12 minutes");
    expect(variant.body).toContain("33.3%");
    expect(seed.body).toContain('id="scoreFreqs"');
    expect(seed.body).toContain(
      "{&quot;score&quot;:25,&quot;numTimes&quot;:2}",
    );
    expect(missing.body).toContain('id="filter-by-players"');
    expect(missing.body).toContain(
      'data-tooltip-content="#modifier-allornothing"',
    );

    const apiPath = /data-api-path="([^"]+)"/u.exec(history.body)?.[1];
    expect(apiPath).toBe(`/api/v1/history/${canonical}/Bob`);
    if (apiPath === undefined) {
      throw new Error("Missing mounted history API URL.");
    }
    const [first, second, filtered] = await Promise.all([
      server.inject(`${apiPath}?page=0&size=1`),
      server.inject(`${apiPath}?page=1&size=1`),
      server.inject(`${apiPath}?size=10&fcol[2]=25`),
    ]);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      total_rows: 5,
      rows: [{ id: 60, users: `Bob, ${username}` }],
    });
    expect(second.json()).toMatchObject({ total_rows: 5, rows: [{ id: 40 }] });
    expect(filtered.json()).toMatchObject({
      total_rows: 2,
      rows: [
        { id: 30, score: 25 },
        { id: 10, score: 25 },
      ],
    });
  });
});
