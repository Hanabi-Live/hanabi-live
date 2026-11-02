// cspell:ignore tablename schemaname locktype classid objid datname
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { assertDefined } from "complete-common";
import { fork } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { WebSocket } from "ws";
import { z } from "zod";
import { compatibilityCorpus, recipientEvents } from "./compatibility";
import { applyMove, initialState, moveSchema, validateDeck } from "./engine";
import { connectClient, evaluationDatabase } from "./evaluationSupport";
import { startHost } from "./host";
import {
  createGame,
  finishWinningGame,
  supportedOptions,
  winningDeck,
} from "./scenarios";
import type { SliceStore } from "./store";
import { openStore } from "./store";
// Lifecycle steps and assertions intentionally wait for each authoritative response.
/* eslint-disable no-await-in-loop, unicorn/no-await-expression-member */
import { ClueType } from "@hanabi-live/game";

const corpus = compatibilityCorpus();

test("reports every corpus fixture, including unsupported contracts", () => {
  expect(corpus).toHaveLength(19);
  expect(
    corpus
      .filter(({ reasons }) => reasons.length === 0)
      .map(({ fixture }) => fixture.input.name),
  ).toEqual([
    "empty-clue-rejected",
    "legacy-prefixed-deal",
    "legacy-retry-recovery",
    "terminal-strikeout",
  ]);
  expect(corpus.filter(({ reasons }) => reasons.length > 0)).toHaveLength(15);
});

test("final round lasts exactly two further turns after the last draw", () => {
  const deck = winningDeck();
  let state = initialState();
  while (state.next < 50) {
    const player = state.active;
    const hand = state.hands[player];
    assertDefined(hand, "Missing hand.");
    const target = 1 - player;
    const targetOrder = state.hands[target]?.[0];
    assertDefined(targetOrder, "Missing clue target.");
    const targetCard = deck[targetOrder];
    assertDefined(targetCard, "Missing clue identity.");
    const discard = hand.find((order) => order !== 0);
    assertDefined(discard, "Missing disposable card.");
    ({ state } = applyMove(
      deck,
      state,
      player,
      state.clues === 8
        ? {
            type: "clue",
            target,
            clue: { type: ClueType.Rank, value: targetCard.rank },
          }
        : { type: "discard", order: discard },
    ));
    expect(state.end).toBe(0);
  }
  const lastDrawTurn = state.turn;
  for (let i = 0; i < 2; i++) {
    const target = 1 - state.active;
    const order = state.hands[target]?.[0];
    assertDefined(order, "Missing clue target.");
    const card = deck[order];
    assertDefined(card, "Missing clue identity.");
    ({ state } = applyMove(deck, state, state.active, {
      type: "clue",
      target,
      clue: { type: ClueType.Rank, value: card.rank },
    }));
    expect(state.end).toBe(i === 0 ? 0 : 1);
  }
  expect(state.turn).toBe(lastDrawTurn + 2);
});

const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;
databaseDescribe(
  "experimental authority through PostgreSQL and real WebSockets",
  () => {
    let database: Awaited<ReturnType<typeof evaluationDatabase>>;
    let host: Awaited<ReturnType<typeof startHost>>;
    let store: SliceStore;
    let clients: Array<Awaited<ReturnType<typeof connectClient>>>;

    beforeEach(async () => {
      database = await evaluationDatabase();
      store = await openStore(database.connect());
      host = await startHost(store, winningDeck);
      clients = [];
    });
    afterEach(async () => {
      await host.close();
      await Promise.all(
        clients.map(async (connection) => {
          await connection.close();
        }),
      );
      await database.close();
    });

    async function client(user: string) {
      const connection = await connectClient(host.url, host.session(user));
      clients.push(connection);
      return connection;
    }

    async function pair() {
      return [await client("Alice"), await client("Bob")] as const;
    }

    async function reconstruct(makeDeck = winningDeck) {
      await host.close();
      store = await openStore(database.connect());
      host = await startHost(store, makeDeck);
    }

    test("logs internal failures and freezes their table without freezing validation rejections", async () => {
      await host.close();
      store = await openStore(database.connect());
      const failure = new Error("Injected deck factory failure.");
      let attempts = 0;
      host = await startHost(store, () => {
        attempts++;
        if (attempts === 1) {
          throw failure;
        }
        return winningDeck();
      });
      const diagnostic = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      try {
        const alice = await client("Alice");
        const invalid = await alice.request({
          type: "create",
          options: { numPlayers: 3 },
        });
        expect(invalid.error).toContain("Unsupported");
        expect(attempts).toBe(0);
        expect(diagnostic).not.toHaveBeenCalled();
        const command = { type: "create", options: supportedOptions };
        expect((await alice.request(command, "factory-fault")).error).toContain(
          "Unexpected failure; table frozen",
        );
        expect((await alice.request(command, "factory-fault")).error).toContain(
          "Table frozen",
        );
        expect(attempts).toBe(1);
        expect(diagnostic).toHaveBeenCalledTimes(1);
        expect(diagnostic).toHaveBeenCalledWith(
          "Experimental authority failure",
          {
            tableID: expect.stringMatching(/^[\da-f]{32}$/u),
            requestID: "factory-fault",
          },
          expect.objectContaining({
            message: "Experimental initial conditions failed.",
            cause: failure,
          }),
        );
        const other = await alice.request(command);
        expect(other.type).toBe("ok");
        expect(
          (
            await alice.request({
              type: "act",
              tableID: other.tableID,
              move: { type: "play", order: 0 },
            })
          ).error,
        ).toContain("not a player in a running game");
        const bob = await client("Bob");
        expect(
          (await bob.request({ type: "join", tableID: other.tableID })).type,
        ).toBe("ok");
        expect(diagnostic).toHaveBeenCalledTimes(1);
      } finally {
        diagnostic.mockRestore();
      }
    });

    test("waiting creation retries survive reconstruction without generating a new deck", async () => {
      const alice = await client("Alice");
      const command = { type: "create", options: supportedOptions };
      const created = await alice.request(command, "create-once");
      assertDefined(created.tableID, "Missing created table.");
      const initial = await store.load(created.tableID);
      await reconstruct(() => {
        throw new Error("A retry must not generate a deck.");
      });
      const returning = await client("Alice");
      const duplicate = await returning.request(command, "create-once");
      expect(duplicate.tableID).toBe(created.tableID);
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.revision).toBe(1);
      expect((await store.load(created.tableID))?.deck).toEqual(initial?.deck);
      const bob = await client("Bob");
      expect(
        (await bob.request({ type: "join", tableID: created.tableID })).state
          ?.turn,
      ).toBe(0);
    });

    test("reconstructs in a new OS process after an ungraceful exit", async () => {
      await host.close();
      const readySchema = z.object({
        url: z.string(),
        aliceToken: z.string(),
        bobToken: z.string(),
      });
      async function launch() {
        const child = fork(path.join(__dirname, "processHost.ts"), [], {
          execArgv: ["--import", "tsx"],
          env: { ...process.env, TSX_DISABLE_CACHE: "1" },
          stdio: ["ignore", "ignore", "inherit", "ipc"],
        });
        const ready = once(child, "message");
        child.send({ connection: database.connection });
        const messages: readonly unknown[] = await ready;
        return { child, ready: readySchema.parse(messages[0]) };
      }
      let processHost = await launch();
      try {
        const alice = await connectClient(
          processHost.ready.url,
          processHost.ready.aliceToken,
        );
        const bob = await connectClient(
          processHost.ready.url,
          processHost.ready.bobToken,
        );
        clients.push(alice, bob);
        const { tableID } = await createGame([alice, bob]);
        const first = {
          type: "act",
          tableID,
          move: { type: "play", order: 0 },
        };
        expect((await alice.request(first, "play-0")).state?.turn).toBe(1);
        const exited = once(processHost.child, "exit");
        processHost.child.kill("SIGKILL");
        await exited;
        processHost = await launch();
        const returning = await connectClient(
          processHost.ready.url,
          processHost.ready.aliceToken,
        );
        const partner = await connectClient(
          processHost.ready.url,
          processHost.ready.bobToken,
        );
        clients.push(returning, partner);
        expect(
          (await returning.request({ type: "reconnect", tableID })).state?.turn,
        ).toBe(1);
        expect((await returning.request(first, "play-0")).duplicate).toBe(true);
        await finishWinningGame([returning, partner], tableID);
        expect(
          (await returning.request({ type: "replay", tableID })).replay?.state
            .score,
        ).toBe(25);
        const stopped = once(processHost.child, "exit");
        processHost.child.send("shutdown");
        await stopped;
      } finally {
        if (
          processHost.child.exitCode === null
          && processHost.child.signalCode === null
        ) {
          const stopped = once(processHost.child, "exit");
          processHost.child.kill("SIGKILL");
          await stopped;
        }
      }
    }, 20_000);

    test("auth, bounded options, successful completion, scrubbed reconnect and owned replay", async () => {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = new WebSocket(host.url);
        socket.on("unexpected-response", (_request, response) => {
          response.resume();
          socket.terminate();
          resolve(response.statusCode ?? 0);
        });
        socket.on("error", reject);
      });
      expect(status).toBe(401);
      const players = await pair();
      expect(
        (
          await players[0].request({
            type: "create",
            options: { ...supportedOptions, timed: true },
          })
        ).type,
      ).toBe("error");
      expect(
        (
          await players[0].request({
            type: "create",
            options: { ...supportedOptions, variantName: "Rainbow" },
          })
        ).type,
      ).toBe("error");
      const { tableID, joined } = await createGame(players);
      expect(
        joined.state?.hands[1]?.every(
          (card) => card.rank === -1 && card.suitIndex === -1,
        ),
      ).toBe(true);
      const outsider = await client("Mallory");
      expect(
        (await outsider.request({ type: "reconnect", tableID })).type,
      ).toBe("error");
      expect(
        (
          await outsider.request({
            type: "act",
            tableID,
            move: { type: "play", order: 0 },
          })
        ).type,
      ).toBe("error");
      expect(
        (await players[0].request({ type: "spectate", tableID })).type,
      ).toBe("error");
      expect((await players[0].request({ type: "replay", tableID })).type).toBe(
        "error",
      );
      await players[0].close();
      const reconnected = await client("Alice");
      const restored = await reconnected.request({
        type: "reconnect",
        tableID,
      });
      expect(
        restored.events
          ?.filter((event) => event.type === "draw" && event.playerIndex === 0)
          .every(
            (event) =>
              event.type === "draw"
              && event.rank === -1
              && event.suitIndex === -1,
          ),
      ).toBe(true);
      expect(restored.state?.hands[0]?.every((card) => card.rank === -1)).toBe(
        true,
      );
      const final = await finishWinningGame([reconnected, players[1]], tableID);
      expect(final.state?.score).toBe(25);
      await reconstruct();
      const returning = await client("Alice");
      const duplicate = await returning.request(
        { type: "act", tableID, move: { type: "play", order: 24 } },
        "play-24",
      );
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.revision).toBe(27);
      const replay = await returning.request({ type: "replay", tableID });
      expect(replay.replay?.state.score).toBe(25);
      expect(replay.replay?.actions).toHaveLength(25);
      expect(replay.replay?.deck).toEqual(winningDeck());
      const sql = database.connect();
      try {
        expect(await sql`SELECT id FROM ts_slice_v1.active`).toHaveLength(0);
        expect(await sql`SELECT id FROM ts_slice_v1.completed`).toHaveLength(1);
        expect(
          await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
        ).toHaveLength(0);
      } finally {
        await sql.end();
      }
    });

    test.each(["before", "after"] as const)(
      "freezes only the affected table on %s-commit failure and recovers retries",
      async (failure) => {
        await host.close();
        const durable = await openStore(database.connect());
        let fail = false;
        store = {
          ...durable,
          async save(record, revision) {
            if (fail && failure === "before") {
              fail = false;
              throw new Error("Injected unavailable storage.");
            }
            await durable.save(record, revision);
            if (fail) {
              fail = false;
              throw new Error("Injected lost COMMIT response.");
            }
          },
        };
        host = await startHost(store, winningDeck);
        const players = await pair();
        const { tableID } = await createGame(players);
        const other = await createGame(players);
        await players[0].request({ type: "reconnect", tableID });
        await players[1].request({ type: "reconnect", tableID });
        const published = players[0].updates.length;
        fail = true;
        const action = {
          type: "act",
          tableID,
          move: { type: "play", order: 0 },
        };
        expect((await players[0].request(action, "uncertain")).type).toBe(
          "error",
        );
        expect(players[0].updates).toHaveLength(published);
        expect(
          (await players[0].request({ type: "reconnect", tableID })).error,
        ).toContain("frozen");
        expect(
          (await players[0].request({ ...action, tableID: other.tableID }))
            .type,
        ).toBe("ok");
        await reconstruct();
        const returning = await client("Alice");
        const recovered = await returning.request({
          type: "reconnect",
          tableID,
        });
        expect(recovered.state?.turn).toBe(failure === "before" ? 0 : 1);
        const retried = await returning.request(action, "uncertain");
        expect(retried.type).toBe("ok");
        expect(retried.duplicate === true).toBe(failure === "after");
        expect(retried.state?.turn).toBe(1);
        expect(
          (
            await returning.request(
              { ...action, move: { type: "play", order: 1 } },
              "uncertain",
            )
          ).type,
        ).toBe("error");
      },
    );

    test("a real completion transaction failure rolls back checkpoint deletion", async () => {
      const players = await pair();
      const { tableID } = await createGame(players);
      const sql = database.connect();
      try {
        await sql`ALTER TABLE ts_slice_v1.completed ADD CONSTRAINT injected_failure CHECK (false)`;
        await expect(finishWinningGame(players, tableID)).rejects.toThrow(
          "Unexpected failure",
        );
        const rows = await sql<Array<{ revision: number }>>`
          SELECT revision FROM ts_slice_v1.active WHERE id = ${tableID}
        `;
        expect(rows[0]?.revision).toBe(26);
        expect(await sql`SELECT id FROM ts_slice_v1.completed`).toHaveLength(0);
        await sql`ALTER TABLE ts_slice_v1.completed DROP CONSTRAINT injected_failure`;
        await reconstruct();
        const returning = await client("Alice");
        const result = await returning.request(
          {
            type: "act",
            tableID,
            move: { type: "play", order: 24 },
          },
          "play-24",
        );
        expect(result.state?.score).toBe(25);
        expect(await sql`SELECT id FROM ts_slice_v1.completed`).toHaveLength(1);
        expect(await sql`SELECT id FROM ts_slice_v1.active`).toHaveLength(0);
      } finally {
        await sql.end();
      }
    });

    test("a lost owner connection fences the old host after takeover", async () => {
      const players = await pair();
      const { tableID } = await createGame(players);
      const sql = database.connect();
      let replacement: Awaited<ReturnType<typeof startHost>> | undefined;
      try {
        const terminated = await sql`
          SELECT pg_terminate_backend(pid) FROM pg_locks
          WHERE locktype = 'advisory' AND classid = 1937006963 AND objid = 1
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        `;
        expect(terminated).toHaveLength(1);
        replacement = await startHost(
          await openStore(database.connect()),
          winningDeck,
        );
        const action = {
          type: "act",
          tableID,
          move: { type: "play", order: 0 },
        };
        expect((await players[0].request(action)).type).toBe("error");
        const returning = await connectClient(
          replacement.url,
          replacement.session("Alice"),
        );
        clients.push(returning);
        expect((await returning.request(action)).state?.turn).toBe(1);
      } finally {
        await replacement?.close();
        await sql.end();
      }
    });

    test("uncertain completion is atomic and a terminal retry cannot duplicate history", async () => {
      await host.close();
      const durable = await openStore(database.connect());
      store = {
        ...durable,
        async save(record, revision) {
          await durable.save(record, revision);
          if (record.state?.end === 1) {
            throw new Error("Injected lost terminal COMMIT response.");
          }
        },
      };
      host = await startHost(store, winningDeck);
      const players = await pair();
      const { tableID } = await createGame(players);
      await expect(finishWinningGame(players, tableID)).rejects.toThrow(
        "Unexpected failure",
      );
      expect(players[0].updates.at(-1)?.state?.end).toBe(0);
      await reconstruct();
      const returning = await client("Alice");
      const result = await returning.request(
        { type: "act", tableID, move: { type: "play", order: 24 } },
        "play-24",
      );
      expect(result.duplicate).toBe(true);
      expect(result.state?.score).toBe(25);
      const sql = database.connect();
      try {
        expect(await sql`SELECT id FROM ts_slice_v1.active`).toHaveLength(0);
        expect(await sql`SELECT id FROM ts_slice_v1.completed`).toHaveLength(1);
      } finally {
        await sql.end();
      }
    });

    test("table writers serialize duplicates but unrelated tables progress during a blocked save", async () => {
      await host.close();
      const durable = await openStore(database.connect());
      let blockedID = "";
      const entered = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      store = {
        ...durable,
        async save(record, revision) {
          if (record.id === blockedID) {
            entered.resolve(undefined);
            await release.promise;
          }
          await durable.save(record, revision);
        },
      };
      host = await startHost(store, winningDeck);
      const players = await pair();
      const first = await createGame(players);
      const second = await createGame(players);
      blockedID = first.tableID;
      const action = {
        type: "act",
        tableID: first.tableID,
        move: { type: "play", order: 0 },
      };
      const pending = players[0].request(action, "concurrent");
      await entered.promise;
      try {
        const secondAlice = await client("Alice");
        const duplicate = secondAlice.request(action, "concurrent");
        const other = await client("Alice");
        expect(
          (await other.request({ ...action, tableID: second.tableID })).type,
        ).toBe("ok");
        release.resolve(undefined);
        expect((await pending).revision).toBe(3);
        expect((await duplicate).duplicate).toBe(true);
      } finally {
        release.resolve(undefined);
        await pending;
      }
      const rival = database.connect();
      try {
        await expect(openStore(rival)).rejects.toThrow("already has an owner");
      } finally {
        await rival.end();
      }
    });

    test.each(corpus.filter(({ reasons }) => reasons.length === 0))(
      "matches supported Go corpus $fixture.input.name through transport and persistence",
      async ({ fixture }) => {
        await reconstruct(() => validateDeck(fixture.deck));
        let players = await pair();
        const { tableID } = await createGame(players);
        for (const [recipient, connection] of players.entries()) {
          const initial = await connection.request({
            type: "reconnect",
            tableID,
          });
          expect(initial.events).toEqual(
            recipientEvents(fixture.initial, recipient),
          );
        }
        for (let index = 0; index < fixture.input.commands.length; index++) {
          const command = fixture.input.commands[index];
          const point = fixture.steps[index];
          assertDefined(command, "Missing corpus command.");
          assertDefined(point, "Missing corpus state.");
          const player = players[command.player];
          assertDefined(player, "Missing corpus player.");
          if (command.want === "restored") {
            await reconstruct(() => validateDeck(fixture.deck));
            players = await pair();
            await Promise.all(
              players.map(async (connection) => {
                await connection.request({ type: "reconnect", tableID });
              }),
            );
          } else if (command.want === "reconnect") {
            const result = await player.request({ type: "reconnect", tableID });
            expect(result.events).toEqual(
              recipientEvents(point, command.player),
            );
          } else {
            const move =
              command.type < 2
                ? {
                    type: command.type === 0 ? "play" : "discard",
                    order: command.target,
                  }
                : {
                    type: "clue",
                    target: command.target,
                    clue: { type: command.type - 2, value: command.value },
                  };
            const response = await player.request(
              { type: "act", tableID, move },
              command.request,
            );
            expect(response.type).toBe(
              command.want === "rejected" ? "error" : "ok",
            );
            if (command.want === "duplicate") {
              expect(response.duplicate).toBe(true);
            } else if (command.want === "accepted") {
              expect(moveSchema.safeParse(move).success).toBe(true);
              for (let recipient = 0; recipient < 2; recipient++) {
                const connection = players[recipient];
                assertDefined(connection, "Missing corpus recipient.");
                // A following command on this socket is a transport barrier for its update.
                await connection.request({ type: "reconnect", tableID });
                expect(connection.updates.at(-1)?.events).toEqual(
                  recipientEvents(point, recipient),
                );
              }
            }
          }
          const record = await store.load(tableID);
          const state = record?.state;
          assertDefined(state, "Missing durable corpus state.");
          const expected = point.state;
          expect({
            active: state.active,
            clues: state.clues,
            next: state.next,
            end: state.end,
            endTurn: state.endTurn,
            maxScore: state.maxScore,
            score: state.score,
            strikes: state.strikes,
            turn: state.turn,
            stacks: state.stacks,
            hands: state.hands,
          }).toEqual({
            active: expected.ActivePlayerIndex,
            clues: expected.ClueTokens,
            next: expected.DeckIndex,
            end: expected.EndCondition,
            endTurn: expected.EndTurn,
            maxScore: expected.MaxScore,
            score: expected.Score,
            strikes: expected.Strikes,
            turn: expected.Turn,
            stacks: expected.Stacks,
            hands: expected.Players.map((p) => p.Hand),
          });
          for (const [field, key] of [
            ["touched", "Touched"],
            ["played", "Played"],
            ["discarded", "Discarded"],
            ["failed", "Failed"],
          ] as const) {
            expect(
              isDeepStrictEqual(
                state[field].toSorted((a, b) => a - b),
                expected.Cards.filter((card) => card[key]).map(
                  (card) => card.Order,
                ),
              ),
            ).toBe(true);
          }
        }
      },
    );
  },
);
