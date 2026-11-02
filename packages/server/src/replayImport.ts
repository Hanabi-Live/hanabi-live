import type { GameID } from "@hanabi-live/data";
import { gameID } from "@hanabi-live/data";
import {
  DEFAULT_PLAYER_NAMES,
  doesVariantExist,
  EndCondition,
  getCharacter,
  getVariant,
  getVariantByID,
  options,
  rank,
  suitIndex,
} from "@hanabi-live/game";
import { escapeHTMLCharacters, isArray } from "complete-common";
import { z } from "zod";
import { applyAction, createGame, terminateGame } from "./engine/game";
import { createShuffledDeck } from "./engine/setup";
import type { CompletionTiming, EngineState, GameSetup } from "./engine/types";
import { ActionRejected } from "./engine/types";
import type { models } from "./models";

function boundedArray<T extends z.ZodType>(element: T, maximum: number) {
  return z
    .unknown()
    .transform((value) => value ?? [])
    .refine((value) => isArray(value) && value.length <= maximum, {
      message: `Expected at most ${maximum} entries.`,
      abort: true,
    })
    .pipe(z.array(element));
}

const integer = z.int();
const defaultInteger = z.preprocess((value) => value ?? 0, integer);
const identity = z.object({
  suitIndex: z.preprocess((value) => value ?? 0, suitIndex),
  rank: z.preprocess((value) => value ?? 0, rank),
});
const actionType = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
const actionSchema = z.object({
  type: z.preprocess((value) => value ?? 0, actionType),
  target: defaultInteger,
  value: defaultInteger,
});
const jsonOptions = options
  .unwrap()
  .omit({
    numPlayers: true,
    variantName: true,
    variantID: true,
    tableName: true,
    maxPlayers: true,
  })
  .extend({
    variant: z.string().max(200).default("No Variant"),
    detrimentalCharacters: z.boolean().optional(),
    timeBase: integer.default(0),
  })
  .strip();
const noteText = z.preprocess((value) => value ?? "", z.string().max(65_536));
const noteRow = boundedArray(noteText, 66);
const character = z.object({
  name: z.preprocess((value) => value ?? "", z.string().max(100)),
  metadata: defaultInteger,
});
const nullableOptions = z
  .preprocess((value) => value ?? {}, z.record(z.string(), z.unknown()))
  .transform((value: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(
      Object.entries(value).filter(([, field]) => field !== null),
    ),
  )
  .pipe(jsonOptions);
const terminationCondition = z.union([
  z.literal(EndCondition.Timeout),
  z.literal(EndCondition.TerminatedByPlayer),
  z.literal(EndCondition.TerminatedByVote),
  z.literal(EndCondition.IdleTimeout),
  z.literal(EndCondition.AllOrNothingFail),
]);
const seed = z
  .string()
  .max(45)
  .regex(/^[-0-9A-Za-z]*$/u);
const specificationSchema = z.object({
  players: boundedArray(z.string().min(1).max(15), 6).default([]),
  seed: z.preprocess((value) => value ?? "", seed),
  deck: boundedArray(identity, 60).default([]),
  actions: boundedArray(actionSchema, 512).default([]),
  options: nullableOptions,
  notes: boundedArray(noteRow, 6).default([]),
  characters: boundedArray(character, 6).default([]),
});

export interface PreparedReplay {
  readonly state: EngineState;
  readonly databaseID: GameID;
  readonly datetimeStarted: Date;
  readonly datetimeFinished: Date | undefined;
  readonly notes: ReadonlyArray<readonly string[]>;
  readonly customSeed: string | undefined;
  readonly warnings: readonly string[];
}
interface ImportedAction {
  readonly type: number;
  readonly target: number;
  readonly value: number;
}
export interface ReplaySpecification {
  readonly setup: GameSetup;
  readonly actions: readonly ImportedAction[];
  readonly notes: ReadonlyArray<readonly string[]>;
  readonly customSeed: string | undefined;
}

export function emulateGameActions(
  initial: EngineState,
  actions: readonly ImportedAction[],
  timing?: CompletionTiming,
): { state: EngineState; warnings: readonly string[] } {
  let state = initial;
  const warnings: string[] = [];
  for (const [index, action] of actions.entries()) {
    if (state.endCondition !== EndCondition.InProgress) {
      break;
    }
    try {
      if (action.type === 4 || action.type === 5) {
        const condition = terminationCondition.safeParse(action.value);
        if (!condition.success) {
          throw new ActionRejected("Invalid end game condition.");
        }
        ({ state } = terminateGame(
          state,
          {
            actorIndex: state.activePlayerIndex,
            condition: condition.data,
            playerIndex: action.target,
          },
          timing,
        ));
      } else if (
        action.type === 0
        || action.type === 1
        || action.type === 2
        || action.type === 3
      ) {
        ({ state } = applyAction(
          state,
          state.activePlayerIndex,
          {
            ...action,
            type: action.type,
          },
          timing,
        ));
      } else {
        throw new ActionRejected("That is not a valid action type.");
      }
    } catch (error) {
      if (!(error instanceof ActionRejected)) {
        throw error;
      }
      warnings.push(
        `The action at index ${index} was not valid. Skipping all subsequent actions. ${error.message}`,
      );
      break;
    }
  }
  return { state, warnings };
}

/** JSON is an untrusted game specification, not a restored owned engine checkpoint. */
export function parseReplaySpecification(input: unknown): ReplaySpecification {
  const parsed = specificationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ActionRejected(`Invalid game JSON: ${parsed.error.message}`);
  }
  const { data } = parsed;
  const { variant: variantName, ...modifiers } = data.options;
  if (!doesVariantExist(variantName)) {
    throw new ActionRejected(
      `"${escapeHTMLCharacters(variantName)}" is not a valid variant.`,
    );
  }
  const variant = getVariant(variantName);
  let { players } = data;
  if (players.length === 0) {
    const match = /^(?:legacy-\d+-)?p([2-6])v\d+s[-0-9A-Za-z]+$/u.exec(
      data.seed,
    );
    if (match === null) {
      throw new ActionRejected(
        "You must provide players when the player count cannot be determined from the seed.",
      );
    }
    players = DEFAULT_PLAYER_NAMES.slice(0, Number(match[1]));
  }
  const illegalCharacters = "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?";
  if (
    players.length < 2
    || players.some(
      (name) =>
        Buffer.byteLength(name) > 15
        || illegalCharacters.split("").some((letter) => name.includes(letter)),
    )
  ) {
    throw new ActionRejected("Invalid player names or player count.");
  }
  if (data.options.startingPlayer >= players.length) {
    throw new ActionRejected("The starting player index is out of bounds.");
  }
  const seededDeck = createShuffledDeck(variant, data.seed);
  const deck =
    data.deck.length === 0 && data.seed !== "" ? seededDeck : data.deck;
  if (
    deck.length !== seededDeck.length
    || deck.some((card) => card.suitIndex >= variant.suits.length)
  ) {
    throw new ActionRejected(
      `The deck must have ${seededDeck.length} valid cards in it.`,
    );
  }
  if (
    data.seed !== ""
    && deck.some(
      (card, index) =>
        card.suitIndex !== seededDeck[index]?.suitIndex
        || card.rank !== seededDeck[index].rank,
    )
  ) {
    throw new ActionRejected("The deck does not match the seed.");
  }
  for (const [index, entry] of data.actions.entries()) {
    const invalid =
      (entry.type <= 1
        && (entry.target < 0
          || entry.target >= deck.length
          || entry.value !== 0))
      || ((entry.type === 2 || entry.type === 3 || entry.type === 4)
        && (entry.target < 0 || entry.target >= players.length))
      || (entry.type === 2
        && (entry.value < 0 || entry.value > variant.clueColors.length))
      || (entry.type === 3 && (entry.value < 1 || entry.value > 5))
      || (entry.type === 5 && entry.target !== -1);
    if (invalid) {
      throw new ActionRejected(
        `The action at index ${index} has an invalid target or value.`,
      );
    }
  }
  const notesSize = deck.length + variant.suits.length;
  if (
    (data.notes.length > 0 && data.notes.length !== players.length)
    || data.notes.some((notes: readonly string[]) => notes.length > notesSize)
  ) {
    throw new ActionRejected(
      "The note arrays must match the players and deck size.",
    );
  }
  if (
    data.options.detrimentalCharacters !== undefined
    && data.characters.length !== players.length
  ) {
    throw new ActionRejected(
      "The amount of characters must match the number of players.",
    );
  }
  return {
    setup: {
      options: options.parse({
        ...modifiers,
        variantName,
        variantID: variant.id,
        numPlayers: players.length,
      }),
      playerNames: players,
      seed: data.seed === "" ? "JSON" : data.seed,
      deck,
      ...(data.characters.length > 0 && { characters: data.characters }),
    },
    actions: data.actions,
    customSeed: data.seed === "" ? undefined : data.seed,
    notes: players.map((_, index) =>
      Array.from(
        { length: notesSize },
        (__, order) => data.notes[index]?.[order] ?? "",
      ),
    ),
  };
}

export function importReplay(input: unknown): PreparedReplay {
  const specification = parseReplaySpecification(input);
  const datetimeStarted = new Date();
  const result = emulateGameActions(
    createGame({
      ...specification.setup,
      interpretation: "legacy-replay",
    }).state,
    specification.actions,
  );
  return {
    ...result,
    databaseID: 0 as GameID,
    datetimeStarted,
    datetimeFinished:
      result.state.endCondition === EndCondition.InProgress
        ? undefined
        : new Date(),
    customSeed: specification.customSeed,
    notes: specification.notes,
  };
}

export function historicalReplaySpecification(
  record: NonNullable<Awaited<ReturnType<typeof models.replays.get>>>,
): ReplaySpecification {
  const { game, players, actions } = record;
  if (
    players.length !== game.numPlayers
    || players.some((player, index) => player.seat !== index)
  ) {
    throw new Error(`Game ${game.id} has inconsistent participant seats.`);
  }
  const variant = getVariantByID(game.variantID);
  const setup: GameSetup = {
    options: options.parse({
      numPlayers: game.numPlayers,
      startingPlayer: game.startingPlayer,
      variantName: variant.name,
      variantID: variant.id,
      timed: game.timed,
      timeBase: game.timeBase,
      timePerTurn: game.timePerTurn,
      speedrun: game.speedrun,
      cardCycle: game.cardCycle,
      deckPlays: game.deckPlays,
      emptyClues: game.emptyClues,
      oneExtraCard: game.oneExtraCard,
      oneLessCard: game.oneLessCard,
      allOrNothing: game.allOrNothing,
      detrimentalCharacters: game.detrimentalCharacters,
    }),
    playerNames: players.map((player) => player.name),
    seed: game.seed,
    ...(record.customDeck !== undefined && { deck: record.customDeck }),
    ...(game.detrimentalCharacters && {
      characters: players.map((player) => ({
        name:
          player.characterAssignment === -1
            ? ""
            : getCharacter(player.characterAssignment).name,
        metadata: player.characterMetadata - 1,
      })),
    }),
  };
  const deck = record.customDeck ?? createShuffledDeck(variant, game.seed);
  const notes = players.map(() =>
    Array.from({ length: deck.length + variant.suits.length }, () => ""),
  );
  for (const note of record.notes) {
    const row = notes[note.seat];
    if (row !== undefined && note.order >= 0 && note.order < row.length) {
      row[note.order] = note.note;
    }
  }
  return {
    setup,
    actions,
    customSeed: game.seed,
    notes,
  };
}

export function historicalReplay(
  record: NonNullable<Awaited<ReturnType<typeof models.replays.get>>>,
): PreparedReplay {
  const specification = historicalReplaySpecification(record);
  return {
    ...emulateGameActions(
      createGame({
        ...specification.setup,
        interpretation: "legacy-replay",
      }).state,
      specification.actions,
    ),
    databaseID: gameID.parse(record.game.id),
    datetimeStarted: record.game.datetimeStarted,
    datetimeFinished: record.game.datetimeFinished,
    customSeed: specification.customSeed,
    notes: specification.notes,
  };
}
