import {
  gameID,
  SERVER_COMMAND_SCHEMAS,
  tableID,
  userID,
} from "@hanabi-live/data";
import {
  EndCondition,
  getVariant,
  numPlayers,
  options,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { z } from "zod";
import { customDeckBytes } from "./customDeck";
import { parseEngineState } from "./engine/types";
import type { ActiveCheckpoint, CompletedGame } from "./gameStore";
import { extraOptions } from "./interfaces/ExtraOptions";
import type { Game } from "./interfaces/Game";
import type { Table } from "./interfaces/Table";

const request = z.strictObject({
  userID,
  id: z
    .string()
    .max(128)
    .refine((value) => Buffer.byteLength(value) <= 128),
});
const storedPlayer = z.strictObject({
  userID,
  name: z.string().min(1).max(100),
  stats: SERVER_COMMAND_SCHEMAS.game.shape.players.element.shape.stats,
  voteToKill: z.boolean(),
});
const chat = z.strictObject({
  userID: z.number().int().nonnegative(),
  message: SERVER_COMMAND_SCHEMAS.chat,
});
const tag = z.strictObject({ userID, tag: z.string().min(1) });
const spectatorNotes = z.strictObject({
  userID,
  name: z.string().min(1).max(100),
  notes: z.string().max(300).array().max(66),
});
const checkpoint = z.strictObject({
  format: z.literal("hanabi-live-typescript-engine-2"),
  table: z.strictObject({
    id: tableID,
    name: z.string().min(1).max(200),
    initialName: z.string().min(1).max(100),
    maxPlayers: numPlayers,
    ownerID: userID,
    visible: z.boolean(),
    passwordHash: z.string().min(1).max(1024).optional(),
    players: storedPlayer.array().min(2).max(6),
    options,
    extraOptions,
    datetimeCreated: z.iso.datetime(),
    datetimeLastAction: z.iso.datetime(),
    datetimeStarted: z.iso.datetime(),
    datetimeFinished: z.iso.datetime().optional(),
    chat: chat.array(),
  }),
  game: z.strictObject({
    databaseID: gameID,
    state: z.unknown(),
    clocks: z.number().int().array().min(2).max(6),
    duration: z.number().int().nonnegative(),
    turnElapsed: z.number().int().nonnegative(),
    idleRemaining: z.number().int().min(0).max(1_800_000),
    pausePlayerIndex: z.number().int().min(-1).max(5),
    queuedPauses: z.boolean().array().min(2).max(6),
    notes: z.string().max(300).array().max(66).array().min(2).max(6),
    tags: tag.array(),
    requests: request.array().max(1024),
    spectatorNotes: spectatorNotes.array().optional(),
  }),
});

const legacyCheckpoint = checkpoint.extend({
  format: z.literal("hanabi-live-typescript-engine-1"),
  table: checkpoint.shape.table.extend({
    players: storedPlayer.omit({ voteToKill: true }).array().min(2).max(6),
  }),
});

function decodeCheckpoint(input: unknown): z.infer<typeof checkpoint> {
  const { format } = z.object({ format: z.string() }).parse(input);
  if (format === "hanabi-live-typescript-engine-1") {
    const legacy = legacyCheckpoint.parse(input);
    // Version 1 predates termination voting; no accepted runtime votes could be present.
    return {
      ...legacy,
      format: "hanabi-live-typescript-engine-2",
      table: {
        ...legacy.table,
        players: legacy.table.players.map((player) => ({
          ...player,
          voteToKill: false,
        })),
      },
    };
  }
  return checkpoint.parse(input);
}

export function serializeGameCheckpoint(table: Table, game: Game): string {
  const data = {
    format: "hanabi-live-typescript-engine-2",
    table: {
      id: table.id,
      name: table.name,
      initialName: table.initialName,
      maxPlayers: table.maxPlayers,
      ownerID: table.ownerID,
      visible: table.visible,
      passwordHash: table.passwordHash,
      players: table.players.map((entry) => ({
        userID: entry.userID,
        name: entry.name,
        stats: entry.stats,
        voteToKill: entry.voteToKill,
      })),
      options: table.options,
      extraOptions: table.extraOptions,
      datetimeCreated: table.datetimeCreated.toISOString(),
      datetimeLastAction: table.datetimeLastAction.toISOString(),
      datetimeStarted: game.datetimeStarted.toISOString(),
      datetimeFinished: game.datetimeFinished?.toISOString(),
      chat: table.chat,
    },
    game: {
      databaseID: game.databaseID,
      state: game.state,
      clocks: game.clocks,
      duration: game.duration,
      turnElapsed: game.turnElapsed,
      idleRemaining: game.idleRemaining,
      pausePlayerIndex: game.pausePlayerIndex,
      queuedPauses: game.queuedPauses,
      notes: game.notes,
      tags: game.tags,
      requests: game.requests,
      spectatorNotes: game.spectatorNotes,
    },
  };
  return JSON.stringify(checkpoint.parse(data));
}

export function restoreGameCheckpoint(
  row: ActiveCheckpoint,
  now: number,
): Table {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("Invalid active checkpoint envelope.");
  }
  const input: unknown = JSON.parse(row.data);
  const data = decodeCheckpoint(input);
  const state = parseEngineState(data.game.state);
  const { players } = data.table;
  const count = players.length;
  const votes = players.filter((player) => player.voteToKill).length;
  if (
    data.game.databaseID !== row.id
    || row.id <= 0
    || data.table.id <= 0
    || data.table.maxPlayers < count
    || new Set(players.map((entry) => entry.userID)).size !== count
    || players.some((entry) => entry.userID <= 0)
    || data.game.requests.some((entry) => entry.userID <= 0)
    || data.game.tags.some((entry) => entry.userID <= 0)
    || players.every((entry) => entry.userID !== data.table.ownerID)
    || JSON.stringify(data.table.options) !== JSON.stringify(state.options)
    || state.players.some((entry, index) => entry.name !== players[index]?.name)
    || state.players.length !== count
    || data.game.clocks.length !== count
    || data.game.queuedPauses.length !== count
    || data.game.notes.length !== count
    || (state.endCondition === EndCondition.InProgress
      && (count === 2 ? votes === 2 : votes * 2 >= count))
    || data.game.notes.some(
      (notes: readonly string[]) =>
        notes.length
        !== state.deck.length
          + getVariant(state.options.variantName).suits.length,
    )
    || data.game.spectatorNotes?.some(
      (entry) =>
        entry.userID <= 0
        || entry.notes.length
          !== state.deck.length
            + getVariant(state.options.variantName).suits.length,
    ) === true
    || new Set(data.game.spectatorNotes?.map((entry) => entry.userID)).size
      !== (data.game.spectatorNotes?.length ?? 0)
    || new Set(data.game.requests.map((entry) => `${entry.userID}:${entry.id}`))
      .size !== data.game.requests.length
    || (state.endCondition !== EndCondition.InProgress)
      !== (data.table.datetimeFinished !== undefined)
    || (state.paused
      && (data.game.pausePlayerIndex < 0
        || data.game.pausePlayerIndex >= count))
  ) {
    throw new Error("Checkpoint runtime fields do not match its engine state.");
  }
  const created = new Date(data.table.datetimeCreated);
  const started = new Date(data.table.datetimeStarted);
  const finished =
    data.table.datetimeFinished === undefined
      ? undefined
      : new Date(data.table.datetimeFinished);
  if (started < created || (finished !== undefined && finished < started)) {
    throw new Error("Checkpoint timestamps are inconsistent.");
  }
  return {
    id: data.table.id,
    name: data.table.name,
    initialName: data.table.initialName,
    players: players.map((entry) => ({
      ...entry,
      present: false,
      typing: false,
      lastTyped: new Date(0),
    })),
    ownerID: data.table.ownerID,
    visible: data.table.visible,
    maxPlayers: data.table.maxPlayers,
    passwordHash: data.table.passwordHash,
    spectators: [],
    kickedPlayers: [],
    running: true,
    replay: false,
    progress: 0,
    datetimeCreated: created,
    datetimeLastJoined: created,
    datetimeLastAction: new Date(data.table.datetimeLastAction),
    datetimePlannedStart: undefined,
    options: data.table.options,
    extraOptions: data.table.extraOptions,
    chat: data.table.chat,
    chatRead: new Map(),
    game: {
      ...data.game,
      state,
      revision: row.revision,
      datetimeStarted: started,
      datetimeFinished: finished,
      clockAnchor: now,
      replaySegment: state.turn - 1,
    },
  };
}

export function completionRecord(table: Table, game: Game): CompletedGame {
  if (
    game.datetimeFinished === undefined
    || game.state.endCondition === EndCondition.InProgress
  ) {
    throw new Error("Cannot complete an ongoing game.");
  }
  const customDeck = customDeckBytes(
    game.state.deck,
    getVariant(game.state.options.variantName),
    game.state.seed,
  );
  return {
    id: game.databaseID,
    name: table.name,
    options: game.state.options,
    seed: game.state.seed,
    ...(customDeck !== undefined && { customDeck }),
    score: game.state.score,
    numTurns: game.state.turn,
    endCondition: game.state.endCondition,
    datetimeStarted: game.datetimeStarted,
    datetimeFinished: game.datetimeFinished,
    players: table.players.map((player, index) => {
      const statePlayer = game.state.players[index];
      const notes = game.notes[index];
      assertDefined(statePlayer, "Missing completed player state.");
      assertDefined(notes, "Missing completed player notes.");
      return {
        userID: player.userID,
        character: statePlayer.character,
        characterMetadata: statePlayer.characterMetadata,
        notes: [...notes],
      };
    }),
    actions: game.state.actions.map((action) => ({ ...action })),
    chat: table.chat.map((entry) => ({
      userID: entry.userID,
      message: entry.message.msg,
      room: entry.message.room ?? `table${table.id}`,
    })),
    tags: game.tags.map((entry) => ({ ...entry })),
  };
}
