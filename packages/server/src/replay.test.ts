/* eslint-disable @typescript-eslint/require-await -- In-memory storage implements an asynchronous interface. */
import websocketPlugin from "@fastify/websocket";
import type { GameID, UserID } from "@hanabi-live/data";
import { SERVER_COMMAND_SCHEMAS, Status } from "@hanabi-live/data";
import { EndCondition, getVariant } from "@hanabi-live/game";
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
import type { FastifyInstance } from "fastify";
import { fastify } from "fastify";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay, setImmediate } from "node:timers/promises";
import type postgres from "postgres";
import { WebSocket } from "ws";
import { customDeckBytes, decodeCustomDeck } from "./customDeck";
import * as schema from "./databaseSchema";
import type { db } from "./db";
import { GoRandom } from "./engine/goRandom";
import { createShuffledDeck } from "./engine/setup";
import { evaluationDatabase } from "./experimental/evaluationSupport";
import { restoreGameCheckpoint } from "./gameCheckpoint";
import type { GameRuntime } from "./gameRuntime";
import { initializeGameRuntime } from "./gameRuntime";
import type { CompletedGame, GameStore } from "./gameStore";
import { createGameStore } from "./gameStore";
import { httpExport } from "./http/httpExport";
import { models } from "./models";
import { historicalReplay, importReplay } from "./replayImport";
import { getTable, getTableIDs, getTableList, removeTable } from "./tables";
import type { SessionID } from "./types/SessionID";
import { wsMessage } from "./wsMessage";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

let mockDatabase: typeof db;
jest.mock("./db", () => ({
  get db() {
    return mockDatabase;
  },
}));
jest.mock("./env", () => ({
  env: { SESSION_SECRET: "synthetic-replay-secret" },
  IS_DEV: true,
}));
jest.mock("./logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("./words", () => ({ getRandomTableName: () => "Replay test" }));

describe("replay import boundary", () => {
  test("custom JSON preserves its deck without generating an unused seeded shuffle", () => {
    const deck = Array.from({ length: 50 }, (_, index) => ({
      suitIndex: index % 5,
      rank: 1,
    }));
    const random = jest.spyOn(GoRandom.prototype, "intn");
    try {
      const replay = importReplay({ players: ["Alice", "Bob"], deck });
      expect(
        replay.state.deck.map(({ suitIndex, rank }) => ({ suitIndex, rank })),
      ).toEqual(deck);
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  test("reconstructs stock names and the exact legacy seed; accepts matching explicit decks", () => {
    const seed = "legacy-12-p3v0s2";
    const deck = createShuffledDeck(getVariant("No Variant"), seed);
    const replay = importReplay({ seed, deck, options: { startingPlayer: 2 } });
    expect(replay.state.players.map((player) => player.name)).toEqual([
      "Alice",
      "Bob",
      "Cathy",
    ]);
    expect(replay.state.activePlayerIndex).toBe(2);
    expect(replay.state.interpretation).toBe("legacy-replay");
    expect(
      replay.state.deck.map(({ suitIndex, rank }) => ({ suitIndex, rank })),
    ).toEqual(deck);
    expect(replay.state.events).toHaveLength(15);
  });

  test("imports custom decks, partial actions, notes and character assignments without inventing a completion", () => {
    const deck = createShuffledDeck(getVariant("No Variant"), "p2v0s1");
    const replay = importReplay({
      players: ["Alice", "Bob"],
      deck,
      notes: [["memo"], []],
      options: { detrimentalCharacters: true },
      characters: [
        { name: "n/a", metadata: -1 },
        { name: "n/a", metadata: -1 },
      ],
      actions: [{ type: 0, target: 0 }],
    });
    expect(replay.state.seed).toBe("JSON");
    expect(replay.state.actions).toEqual([{ type: 0, target: 0, value: 0 }]);
    expect(replay.state.endCondition).toBe(EndCondition.InProgress);
    expect(replay.notes[0]?.[0]).toBe("memo");
    expect(replay.notes[1]).toHaveLength(55);
    expect(replay.state.players[0]?.character).toBe("n/a");
    expect(replay.databaseID).toBe(0);
  });

  test("surfaces invalid historical moves and stops at the valid prefix", () => {
    const replay = importReplay({
      seed: "p2v0s1",
      actions: [
        { type: 0, target: 0 },
        { type: 0, target: 0 },
        { type: 0, target: 5 },
      ],
    });
    expect(replay.state.actions).toHaveLength(1);
    expect(replay.warnings).toEqual([expect.stringContaining("index 1")]);
    const ended = importReplay({
      seed: "p2v0s1",
      actions: [{ type: 5, target: -1, value: EndCondition.TerminatedByVote }],
    });
    expect(ended.state.events).toContainEqual({
      type: "gameOver",
      endCondition: EndCondition.TerminatedByVote,
      playerIndex: -1,
      // Go's absent termination votes are explicitly null on the wire.
      // eslint-disable-next-line unicorn/no-null
      votes: null,
    });
    expect(
      ended.state.events.some((event) => event.type === "playerTimes"),
    ).toBe(false);
  });

  test.each([
    {},
    { seed: "p9v0s1" },
    { seed: "p2v0s1", players: ["Alice"] },
    { seed: "p2v0s1", players: ["Alice", "<Bob>"] },
    { seed: "p2v0s1", options: { variant: "missing" } },
    { seed: "p2v0s1", options: { startingPlayer: 2 } },
    { seed: "p2v0s1", options: { detrimentalCharacters: false } },
    { seed: "p2v0s1", actions: [{ type: 0, target: 50 }] },
    { seed: "p2v0s1", actions: [{ type: 1, target: 0, value: 1 }] },
    { seed: "p2v0s1", actions: [{ type: 2, target: 2, value: 0 }] },
    { seed: "p2v0s1", actions: [{ type: 3, target: 1, value: 0 }] },
    { seed: "p2v0s1", actions: [{ type: 4, target: -1, value: 4 }] },
    { seed: "p2v0s1", actions: [{ type: 5, target: 0, value: 5 }] },
    { seed: "p2v0s1", actions: [{ type: 6 }] },
    { seed: "p2v0s1", notes: [[]] },
    { seed: "p2v0s1", actions: Array.from({ length: 513 }, () => ({})) },
  ])("rejects malformed or out-of-range imports %j", (input) => {
    expect(() => importReplay(input)).toThrow();
  });

  test("rejects mismatched seeded decks instead of silently ignoring them", () => {
    const deck = createShuffledDeck(getVariant("No Variant"), "p2v0s2");
    expect(() => importReplay({ seed: "p2v0s1", deck })).toThrow(
      "does not match",
    );
    expect(() => importReplay({ seed: "p2v0s1", deck: deck.slice(1) })).toThrow(
      "50 valid cards",
    );
  });

  test("historical inverted suits use recorded actions, not live input inversion", () => {
    const deck = createShuffledDeck(getVariant("Orange (5 Suits)"), "fixture");
    const replay = importReplay({
      players: ["Alice", "Bob"],
      deck: [{ suitIndex: 4, rank: 1 }, ...deck.slice(1)],
      options: { variant: "Orange (5 Suits)" },
      actions: [{ type: 0, target: 0 }],
    });

    expect(replay.warnings).toEqual([]);
    expect(replay.state.events).toContainEqual({
      type: "play",
      playerIndex: 0,
      order: 0,
      suitIndex: 4,
      rank: 1,
    });
    expect(replay.state.score).toBe(1);
  });

  test("accepts Go's null optional arrays and option pointers", () => {
    const raw: unknown = JSON.parse(
      '{"seed":"p2v0s1","players":null,"deck":null,"actions":null,"notes":null,"characters":null,"options":{"variant":null,"detrimentalCharacters":null}}',
    );
    expect(
      importReplay(raw).state.players.map((player) => player.name),
    ).toEqual(["Alice", "Bob"]);
  });
});

function memoryStore(): GameStore {
  let next = 1;
  return {
    reserveID: jest.fn(async () => {
      const id = next as GameID;
      next++;
      return id;
    }),
    load: jest.fn(async () => []),
    completed: jest.fn(async () => false),
    save: jest.fn(async (_id: GameID, revision: number) => revision + 1),
    complete: jest.fn(async (record: CompletedGame) => ({
      id: record.id,
      inserted: true,
      datetimeStarted: record.datetimeStarted,
      datetimeFinished: record.datetimeFinished,
    })),
    refreshStatistics: jest.fn(async () => undefined),
    drain: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
}

async function insertPlayableHistory(sql: postgres.Sql) {
  const rank = createShuffledDeck(getVariant("No Variant"), "p2v0s1")[5]?.rank;
  assertDefined(rank, "Missing historical clue rank.");
  await sql`
    INSERT INTO games (
      id, name, num_players, starting_player, variant_id, timed, time_base, time_per_turn,
      speedrun, card_cycle, deck_plays, empty_clues, one_extra_card, one_less_card,
      all_or_nothing, detrimental_characters, seed, score, num_turns, end_condition,
      datetime_started, datetime_finished
    ) VALUES (42, 'original', 2, 0, 0, false, 0, 0, false, false, false, false, false,
      false, false, false, 'p2v0s1', 0, 2, 4, '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
  `;
  await sql`
    INSERT INTO game_participants (game_id, user_id, seat, character_assignment, character_metadata)
    VALUES (42, 1, 0, 0, 0), (42, 2, 1, 0, 0)
  `;
  await sql`
    INSERT INTO game_actions (game_id, turn, type, target, value)
    VALUES (42, 0, 3, 1, ${rank}), (42, 1, 4, 0, 4)
  `;
}

describe("real replay WebSocket protocol", () => {
  let app: FastifyInstance;
  let address: string;
  let runtime: GameRuntime;
  let store: GameStore;
  const sockets: WebSocket[] = [];
  const failures: unknown[] = [];
  const users = wsUsers as Map<UserID, WSUser>;

  beforeEach(async () => {
    users.clear();
    failures.length = 0;
    store = memoryStore();
    runtime = await initializeGameRuntime(store, {
      development: true,
      getBlockedSeeds: async () => new Set(),
    });
    jest.spyOn(models.games, "getNumGamesForUser").mockResolvedValue(0);
    jest.spyOn(models.userStats, "get").mockResolvedValue({
      numGames: 0,
      averageScore: 0,
      numStrikeouts: 0,
      bestScores: [],
    });
    app = fastify();
    await app.register(websocketPlugin);
    app.get<{ Params: { databaseID?: string } }>(
      "/export/:databaseID",
      httpExport,
    );
    app.get<{ Params: { id: string } }>(
      "/ws/:id",
      { websocket: true },
      (socket, request) => {
        const id = Number(request.params.id) as UserID;
        const username = id === 1 ? "Alice" : `Bot-${id}`;
        const user: WSUser = {
          connection: socket,
          sessionID: id as number as SessionID,
          userID: id,
          username,
          normalizedUsername: username.toLowerCase(),
          ip: "127.0.0.1",
          muted: false,
          status: Status.Lobby,
          tableID: undefined,
          friends: new Set(),
          hyphenated: false,
          inactive: false,
        };
        users.set(id, user);
        let pending = Promise.resolve();
        socket.on("message", (data) => {
          pending = pending.then(async () => {
            await wsMessage(user, data);
          });
          pending.catch((error: unknown) => {
            failures.push(error);
          });
        });
      },
    );
    address = await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.terminate();
    }
    await app.close();
    await runtime.close();
    for (const id of getTableIDs()) {
      removeTable(id);
    }
    users.clear();
    jest.restoreAllMocks();
    expect(failures).toEqual([]);
  });

  async function connect(id: number) {
    const socket = new WebSocket(`${address.replace("http:", "ws:")}/ws/${id}`);
    sockets.push(socket);
    const messages: Array<{ command: string; data: unknown }> = [];
    socket.on("message", (data) => {
      if (!Buffer.isBuffer(data)) {
        throw new TypeError("Expected a binary WebSocket frame.");
      }
      const text = data.toString();
      const separator = text.indexOf(" ");
      const input: unknown = JSON.parse(text.slice(separator + 1));
      messages.push({ command: text.slice(0, separator), data: input });
    });
    await once(socket, "open");
    return {
      messages,
      send(command: string, data: object) {
        socket.send(`${command} ${JSON.stringify(data)}`);
      },
      async next(command: string) {
        for (let attempt = 0; attempt < 250; attempt++) {
          const index = messages.findIndex(
            (entry) => entry.command === command,
          );
          if (index !== -1) {
            return messages.splice(index, 1)[0]?.data;
          }
          // eslint-disable-next-line no-await-in-loop -- Wait for the real socket to receive a frame.
          await delay(10);
        }
        throw new Error(
          `Missing ${command}; received ${JSON.stringify(messages)}.`,
        );
      },
    };
  }

  test("solo imports are invisible, cannot be joined, and never reserve or persist a completed game", async () => {
    const owner = await connect(1);
    const outsider = await connect(2);
    owner.send("replayCreate", {
      source: "json",
      visibility: "solo",
      shadowingPlayerIndex: -1,
      gameJSON: { seed: "p2v0s1" },
    });
    const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
      await owner.next("tableStart"),
    );
    expect(getTableList(2 as UserID)).toEqual([]);
    outsider.send("tableSpectate", { tableID });
    expect(await outsider.next("warning")).toEqual({
      warning: expect.stringContaining("solo replay"),
    });
    outsider.send("getGameInfo2", { tableID });
    await outsider.next("warning");
    expect(
      outsider.messages.some((entry) => entry.command === "gameActionList"),
    ).toBe(false);
    owner.send("getGameInfo1", { tableID });
    expect(await owner.next("init")).toMatchObject({
      replay: true,
      sharedReplay: false,
      databaseID: 0,
      seed: "p2v0s1",
      playerNames: ["Alice", "Bob"],
    });
    owner.send("getGameInfo2", { tableID });
    const actions = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
      await owner.next("gameActionList"),
    );
    expect(
      actions.list.filter(
        (event) => event.type === "draw" && event.rank === -1,
      ),
    ).toHaveLength(0);
    expect(await owner.next("cardIdentities")).toMatchObject({
      cardIdentities: createShuffledDeck(getVariant("No Variant"), "p2v0s1"),
    });
    owner.send("replayAction", { tableID, type: 0, segment: 1 });
    await owner.next("warning");
    await runtime.checkpointAndDrain();
    runtime.resume();
    expect(store.reserveID).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    owner.send("tableUnattend", { tableID });
    owner.send("getGameInfo1", { tableID });
    await owner.next("warning");
    expect(getTable(tableID)).toBeUndefined();
    expect(
      outsider.messages.some((entry) => entry.command === "tableGone"),
    ).toBe(false);
  });

  test("all replay controls round-trip for bots, bootstrap hypothetical history, rewind at turns, and hand off ownership", async () => {
    const owner = await connect(1);
    const bot = await connect(2);
    owner.send("replayCreate", {
      source: "json",
      visibility: "shared",
      gameJSON: { seed: "p2v0s1" },
    });
    const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
      await owner.next("tableStart"),
    );
    bot.send("tableSpectate", { tableID });
    await bot.next("tableStart");
    bot.send("replayAction", { tableID, type: 3 });
    await bot.next("warning");
    for (const [type, command, extra, expected] of [
      [0, "replaySegment", { segment: 2 }, { tableID, segment: 2 }],
      [1, "replayIndicator", { order: 4 }, { tableID, order: 4 }],
      [2, "replaySound", { sound: "note" }, { tableID, sound: "note" }],
      [3, "hypoStart", {}, { TableID: tableID }],
      [7, "hypoShowDrawnCards", {}, { tableID, showDrawnCards: true }],
      [8, "replayEfficiencyMod", { value: -2 }, { tableID, mod: -2 }],
    ] as const) {
      owner.send("replayAction", { tableID, type, ...extra });
      // eslint-disable-next-line no-await-in-loop -- Each wire command is checked before the next mutation.
      expect(await bot.next(command)).toEqual(expected);
    }
    owner.send("replayAction", { tableID, type: 3 });
    await owner.next("warning");
    owner.send("replayAction", { tableID, type: 5, actionJSON: "{" });
    await owner.next("warning");
    const actions = [
      '{"type":"draw","order":12}',
      '{"type":"turn","num":1}',
      '{"type":"morph","order":12}',
      '{"type":"turn","num":2}',
    ];
    for (const actionJSON of actions) {
      owner.send("replayAction", { tableID, type: 5, actionJSON });
      // eslint-disable-next-line no-await-in-loop -- Preserve the hypothetical action sequence.
      expect(await bot.next("hypoAction")).toBe(actionJSON);
    }
    owner.send("replayAction", { tableID, type: 6 });
    expect(await bot.next("hypoBack")).toEqual({ TableID: tableID });
    bot.send("getGameInfo1", { tableID });
    expect(await bot.next("init")).toMatchObject({
      sharedReplayEffMod: -2,
      sharedReplaySegment: 2,
    });
    bot.send("getGameInfo2", { tableID });
    expect(await bot.next("hypothetical")).toEqual({
      showDrawnCards: true,
      actions: actions.slice(0, 2),
    });
    const replacement = await connect(2);
    replacement.send("getGameInfo2", { tableID });
    await replacement.next("warning");
    replacement.send("tableSpectate", { tableID });
    await replacement.next("tableStart");
    owner.send("tableUnattend", { tableID });
    expect(await replacement.next("replayLeader")).toEqual({
      tableID,
      name: "Bot-2",
    });
    replacement.send("replayAction", { tableID, type: 4 });
    expect(await replacement.next("hypoEnd")).toEqual({ TableID: tableID });
    replacement.send("replayAction", { tableID, type: 4 });
    await replacement.next("warning");
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  test("table suggestions reach only the current active shared-replay leader", async () => {
    const owner = await connect(1);
    const follower = await connect(2);
    const peer = await connect(3);
    const outsider = await connect(4);
    owner.send("replayCreate", {
      source: "json",
      visibility: "solo",
      gameJSON: { seed: "p2v0s1" },
    });
    const solo = SERVER_COMMAND_SCHEMAS.tableStart.parse(
      await owner.next("tableStart"),
    );
    owner.send("tableSuggest", { tableID: solo.tableID, segment: 1 });
    await owner.next("warning");
    owner.send("tableUnattend", { tableID: solo.tableID });
    owner.send("replayCreate", {
      source: "json",
      visibility: "shared",
      gameJSON: { seed: "p2v0s1" },
    });
    const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
      await owner.next("tableStart"),
    );
    follower.send("tableSpectate", { tableID });
    await follower.next("tableStart");
    peer.send("tableSpectate", { tableID });
    await peer.next("tableStart");
    outsider.send("tableSuggest", { tableID, segment: 1 });
    await outsider.next("warning");
    owner.send("tableSuggest", { tableID, segment: 1 });
    expect(await owner.next("warning")).toEqual({
      warning: expect.stringContaining("not the leader"),
    });
    follower.send("tableSuggest", { tableID, segment: 17 });
    expect(await owner.next("suggestion")).toEqual({
      tableID,
      userName: "Bot-2",
      segment: 17,
    });
    peer.send("getGameInfo1", { tableID });
    await peer.next("init");
    expect(peer.messages.some((entry) => entry.command === "suggestion")).toBe(
      false,
    );
    expect(
      follower.messages.some((entry) => entry.command === "suggestion"),
    ).toBe(false);
    const replacement = await connect(1);
    follower.send("tableSuggest", { tableID, segment: 18 });
    expect(await follower.next("warning")).toEqual({
      warning: expect.stringContaining("not currently attending"),
    });
    replacement.send("tableSpectate", { tableID });
    await replacement.next("tableStart");
    follower.send("tableSuggest", { tableID, segment: 19 });
    expect(await replacement.next("suggestion")).toEqual({
      tableID,
      userName: "Bot-2",
      segment: 19,
    });
    expect(owner.messages.some((entry) => entry.command === "suggestion")).toBe(
      false,
    );
    replacement.send("tableSetLeader", { tableID, name: "Bot-3" });
    await peer.next("replayLeader");
    follower.send("tableSuggest", { tableID, segment: 20 });
    expect(await peer.next("suggestion")).toEqual({
      tableID,
      userName: "Bot-2",
      segment: 20,
    });
    peer.send("tableSuggest", { tableID, segment: 21 });
    await peer.next("warning");
    const staleFollower = await connect(2);
    staleFollower.send("tableSuggest", { tableID, segment: 22 });
    await staleFollower.next("warning");
    expect(getTable(tableID)?.game?.replaySegment).toBe(0);
    expect(store.save).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  test("malformed imports and missing historical IDs surface warnings without tables", async () => {
    const client = await connect(1);
    client.send("replayCreate", {
      source: "json",
      visibility: "shared",
      gameJSON: { seed: "p7v0s1" },
    });
    await client.next("warning");
    client.send("replayCreate", { source: "id", visibility: "solo" });
    await client.next("warning");
    expect(getTableList(1 as UserID)).toEqual([]);
  });

  test("replay idle resources survive quiesce/resume and expire without checkpoint writes", async () => {
    await runtime.close();
    let now = 0;
    runtime = await initializeGameRuntime(store, {
      development: false,
      getBlockedSeeds: async () => new Set(),
      now: () => now,
    });
    const owner = await connect(1);
    owner.send("replayCreate", {
      source: "json",
      visibility: "shared",
      gameJSON: { seed: "p2v0s1" },
    });
    const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
      await owner.next("tableStart"),
    );
    const game = getTable(tableID)?.game;
    assertDefined(game, "Missing replay idle clock.");
    game.idleRemaining = 1;
    now = 1;
    await runtime.checkpointAndDrain();
    expect(getTable(tableID)).toBeDefined();
    expect(store.save).not.toHaveBeenCalled();
    runtime.resume();
    expect(await owner.next("boot")).toEqual({ TableID: tableID });
    expect(getTable(tableID)).toBeUndefined();
    expect(store.complete).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    "original players and shadowing spectators restart durably (hidePregame=%s)",
    async (hidePregame) => {
      const owner = await connect(1);
      const bot = await connect(2);
      const observer = await connect(3);
      owner.send("tableCreate", { name: "!seed test009" });
      const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
        await owner.next("joined"),
      );
      bot.send("tableJoin", { tableID });
      await bot.next("joined");
      owner.send("tableStart", { tableID });
      await owner.next("tableStart");
      await bot.next("tableStart");
      owner.send("loaded", { tableID });
      await owner.next("connected");
      bot.send("loaded", { tableID });
      await bot.next("connected");
      bot.send("getGameInfo1", { tableID });
      await bot.next("init");
      observer.send("tableSpectate", { tableID, shadowingPlayerIndex: 0 });
      await observer.next("tableStart");
      observer.send("note", { tableID, order: 0, note: "observer memo" });
      expect(await observer.next("note")).toMatchObject({
        notes: expect.arrayContaining([
          expect.objectContaining({ name: "Bot-3", isSpectator: true }),
        ]),
      });
      owner.send("note", { tableID, order: 0, note: "player memo" });
      const restrictedNotes = SERVER_COMMAND_SCHEMAS.note.parse(
        await observer.next("note"),
      );
      expect(restrictedNotes.notes.map((entry) => entry.name)).toEqual([
        "Bot-2",
        "Bot-3",
      ]);
      const checkpointData = jest.mocked(store.save).mock.calls.at(-1)?.[2];
      assertDefined(checkpointData, "Missing note checkpoint.");
      const original = getTable(tableID)?.game;
      assertDefined(original, "Missing original game.");
      const restored = restoreGameCheckpoint(
        {
          id: original.databaseID,
          revision: original.revision,
          data: checkpointData,
        },
        0,
      );
      expect(restored.game?.spectatorNotes?.[0]?.notes[0]).toBe(
        "observer memo",
      );
      owner.send("tableTerminate", { tableID });
      await owner.next("finishOngoingGame");
      await bot.next("finishOngoingGame");
      await observer.next("finishOngoingGame");
      const replayNotes = SERVER_COMMAND_SCHEMAS.noteList.parse(
        await observer.next("noteList"),
      );
      expect(
        replayNotes.notes.find((entry) => entry.name === "Bot-3")?.notes[0],
      ).toBe("observer memo");
      expect(
        replayNotes.notes.find(
          (entry) => entry.name === "Alice" && !entry.isSpectator,
        )?.notes[0],
      ).toBe("player memo");
      jest.mocked(store.refreshStatistics).mockImplementation(async () => {
        await setImmediate();
        jest.mocked(models.games.getNumGamesForUser).mockResolvedValue(1);
        jest.mocked(models.userStats.get).mockResolvedValue({
          numGames: 1,
          averageScore: 25,
          numStrikeouts: 0,
          bestScores: [{ numPlayers: 2, score: 25, modifier: 0 }],
        });
      });
      if (hidePregame) {
        jest
          .mocked(store.reserveID)
          .mockRejectedValueOnce(new Error("reservation unavailable"));
        const user = users.get(1 as UserID);
        assertDefined(user, "Missing replay owner.");
        await expect(
          runtime.restart(user, { tableID, hidePregame }),
        ).rejects.toThrow("reservation unavailable");
        expect(getTable(tableID)?.replay).toBe(true);
        expect(owner.messages.some((entry) => entry.command === "boot")).toBe(
          false,
        );
      }
      owner.send("tableRestart", { tableID, hidePregame });
      await owner.next("boot");
      const joined = SERVER_COMMAND_SCHEMAS.joined.parse(
        await owner.next("joined"),
      );
      expect(
        getTable(joined.tableID)?.players.map((player) => ({
          total: player.stats.numGames,
          games: player.stats.variant.numGames,
          best: player.stats.variant.bestScores[0]?.score,
        })),
      ).toEqual([
        { total: 1, games: 1, best: 25 },
        { total: 1, games: 1, best: 25 },
      ]);
      if (!hidePregame) {
        expect(getTable(joined.tableID)?.running).toBe(false);
        expect(
          SERVER_COMMAND_SCHEMAS.joined.parse(await observer.next("joined"))
            .tableID,
        ).toBe(joined.tableID);
        owner.send("tableStart", { tableID: joined.tableID });
      }
      const restarted = SERVER_COMMAND_SCHEMAS.tableStart.parse(
        await owner.next("tableStart"),
      );
      expect(restarted.tableID).not.toBe(tableID);
      expect(getTable(tableID)).toBeUndefined();
      expect(getTable(restarted.tableID)?.game?.state.seed).toBe(
        "p2v0stest010",
      );
      expect(store.reserveID).toHaveBeenCalledTimes(hidePregame ? 3 : 2);
      expect(store.complete).toHaveBeenCalledTimes(1);
      expect(getTable(restarted.tableID)?.visible).toBe(true);
      await observer.next("tableStart");
      observer.send("getGameInfo1", { tableID: restarted.tableID });
      const init = SERVER_COMMAND_SCHEMAS.init.parse(
        await observer.next("init"),
      );
      expect(init.shadowing).toBe(true);
      expect(init.playerNames[init.ourPlayerIndex]).toBe("Bot-2");
      observer.send("getGameInfo2", { tableID: restarted.tableID });
      const visibleActions = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
        await observer.next("gameActionList"),
      );
      const hiddenDraws = visibleActions.list.filter(
        (event) =>
          event.type === "draw" && event.playerIndex === init.ourPlayerIndex,
      );
      expect(hiddenDraws).toHaveLength(5);
      expect(
        hiddenDraws.every(
          (event) => event.type === "draw" && event.rank === -1,
        ),
      ).toBe(true);
    },
  );

  const databaseTest =
    process.env["HANABI_TEST_DATABASE_URL"] === undefined ? test.skip : test;

  async function withReplayDatabase(
    run: (
      sql: postgres.Sql,
      connectDatabase: () => postgres.Sql,
    ) => Promise<void>,
  ) {
    const database = await evaluationDatabase();
    const sql = database.connect();
    try {
      await sql.unsafe(
        await readFile(
          path.resolve(__dirname, "../../../install/database_schema.sql"),
          "utf8",
        ),
      );
      mockDatabase = drizzle(sql, { schema });
      await sql`
        INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
        VALUES (1, 'Alice', 'alice', 'synthetic', '127.0.0.1'),
          (2, 'Bot-2', 'bot-2', 'synthetic', '127.0.0.1'),
          (3, 'Bot-3', 'bot-3', 'synthetic', '127.0.0.1')
      `;
      await run(sql, database.connect);
    } finally {
      await runtime.close();
      await sql.end({ timeout: 3 });
      await database.close();
    }
  }

  test("live unseeded JSON shuffles its supplied deck, preserves character seats, and checkpoints private tags", async () => {
    const owner = await connect(1);
    const bot = await connect(2);
    const third = await connect(3);
    const deck = Array.from({ length: 50 }, (_, index) => ({
      suitIndex: 4 - Math.floor(index / 10),
      rank: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5][index % 10],
    }));
    owner.send("tableCreate", {
      name: "Custom deck",
      gameJSON: {
        players: ["Preset1", "Preset2"],
        deck,
        notes: [["imported only"], []],
        options: { detrimentalCharacters: true },
        characters: [
          { name: "Genius", metadata: -1 },
          { name: "n/a", metadata: -1 },
        ],
      },
    });
    const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
      await owner.next("joined"),
    );
    bot.send("tableJoin", { tableID });
    await bot.next("joined");
    third.send("tableJoin", { tableID });
    await third.next("joined");
    owner.send("tableStart", { tableID });
    expect(await owner.next("warning")).toEqual({
      warning: expect.stringContaining("exactly 2"),
    });
    expect(store.reserveID).not.toHaveBeenCalled();
    third.send("tableLeave", { tableID });
    await third.next("left");
    owner.send("tableStart", { tableID });
    await owner.next("tableStart");
    await bot.next("tableStart");
    owner.send("loaded", { tableID });
    owner.send("getGameInfo2", { tableID });
    const visible = SERVER_COMMAND_SCHEMAS.gameActionList.parse(
      await owner.next("gameActionList"),
    );
    expect(
      visible.list.some((event) => event.type === "draw" && event.rank === -1),
    ).toBe(true);
    expect(
      SERVER_COMMAND_SCHEMAS.noteListPlayer
        .parse(await owner.next("noteListPlayer"))
        .notes.every((note) => note === ""),
    ).toBe(true);
    bot.send("loaded", { tableID });
    bot.send("getGameInfo1", { tableID });
    await bot.next("init");
    const game = getTable(tableID)?.game;
    assertDefined(game, "Missing live custom game.");
    expect(game.state.interpretation).toBe("live");
    expect(game.state.seed).toBe("p2v0s1");
    expect(
      game.state.deck.map(({ suitIndex, rank }) => ({ suitIndex, rank })),
    ).toEqual(
      createShuffledDeck(getVariant("No Variant"), "p2v0s1").map((card) => ({
        ...card,
        suitIndex: 4 - card.suitIndex,
      })),
    );
    expect(game.state.players.map((player) => player.character)).toEqual([
      "Genius",
      "n/a",
    ]);
    owner.messages.length = 0;
    bot.messages.length = 0;
    owner.send("tag", { tableID, msg: "private" });
    expect(await owner.next("chat")).toMatchObject({
      recipient: "Alice",
      msg: expect.stringContaining("Successfully added"),
    });
    bot.send("tagDelete", { tableID, msg: "private" });
    await bot.next("warning");
    expect(bot.messages.some((entry) => entry.command === "chat")).toBe(false);
    bot.send("tag", { tableID, msg: "bot tag" });
    await bot.next("chat");
    owner.send("tagsDeleteAll", { tableID });
    await owner.next("chat");
    const checkpoint = jest.mocked(store.save).mock.calls.at(-1);
    assertDefined(checkpoint, "Missing custom checkpoint.");
    const restored = restoreGameCheckpoint(
      { id: checkpoint[0], revision: checkpoint[1] + 1, data: checkpoint[2] },
      0,
    );
    expect(restored.game?.state).toEqual(game.state);
    expect(restored.game?.tags).toEqual([{ userID: 2, tag: "bot tag" }]);
  });

  databaseTest(
    "live !replay prefixes and terminal JSON use fresh IDs, and restart refreshes statistics before publication",
    async () => {
      await withReplayDatabase(async (sql, connectDatabase) => {
        await insertPlayableHistory(sql);
        jest.mocked(models.games.getNumGamesForUser).mockRestore();
        jest.mocked(models.userStats.get).mockRestore();
        await runtime.close();
        store = createGameStore(connectDatabase(), sql);
        const completion = jest.spyOn(store, "complete");
        runtime = await initializeGameRuntime(store, {
          development: true,
          getBlockedSeeds: async () => new Set(),
        });
        const owner = await connect(1);
        const bot = await connect(2);
        owner.send("tableCreate", { name: "!replay 42 3" });
        await owner.next("warning");
        expect(getTableList(1 as UserID)).toEqual([]);
        owner.send("tableCreate", { name: "!replay 42 2" });
        const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        bot.send("tableJoin", { tableID });
        await bot.next("joined");
        owner.send("tableStart", { tableID });
        await owner.next("tableStart");
        await bot.next("tableStart");
        const game = getTable(tableID)?.game;
        assertDefined(game, "Missing live historical prefix.");
        expect(game.databaseID).not.toBe(42);
        expect(game.state).toMatchObject({
          turn: 1,
          activePlayerIndex: 1,
          interpretation: "live",
          seed: "p2v0s1",
        });
        expect(game.state.players.map((player) => player.name)).toEqual([
          "Alice",
          "Bot-2",
        ]);
        expect(game.state.actions).toHaveLength(1);
        expect(await sql`SELECT count(*)::int AS count FROM games`).toEqual([
          { count: 1 },
        ]);
        expect(
          await sql`SELECT count(*)::int AS count FROM active_games`,
        ).toEqual([{ count: 1 }]);
        owner.send("loaded", { tableID });
        owner.send("getGameInfo1", { tableID });
        await owner.next("init");
        bot.send("loaded", { tableID });
        bot.send("getGameInfo1", { tableID });
        await bot.next("init");
        owner.send("tableTerminate", { tableID });
        await owner.next("finishOngoingGame");
        await bot.next("finishOngoingGame");
        owner.send("tableRestart", { tableID, hidePregame: false });
        expect(await owner.next("warning")).toEqual({
          warning: expect.stringContaining('restart "!replay"'),
        });
        owner.send("tableUnattend", { tableID });
        bot.send("tableUnattend", { tableID });
        owner.send("tableCreate", {
          name: "Seeded JSON",
          gameJSON: {
            seed: "p2v0s6",
            notes: [["not a live note"], []],
            actions: [
              { type: 4, target: 0, value: EndCondition.TerminatedByPlayer },
            ],
          },
        });
        const created = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        bot.send("tableJoin", { tableID: created.tableID });
        await bot.next("joined");
        owner.send("tableStart", {
          tableID: created.tableID,
          requestID: "terminal-import",
        });
        expect(await owner.next("tableStart")).toEqual({
          tableID: created.tableID,
          replay: true,
        });
        await bot.next("tableStart");
        owner.send("tableStart", {
          tableID: created.tableID,
          requestID: "terminal-import",
        });
        owner.send("getGameInfo1", { tableID: created.tableID });
        const init = SERVER_COMMAND_SCHEMAS.init.parse(
          await owner.next("init"),
        );
        expect(init.databaseID).not.toBe(42);
        expect(init.databaseID).not.toBe(game.databaseID);
        expect(init.replay).toBe(true);
        expect(completion).toHaveBeenCalledTimes(2);
        expect(await sql`SELECT count(*)::int AS count FROM games`).toEqual([
          { count: 3 },
        ]);
        expect(
          await sql`SELECT count(*)::int AS count FROM active_games`,
        ).toEqual([{ count: 0 }]);
        await store.drain();
        await sql`
          INSERT INTO games (
            id, name, num_players, starting_player, variant_id, timed, time_base, time_per_turn,
            speedrun, card_cycle, deck_plays, empty_clues, one_extra_card, one_less_card,
            all_or_nothing, detrimental_characters, seed, score, num_turns, end_condition,
            datetime_started, datetime_finished
          ) VALUES (43, 'new statistics', 2, 0, 0, false, 0, 0, false, false, false, false, false,
            false, false, false, 'p2v0s9', 25, 50, 1, '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
        `;
        await sql`
          INSERT INTO game_participants (game_id, user_id, seat, character_assignment, character_metadata)
          VALUES (43, 1, 0, 0, 0), (43, 2, 1, 0, 0)
        `;
        const user = users.get(1 as UserID);
        assertDefined(user, "Missing JSON game owner.");
        await sql`ALTER TABLE user_stats RENAME TO unavailable_user_stats`;
        await expect(
          runtime.restart(user, {
            tableID: created.tableID,
            hidePregame: false,
          }),
        ).rejects.toThrow();
        expect(getTable(created.tableID)?.replay).toBe(true);
        expect(owner.messages.some((entry) => entry.command === "boot")).toBe(
          false,
        );
        await sql`ALTER TABLE unavailable_user_stats RENAME TO user_stats`;
        owner.send("tableRestart", {
          tableID: created.tableID,
          hidePregame: false,
        });
        await owner.next("boot");
        const restarted = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        expect(
          getTable(restarted.tableID)?.players.map(
            (player) => player.stats.numGames,
          ),
        ).toEqual([1, 1]);
        expect(getTable(restarted.tableID)?.running).toBe(false);
        expect(completion).toHaveBeenCalledTimes(2);
      });
    },
  );

  test("live JSON action emulation uses inverted input semantics, unlike an observational replay", async () => {
    const owner = await connect(1);
    const bot = await connect(2);
    const gameJSON = {
      players: ["Preset1", "Preset2"],
      options: { variant: "Orange (5 Suits)" },
      deck: Array.from({ length: 50 }, () => ({ suitIndex: 4, rank: 1 })),
      actions: [{ type: 0, target: 0 }],
    };
    expect(importReplay(gameJSON).state.actions[0]?.type).toBe(0);
    owner.send("tableCreate", { name: "Inverted custom", gameJSON });
    const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
      await owner.next("joined"),
    );
    bot.send("tableJoin", { tableID });
    await bot.next("joined");
    owner.send("tableStart", { tableID });
    await owner.next("tableStart");
    const game = getTable(tableID)?.game;
    expect(game?.state.actions).toEqual([{ type: 1, target: 0, value: 0 }]);
    expect(game?.state.events).toContainEqual({
      type: "discard",
      playerIndex: 0,
      order: 0,
      suitIndex: 4,
      rank: 1,
      failed: false,
    });
    expect(game?.state.interpretation).toBe("live");
  });

  databaseTest(
    "custom table updates replace setup atomically and failed historical reads never publish a new table",
    async () => {
      await withReplayDatabase(async (sql) => {
        await insertPlayableHistory(sql);
        const owner = await connect(1);
        const outsider = await connect(3);
        owner.send("tableCreate", { name: "Original options" });
        const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        owner.send("tableUpdate", { tableID, name: "!replay 42 2" });
        owner.send("tableStart", { tableID });
        await owner.next("warning");
        expect(getTable(tableID)?.extraOptions).toMatchObject({
          setReplay: true,
          setReplayTurn: 1,
          customSeed: "p2v0s1",
          customNumPlayers: 2,
        });
        owner.send("tableUpdate", {
          tableID,
          name: "Bad JSON",
          gameJSON: { seed: "p2v0s1", deck: [], players: ["one"] },
        });
        await owner.next("warning");
        expect(getTable(tableID)?.name).toBe("!replay 42 2");
        await sql`ALTER TABLE game_actions RENAME TO unavailable_game_actions`;
        const pendingFailure = Promise.withResolvers<undefined>();
        const originalGet = models.replays.get;
        jest.spyOn(models.replays, "get").mockImplementationOnce(async (id) => {
          try {
            return await originalGet(id);
          } finally {
            pendingFailure.resolve(undefined);
          }
        });
        outsider.send("tableCreate", { name: "!replay 42 2" });
        await pendingFailure.promise;
        // Let the WebSocket command queue record the rejected database operation.
        await setImmediate();
        expect(failures.splice(0)).toHaveLength(1);
        expect(
          outsider.messages.some((entry) => entry.command === "joined"),
        ).toBe(false);
        expect(getTableList(3 as UserID).map((table) => table.id)).toEqual([
          tableID,
        ]);
        expect(getTable(tableID)?.name).toBe("!replay 42 2");
      });
    },
  );

  databaseTest(
    "replay tags are author-scoped, serialized across replays, and private to their visible table",
    async () => {
      await withReplayDatabase(async (sql) => {
        await insertPlayableHistory(sql);
        const owner = await connect(1);
        const bot = await connect(2);
        const outsider = await connect(3);
        owner.send("replayCreate", {
          source: "id",
          databaseID: 42,
          visibility: "shared",
        });
        const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
          await owner.next("tableStart"),
        );
        bot.send("tableSpectate", { tableID });
        await bot.next("tableStart");
        outsider.send("tag", { tableID, msg: "outsider" });
        await outsider.next("warning");
        owner.send("tag", { tableID, msg: "Mixed CASE", requestID: "tag-one" });
        expect(await bot.next("chat")).toMatchObject({
          msg: 'Alice has added a game tag of "mixed case".',
        });
        owner.send("tag", { tableID, msg: "Mixed CASE", requestID: "tag-one" });
        owner.send("tag", { tableID, msg: "mixed case" });
        await owner.next("warning");
        bot.send("tag", { tableID, msg: "mixed case" });
        await bot.next("chat");
        owner.send("tagDelete", { tableID, msg: "mixed case" });
        await bot.next("chat");
        expect(
          await sql`SELECT user_id, tag FROM game_tags ORDER BY user_id, tag`,
        ).toEqual([{ user_id: 2, tag: "mixed case" }]);
        owner.send("tagDelete", { tableID, msg: "mixed case" });
        await owner.next("warning");
        owner.send("tag", { tableID, msg: "another" });
        await bot.next("chat");
        owner.send("tagsDeleteAll", { tableID });
        await bot.next("chat");
        expect(await sql`SELECT user_id, tag FROM game_tags`).toEqual([
          { user_id: 2, tag: "mixed case" },
        ]);
        owner.send("tableUnattend", { tableID });
        owner.send("replayCreate", {
          source: "id",
          databaseID: 42,
          visibility: "solo",
        });
        const solo = SERVER_COMMAND_SCHEMAS.tableStart.parse(
          await owner.next("tableStart"),
        );
        bot.messages.length = 0;
        owner.messages.length = 0;
        owner.send("tag", { tableID: solo.tableID, msg: "private" });
        await owner.next("chat");
        expect(bot.messages.some((entry) => entry.command === "chat")).toBe(
          false,
        );
        expect(
          await Promise.all([
            models.gameTags.edit(42 as GameID, 1 as UserID, {
              type: "add",
              tag: "concurrent",
            }),
            models.gameTags.edit(42 as GameID, 1 as UserID, {
              type: "add",
              tag: "concurrent",
            }),
          ]),
        ).toEqual(expect.arrayContaining(["changed", "duplicate"]));
        expect(
          await sql`SELECT count(*)::int AS count FROM game_tags WHERE tag = 'concurrent'`,
        ).toEqual([{ count: 1 }]);
        const user = users.get(1 as UserID);
        assertDefined(user, "Missing solo replay owner.");
        const chatLength = getTable(solo.tableID)?.chat.length;
        await sql`ALTER TABLE game_tags RENAME TO unavailable_game_tags`;
        await expect(
          runtime.tag(user, {
            tableID: solo.tableID,
            msg: "must fail",
            room: "",
          }),
        ).rejects.toThrow();
        expect(getTable(solo.tableID)?.chat).toHaveLength(chatLength ?? -1);
        await sql`ALTER TABLE unavailable_game_tags RENAME TO game_tags`;
        expect(store.complete).not.toHaveBeenCalled();
        expect(store.save).not.toHaveBeenCalled();
        expect(await sql`SELECT count(*)::int AS count FROM games`).toEqual([
          { count: 1 },
        ]);
      });
    },
  );

  databaseTest(
    "replay reads retain one snapshot across concurrent metadata edits",
    async () => {
      await withReplayDatabase(async (sql, connectDatabase) => {
        await insertPlayableHistory(sql);
        await sql`
          INSERT INTO game_participant_notes (game_participant_id, card_order, note)
          SELECT id, 0, 'before' FROM game_participants WHERE game_id = 42 AND seat = 0
        `;
        const blocker = connectDatabase();
        const locked = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        const locking = blocker.begin(async (transaction) => {
          await transaction`LOCK TABLE game_actions IN ACCESS EXCLUSIVE MODE`;
          locked.resolve(undefined);
          await release.promise;
        });
        await locked.promise;
        const loading = models.replays.get(42);
        const settled = Promise.allSettled([locking, loading]);
        try {
          const deadline = performance.now() + 5000;
          for (;;) {
            // eslint-disable-next-line no-await-in-loop -- Synchronize on the reader's actual lock wait.
            const [state] = await sql<Array<{ blocked: boolean }>>`
              SELECT EXISTS (
                SELECT 1 FROM pg_locks WHERE relation = 'game_actions'::regclass
                  AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                  AND NOT granted
              ) AS blocked
            `;
            assertDefined(state, "Missing replay lock observation.");
            if (state.blocked) {
              break;
            }
            if (performance.now() > deadline) {
              throw new Error(
                "Replay reader did not reach the locked action table.",
              );
            }
            // eslint-disable-next-line no-await-in-loop
            await delay(10);
          }
          await sql`UPDATE users SET username = 'Updated Alice' WHERE id = 1`;
          await sql`UPDATE game_participant_notes SET note = 'after'`;
          release.resolve(undefined);
          await locking;
          const record = await loading;
          expect([
            ["Alice", "before"],
            ["Updated Alice", "after"],
          ]).toContainEqual([record?.players[0]?.name, record?.notes[0]?.note]);
          const fresh = await models.replays.get(42);
          expect(fresh?.players[0]?.name).toBe("Updated Alice");
          expect(fresh?.notes[0]?.note).toBe("after");
        } finally {
          release.resolve(undefined);
          await settled;
          await blocker.end({ timeout: 3 });
        }
      });
    },
  );

  databaseTest(
    "historical replay reads exact database seed, seats, metadata and notes without writing",
    async () => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      try {
        await sql.unsafe(
          await readFile(
            path.resolve(__dirname, "../../../install/database_schema.sql"),
            "utf8",
          ),
        );
        mockDatabase = drizzle(sql, { schema });
        await sql`
          INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
                  VALUES (1, 'Alice', 'alice', 'synthetic', '127.0.0.1'), (2, 'Bob', 'bob', 'synthetic', '127.0.0.1')
        `;
        await sql`
          INSERT INTO games (
                  id, name, num_players, starting_player, variant_id, timed, time_base, time_per_turn,
                  speedrun, card_cycle, deck_plays, empty_clues, one_extra_card, one_less_card,
                  all_or_nothing, detrimental_characters, seed, score, num_turns, end_condition,
                  datetime_started, datetime_finished
                ) VALUES (42, 'history', 2, 1, 0, false, 0, 0, false, false, false, false, false,
                  false, false, true, 'legacy-12-p2v0s1', 0, 1, 4, '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')
        `;
        await sql`
          INSERT INTO game_participants (game_id, user_id, seat, character_assignment, character_metadata)
                  VALUES (42, 2, 1, -1, 0), (42, 1, 0, -1, 0)
        `;
        await sql`INSERT INTO game_actions (game_id, turn, type, target, value) VALUES (42, 0, 4, 1, 4)`;
        await sql`
          INSERT INTO game_participant_notes (game_participant_id, card_order, note)
                  SELECT id, 0, 'stored note' FROM game_participants WHERE game_id = 42 AND seat = 0
        `;
        const record = await models.replays.get(42);
        assertDefined(record, "Missing historical fixture.");
        expect(
          historicalReplay({
            ...record,
            actions: [{ type: 99, target: 0, value: 0 }],
          }).warnings,
        ).toEqual([expect.stringContaining("index 0")]);
        const shuffleDraws = jest.spyOn(GoRandom.prototype, "intn");
        const replay = historicalReplay(record);
        expect(shuffleDraws).toHaveBeenCalledTimes(replay.state.deck.length);
        shuffleDraws.mockRestore();
        const client = await connect(1);
        client.send("replayCreate", {
          source: "id",
          databaseID: 42,
          visibility: "shared",
          shadowingPlayerIndex: -1,
        });
        const { tableID } = SERVER_COMMAND_SCHEMAS.tableStart.parse(
          await client.next("tableStart"),
        );
        client.send("getGameInfo1", { tableID });
        expect(await client.next("init")).toMatchObject({
          databaseID: 42,
          seed: record.game.seed,
          playerNames: ["Alice", "Bob"],
          characterMetadata: [-1, -1],
          datetimeStarted: "2020-01-01T00:00:00.000Z",
          datetimeFinished: "2020-01-02T00:00:00.000Z",
        });
        client.send("getGameInfo2", { tableID });
        expect(await client.next("gameActionList")).toEqual({
          tableID,
          list: replay.state.events,
        });
        expect(await client.next("noteList")).toMatchObject({
          notes: expect.arrayContaining([
            expect.objectContaining({ name: "Alice", notes: replay.notes[0] }),
          ]),
        });
        client.send("tableRestart", { tableID, hidePregame: true });
        await client.next("warning");
        expect(store.save).not.toHaveBeenCalled();
        expect(store.reserveID).not.toHaveBeenCalled();
        expect(store.complete).not.toHaveBeenCalled();
        expect(await sql`SELECT count(*)::int AS count FROM games`).toEqual([
          { count: 1 },
        ]);
      } finally {
        await sql.end({ timeout: 3 });
        await database.close();
      }
    },
  );

  databaseTest(
    "sparse played decks round-trip through completion, replay and export with atomic retries",
    async () => {
      await withReplayDatabase(async (sql, connectDatabase) => {
        await runtime.close();
        store = createGameStore(connectDatabase(), sql);
        const completed = jest.spyOn(store, "complete");
        runtime = await initializeGameRuntime(store, {
          development: true,
          getBlockedSeeds: async () => new Set(),
        });
        const owner = await connect(1);
        const bot = await connect(2);
        const deck = Array.from({ length: 50 }, (_, index) => ({
          suitIndex: 4 - Math.floor(index / 10),
          rank: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5][index % 10],
        }));
        owner.send("tableCreate", {
          name: "Durable custom deck",
          gameJSON: {
            players: ["Alice", "Bot-2"],
            deck,
            actions: [
              { type: 4, target: 0, value: EndCondition.TerminatedByPlayer },
            ],
          },
        });
        const { tableID } = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        bot.send("tableJoin", { tableID });
        await bot.next("joined");
        owner.send("tableStart", { tableID });
        await owner.next("tableStart");
        await bot.next("tableStart");
        const record = completed.mock.calls[0]?.[0];
        assertDefined(record, "Missing custom completion.");
        const encoded = record.customDeck;
        assertDefined(encoded, "Custom completion did not retain its deck.");
        const played = getTable(tableID)?.game?.state.deck.map(
          ({ suitIndex, rank }) => ({ suitIndex, rank }),
        );
        const saved = await models.replays.get(record.id);
        assertDefined(saved, "Missing custom history.");
        expect(saved.customDeck).toEqual(played);
        expect(
          historicalReplay(saved).state.deck.map(({ suitIndex, rank }) => ({
            suitIndex,
            rank,
          })),
        ).toEqual(played);
        expect(
          await sql`SELECT octet_length(deck)::int AS size FROM game_custom_decks WHERE game_id = ${record.id}`,
        ).toEqual([{ size: 51 }]);
        const exported = await app.inject(`/export/${record.id}`);
        expect(exported.statusCode).toBe(200);
        const imported = importReplay(exported.json<unknown>());
        expect(
          imported.state.deck.map(({ suitIndex, rank }) => ({
            suitIndex,
            rank,
          })),
        ).toEqual(played);
        expect(imported.customSeed).toBeUndefined();
        const retried = await store.complete(record, 1);
        expect(retried.inserted).toBe(false);
        expect(
          await sql`SELECT count(*)::int AS count FROM game_custom_decks`,
        ).toEqual([{ count: 1 }]);

        owner.send("tableUnattend", { tableID });
        bot.send("tableUnattend", { tableID });
        owner.send("tableCreate", { name: `!replay ${record.id} 1` });
        const replayed = SERVER_COMMAND_SCHEMAS.joined.parse(
          await owner.next("joined"),
        );
        bot.send("tableJoin", { tableID: replayed.tableID });
        await bot.next("joined");
        owner.send("tableStart", { tableID: replayed.tableID });
        await owner.next("tableStart");
        await bot.next("tableStart");
        expect(
          getTable(replayed.tableID)?.game?.state.deck.map(
            ({ suitIndex, rank }) => ({ suitIndex, rank }),
          ),
        ).toEqual(played);
        expect(
          getTable(replayed.tableID)?.extraOptions.customDeckIsShuffled,
        ).toBe(true);

        await sql`INSERT INTO active_games (game_id, revision, checkpoint) VALUES (${record.id}, 99, 'retained retry')`;
        const changed = Buffer.from(encoded);
        const first = changed[1];
        assertDefined(first, "Missing compact first card.");
        changed[1] = (first + 8) % 40;
        await expect(
          store.complete({ ...record, customDeck: changed }, 99),
        ).rejects.toThrow("conflicts");
        await expect(
          store.complete({ ...record, customDeck: undefined }, 99),
        ).rejects.toThrow("conflicts");
        const malformed = Buffer.from(encoded);
        malformed[1] = 0;
        await sql`UPDATE game_custom_decks SET deck = ${malformed} WHERE game_id = ${record.id}`;
        await expect(models.replays.get(record.id)).rejects.toThrow();
        const malformedExport = await app.inject(`/export/${record.id}`);
        expect(malformedExport.statusCode).toBe(500);
        await expect(store.complete(record, 99)).rejects.toThrow();
        expect(
          await sql`SELECT checkpoint FROM active_games WHERE game_id = ${record.id}`,
        ).toEqual([{ checkpoint: "retained retry" }]);
        await sql`UPDATE game_custom_decks SET deck = ${Buffer.from(encoded)} WHERE game_id = ${record.id}`;
        await store.complete(record, 99);
        expect(
          await sql`SELECT count(*)::int AS count FROM active_games WHERE game_id = ${record.id}`,
        ).toEqual([{ count: 0 }]);

        const rollbackID = await store.reserveID();
        const rollback = {
          ...record,
          id: rollbackID,
          tags: [{ userID: 1 as UserID, tag: "rollback" }],
        };
        await store.save(rollbackID, 0, "custom rollback checkpoint");
        await sql`ALTER TABLE game_tags ADD CONSTRAINT reject_custom_completion CHECK (FALSE) NOT VALID`;
        await expect(store.complete(rollback, 1)).rejects.toThrow();
        expect(
          await sql`
            SELECT (SELECT count(*)::int FROM games WHERE id = ${rollbackID}) AS games,
              (SELECT count(*)::int FROM game_custom_decks WHERE game_id = ${rollbackID}) AS decks,
              (SELECT count(*)::int FROM active_games WHERE game_id = ${rollbackID}) AS active
          `,
        ).toEqual([{ games: 0, decks: 0, active: 1 }]);
        await sql`ALTER TABLE game_tags DROP CONSTRAINT reject_custom_completion`;
        await store.complete(rollback, 1);
        const rolledBackReplay = await models.replays.get(rollbackID);
        expect(decodeCustomDeck(encoded, getVariant("No Variant"))).toEqual(
          rolledBackReplay?.customDeck,
        );
        await sql`DELETE FROM games WHERE id = ${rollbackID}`;
        expect(
          await sql`SELECT count(*)::int AS count FROM game_custom_decks WHERE game_id = ${rollbackID}`,
        ).toEqual([{ count: 0 }]);

        const normalID = await store.reserveID();
        const normal = { ...record, id: normalID, customDeck: undefined };
        await store.save(normalID, 0, "normal checkpoint");
        await expect(
          store.complete({ ...normal, customDeck: Buffer.alloc(50) }, 1),
        ).rejects.toThrow();
        const seeded = createShuffledDeck(
          getVariant("No Variant"),
          record.seed,
        );
        const canonical = Buffer.from([
          0x80 + seeded.length,
          ...seeded.map((card) => card.suitIndex * 8 + card.rank),
        ]);
        await store.complete({ ...normal, customDeck: canonical }, 1);
        const normalReplay = await models.replays.get(normalID);
        expect(normalReplay?.customDeck).toBeUndefined();
        expect(
          await sql`SELECT count(*)::int AS count FROM game_custom_decks WHERE game_id = ${normalID}`,
        ).toEqual([{ count: 0 }]);
        const normalExport = await app.inject(`/export/${normalID}`);
        expect(normalExport.statusCode).toBe(200);
        expect(importReplay(normalExport.json<unknown>()).customSeed).toBe(
          record.seed,
        );
        await expect(
          store.complete({ ...normal, customDeck: encoded }, 1),
        ).rejects.toThrow("conflicts");
        const shortID = await store.reserveID();
        const variant = getVariant("No Variant");
        const shortDeck = decodeCustomDeck(encoded, variant).slice(0, 11);
        const shortBytes = customDeckBytes(shortDeck, variant, record.seed);
        assertDefined(shortBytes, "Missing counted short-deck payload.");
        await store.save(shortID, 0, "short terminal checkpoint");
        await store.complete(
          {
            ...record,
            id: shortID,
            customDeck: shortBytes,
            players: record.players.map((player) => ({
              ...player,
              notes: player.notes.slice(0, 16),
            })),
          },
          1,
        );
        const shortRecord = await models.replays.get(shortID);
        assertDefined(shortRecord, "Missing trusted short-deck history.");
        const shortReplay = historicalReplay(shortRecord);
        expect(
          shortReplay.state.deck.map(({ suitIndex, rank }) => ({
            suitIndex,
            rank,
          })),
        ).toEqual(shortDeck);
        expect(shortReplay.notes.every((notes) => notes.length === 16)).toBe(
          true,
        );
        const shortExport = await app.inject(`/export/${shortID}`);
        expect(shortExport.statusCode).toBe(200);
        // Stored owned-engine setups do not widen the public JSON import contract.
        expect(() => importReplay(shortExport.json<unknown>())).toThrow(
          "50 valid cards",
        );
      });
    },
  );
});
