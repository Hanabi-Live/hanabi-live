// cspell:words nextval regclass xact
import type { GameID, UserID } from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import {
  EndCondition,
  getCharacters,
  getVariant,
  options as optionsSchema,
} from "@hanabi-live/game";
import { assertDefined, getObjectKeys } from "complete-common";
import type postgres from "postgres";
import { customDeckBytes, decodeCustomDeck } from "./customDeck";
import type { RecordedAction } from "./engine/types";
import { refreshGameStatistics } from "./gameStatistics";
import {
  recordCheckpoint,
  recordCheckpointFailure,
  storageMetrics,
} from "./operationMetrics";

export interface ActiveCheckpoint {
  readonly id: GameID;
  readonly revision: number;
  readonly data: string;
}

export interface CompletedGame {
  readonly id: GameID;
  readonly name: string;
  readonly options: Options;
  readonly seed: string;
  readonly customDeck?: Uint8Array;
  readonly score: number;
  readonly numTurns: number;
  readonly endCondition: EndCondition;
  readonly datetimeStarted: Date;
  readonly datetimeFinished: Date;
  readonly players: ReadonlyArray<{
    readonly userID: UserID;
    readonly character: string;
    readonly characterMetadata: number;
    readonly notes: readonly string[];
  }>;
  readonly actions: readonly RecordedAction[];
  readonly chat: ReadonlyArray<{
    readonly userID: number;
    readonly message: string;
    readonly room: string;
  }>;
  readonly tags: ReadonlyArray<{
    readonly userID: UserID;
    readonly tag: string;
  }>;
}

interface CompletionResult {
  readonly id: GameID;
  readonly inserted: boolean;
  readonly datetimeStarted: Date;
  readonly datetimeFinished: Date;
}

export interface GameStore {
  reserveID: () => Promise<GameID>;
  load: () => Promise<readonly ActiveCheckpoint[]>;
  completed: (id: GameID) => Promise<boolean>;
  save: (id: GameID, expectedRevision: number, data: string) => Promise<number>;
  complete: (
    game: CompletedGame,
    expectedRevision: number,
  ) => Promise<CompletionResult>;
  refreshStatistics: (game: CompletedGame) => Promise<void>;
  drain: () => Promise<void>;
  close: () => Promise<void>;
}

const TIMEOUT = 30_000;

function isDatabaseGameID(id: number): id is GameID {
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647;
}

function completionRow(game: CompletedGame) {
  const options = optionsSchema.parse(game.options);
  if (
    !isDatabaseGameID(game.id)
    || game.endCondition === EndCondition.InProgress
    || game.players.length !== options.numPlayers
    || new Set(game.players.map((player) => player.userID)).size
      !== game.players.length
    || !Number.isFinite(game.datetimeStarted.getTime())
    || !Number.isFinite(game.datetimeFinished.getTime())
  ) {
    throw new Error("Invalid completed-game record.");
  }
  return {
    id: game.id,
    name: game.name,
    num_players: options.numPlayers,
    starting_player: options.startingPlayer,
    variant_id: getVariant(options.variantName).id,
    timed: options.timed,
    time_base: options.timeBase,
    time_per_turn: options.timePerTurn,
    speedrun: options.speedrun,
    card_cycle: options.cardCycle,
    deck_plays: options.deckPlays,
    empty_clues: options.emptyClues,
    one_extra_card: options.oneExtraCard,
    one_less_card: options.oneLessCard,
    all_or_nothing: options.allOrNothing,
    detrimental_characters: options.detrimentalCharacters,
    seed: game.seed,
    score: game.score,
    num_turns: game.numTurns,
    end_condition: game.endCondition,
    datetime_started: game.datetimeStarted,
    datetime_finished: game.datetimeFinished,
  };
}

/** Leaf adapter: never call table/session code from inside these transactions. */
export function createGameStore(
  client: postgres.Sql,
  statisticsClient: postgres.Sql,
): GameStore {
  const pending = new Set<Promise<unknown>>();
  let closed = false;

  async function bounded<T>(
    operation: string,
    work: (check: () => void) => Promise<T>,
  ): Promise<T> {
    if (closed) {
      throw new Error("Game storage is closed.");
    }
    const deadline = performance.now() + TIMEOUT;
    let timedOut = false;
    function check() {
      if (timedOut || performance.now() >= deadline) {
        throw new Error("Game storage operation timed out.");
      }
    }
    const expired = Promise.withResolvers<never>();
    const timer = setTimeout(() => {
      timedOut = true;
      expired.reject(
        new Error("Game storage operation timed out; its result is uncertain."),
      );
    }, TIMEOUT);
    const task = storageMetrics.measure(
      operation,
      async () => await work(check),
    );
    const tracked: Promise<T> = task.finally(() => {
      clearTimeout(timer);
      pending.delete(tracked);
    });
    pending.add(tracked);
    try {
      return await Promise.race([tracked, expired.promise]);
    } catch (error) {
      if (operation === "checkpoint") {
        recordCheckpointFailure();
      }
      throw error;
    }
  }

  async function drain() {
    const expired = Promise.withResolvers<never>();
    const timer = setTimeout(() => {
      expired.reject(
        new Error("Game storage is still busy; shutdown must remain paused."),
      );
    }, TIMEOUT);
    try {
      async function settled() {
        while (pending.size > 0) {
          // Include work queued by commands admitted before shutdown paused admission.
          // eslint-disable-next-line no-await-in-loop
          await Promise.allSettled(pending);
        }
      }
      await Promise.race([settled(), expired.promise]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    reserveID: async () =>
      await bounded(
        "reserve",
        async (check) =>
          await client.begin(async (tx) => {
            check();
            const rows = await tx<Array<{ id: number }>>`
          SELECT nextval(pg_get_serial_sequence('games', 'id'))::integer AS id
        `;
            check();
            const row = rows[0];
            assertDefined(row, "Game ID reservation did not return an ID.");
            if (!isDatabaseGameID(row.id)) {
              throw new Error("Game ID reservation returned an invalid ID.");
            }
            return row.id;
          }),
      ),

    load: async () =>
      await bounded("load", async (check) => {
        check();
        const rows = await client<
          Array<{ game_id: number; revision: string; checkpoint: string }>
        >`
          SELECT game_id, revision, checkpoint FROM active_games ORDER BY game_id
        `;
        check();
        return rows.map((row) => {
          const revision = Number(row.revision);
          if (
            !isDatabaseGameID(row.game_id)
            || !Number.isSafeInteger(revision)
            || revision <= 0
          ) {
            throw new Error("Invalid active-game identity or revision.");
          }
          return { id: row.game_id, revision, data: row.checkpoint };
        });
      }),

    completed: async (id) =>
      await bounded("completed", async (check) => {
        check();
        const rows = await client<Array<{ completed: boolean }>>`
          SELECT EXISTS(SELECT 1 FROM games WHERE id = ${id}) AS completed
        `;
        check();
        const row = rows[0];
        assertDefined(row, "Completed-game lookup returned no result.");
        return row.completed;
      }),

    async save(id, expectedRevision, data) {
      if (
        !isDatabaseGameID(id)
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
        || expectedRevision >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error("Invalid active-game checkpoint identity.");
      }
      const revision = expectedRevision + 1;
      recordCheckpoint(data);
      return await bounded(
        "checkpoint",
        async (check) =>
          await client.begin(async (tx) => {
            check();
            await tx`SELECT pg_advisory_xact_lock(17482, ${id})`;
            check();
            const rows = await tx<Array<{ revision: string }>>`
          INSERT INTO active_games (game_id, revision, checkpoint)
          SELECT ${id}, ${revision}::bigint, ${data}
          WHERE NOT EXISTS (SELECT 1 FROM games WHERE id = ${id})
            AND (${revision}::bigint = 1 OR EXISTS (
              SELECT 1 FROM active_games WHERE game_id = ${id} AND revision = ${expectedRevision}
            ))
          ON CONFLICT (game_id) DO UPDATE
          SET revision = EXCLUDED.revision, checkpoint = EXCLUDED.checkpoint
          WHERE active_games.revision = EXCLUDED.revision - 1
          RETURNING revision
        `;
            check();
            if (rows.length !== 1) {
              throw new Error(
                "Active checkpoint conflicts with durable revision or completion.",
              );
            }
            return revision;
          }),
      );
    },

    async complete(game, expectedRevision) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
        throw new Error("Invalid terminal checkpoint revision.");
      }
      const row = completionRow(game);
      const variant = getVariant(game.options.variantName);
      const customDeck =
        game.customDeck === undefined
          ? undefined
          : customDeckBytes(
              decodeCustomDeck(game.customDeck, variant),
              variant,
              game.seed,
            );
      return await bounded(
        "complete",
        async (check) =>
          await client.begin(async (tx) => {
            check();
            await tx`SELECT pg_advisory_xact_lock(17482, ${game.id})`;
            check();
            const existing = await tx<Array<ReturnType<typeof completionRow>>>`
          SELECT * FROM games WHERE id = ${game.id}
        `;
            check();
            const previous = existing[0];
            if (previous !== undefined) {
              const decks = await tx<Array<{ deck: Uint8Array }>>`
                SELECT deck FROM game_custom_decks WHERE game_id = ${game.id}
              `;
              check();
              const stored = decks[0];
              if (stored !== undefined) {
                decodeCustomDeck(stored.deck, variant);
              }
              if (
                (customDeck === undefined && stored !== undefined)
                || (customDeck !== undefined
                  && (stored === undefined || !customDeck.equals(stored.deck)))
              ) {
                throw new Error(
                  "Completed-game retry conflicts with the stored custom deck.",
                );
              }
              for (const key of getObjectKeys(row)) {
                if (
                  key !== "datetime_started"
                  && key !== "datetime_finished"
                  && previous[key] !== row[key]
                ) {
                  throw new Error(
                    "Completed-game retry conflicts with the stored result.",
                  );
                }
              }
              const players = await tx<
                Array<{ user_id: number; seat: number }>
              >`
                SELECT user_id, seat FROM game_participants WHERE game_id = ${game.id} ORDER BY seat
              `;
              check();
              const actions = await tx<
                Array<RecordedAction & { turn: number }>
              >`
                SELECT turn, type, target, value FROM game_actions WHERE game_id = ${game.id} ORDER BY turn
              `;
              check();
              if (
                players.length !== game.players.length
                || players.some(
                  (player, index) =>
                    player.seat !== index
                    || player.user_id !== game.players[index]?.userID,
                )
                || actions.length !== game.actions.length
                || actions.some((action, index) => {
                  const expected = game.actions[index];
                  return (
                    action.turn !== index
                    || action.type !== expected?.type
                    || action.target !== expected.target
                    || action.value !== expected.value
                  );
                })
              ) {
                throw new Error(
                  "Completed-game retry conflicts with stored participants or actions.",
                );
              }
              await tx`DELETE FROM active_games WHERE game_id = ${game.id}`;
              check();
              return {
                id: game.id,
                inserted: false,
                datetimeStarted: previous.datetime_started,
                datetimeFinished: previous.datetime_finished,
              };
            }
            const active = await tx<Array<{ revision: string }>>`
          SELECT revision FROM active_games WHERE game_id = ${game.id}
        `;
            check();
            if (
              active[0] === undefined
              || Number(active[0].revision) !== expectedRevision
            ) {
              throw new Error(
                "Completion does not own the active checkpoint revision.",
              );
            }
            await tx`INSERT INTO games ${tx(row)}`;
            check();
            if (customDeck !== undefined) {
              await tx`INSERT INTO game_custom_decks (game_id, deck) VALUES (${game.id}, ${customDeck})`;
              check();
            }
            const characters = getCharacters();
            const participants = game.players.map((player, seat) => {
              let characterAssignment = 0;
              let characterMetadata = 0;
              if (game.options.detrimentalCharacters) {
                if (player.character === "n/a") {
                  characterAssignment = -1;
                } else {
                  const character = characters.find(
                    ({ name }) => name === player.character,
                  );
                  assertDefined(character, "Unknown completed-game character.");
                  characterAssignment = character.id;
                  if (character.writeMetadataToDatabase === true) {
                    characterMetadata = player.characterMetadata + 1;
                  }
                }
              }
              return {
                game_id: game.id,
                user_id: player.userID,
                seat,
                character_assignment: characterAssignment,
                character_metadata: characterMetadata,
              };
            });
            const inserted = await tx<Array<{ id: number; seat: number }>>`
          INSERT INTO game_participants ${tx(participants)} RETURNING id, seat
        `;
            check();
            const notes: Array<{
              game_participant_id: number;
              card_order: number;
              note: string;
            }> = [];
            for (const participant of inserted) {
              const player = game.players[participant.seat];
              assertDefined(player, "Missing completed-game player.");
              for (const [order, note] of player.notes.entries()) {
                if (note !== "") {
                  notes.push({
                    game_participant_id: participant.id,
                    card_order: order,
                    note,
                  });
                }
              }
            }
            for (let offset = 0; offset < game.actions.length; offset += 500) {
              const actions = game.actions
                .slice(offset, offset + 500)
                .map((action, index) => ({
                  game_id: game.id,
                  turn: offset + index,
                  ...action,
                }));
              // eslint-disable-next-line no-await-in-loop
              await tx`INSERT INTO game_actions ${tx(actions)}`;
              check();
            }
            for (let offset = 0; offset < notes.length; offset += 500) {
              // eslint-disable-next-line no-await-in-loop
              await tx`INSERT INTO game_participant_notes ${tx(notes.slice(offset, offset + 500))}`;
              check();
            }
            for (let offset = 0; offset < game.chat.length; offset += 500) {
              const messages = game.chat
                .slice(offset, offset + 500)
                .map((message) => ({
                  user_id: message.userID,
                  source: message.userID === 0 ? "server" : "user",
                  message: message.message,
                  room: message.room,
                }));
              // eslint-disable-next-line no-await-in-loop
              await tx`INSERT INTO chat_log ${tx(messages)}`;
              check();
            }
            for (let offset = 0; offset < game.tags.length; offset += 500) {
              const tags = game.tags.slice(offset, offset + 500).map((tag) => ({
                game_id: game.id,
                user_id: tag.userID,
                tag: tag.tag,
              }));
              // eslint-disable-next-line no-await-in-loop
              await tx`INSERT INTO game_tags ${tx(tags)}`;
              check();
            }
            await tx`DELETE FROM active_games WHERE game_id = ${game.id}`;
            check();
            return {
              id: game.id,
              inserted: true,
              datetimeStarted: game.datetimeStarted,
              datetimeFinished: game.datetimeFinished,
            };
          }),
      );
    },

    async refreshStatistics(game) {
      completionRow(game);
      await bounded("statistics", async (check) => {
        await refreshGameStatistics(statisticsClient, game, check);
      });
    },

    drain,
    async close() {
      closed = true;
      await drain();
      await client.end({ timeout: 30 });
    },
  };
}
