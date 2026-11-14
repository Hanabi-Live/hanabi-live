import type {
  GameAction,
  GameMetadata,
  GameState,
  NumPlayers,
} from "@hanabi-live/game";
import {
  gameEventSchema,
  gameOptionsSchema,
  gameReducer,
  getDefaultMetadata,
  getInitialGameState,
  getVariant,
  hasReversedSuits,
  toGameAction,
} from "@hanabi-live/game";
import { test } from "bun:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { ROOT } from "./mainProcessSupport.ts";

/** Plays a game of every variant and prints it as JSON. "runTests.ts" builds it. */
const GAMES = path.join(ROOT, "server/target/debug/examples/games");

/** The games take about 40 MB of JSON. */
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

const TIMEOUT_MS = 600_000;

/** The engine's numbers after the first `numEvents` events of a game. */
const checkpointSchema = z.strictObject({
  numEvents: z.number(),
  turn: z.number(),
  currentPlayerIndex: z.number().nullable(),
  score: z.number(),
  maxScore: z.number(),
  clueTokens: z.number(),
  strikes: z.number(),
  cardsRemainingInTheDeck: z.number(),
  stackDirections: z.array(z.number()),
});

const gameSchema = z.strictObject({
  variantName: z.string(),
  numPlayers: z.number(),
  options: gameOptionsSchema,
  events: z.array(gameEventSchema),
  checkpoints: z.array(checkpointSchema),
});

type Checkpoint = z.infer<typeof checkpointSchema>;

/** Converts an event into the action that the game state applies. The games show every clue. */
function toVisibleGameAction(
  event: z.infer<typeof gameEventSchema>,
): GameAction {
  const action = toGameAction(event);
  if (action.type === "clue" && action.clue.type === undefined) {
    throw new Error("The engine hid a clue.");
  }
  return action;
}

/**
 * The numbers to compare. The engine tracks the direction of a stack only in variants with reversed
 * suits, so the directions are left out of the others.
 */
function comparable(
  checkpoint: Checkpoint,
  reversible: boolean,
): Partial<Checkpoint> {
  return reversible ? checkpoint : { ...checkpoint, stackDirections: [] };
}

/** The game library's numbers, in the shape of the engine's. */
function libraryCheckpoint(state: GameState, numEvents: number): Checkpoint {
  return {
    numEvents,
    turn: state.turn.turnNum,
    // eslint-disable-next-line unicorn/no-null -- The engine writes an absent player as JSON null.
    currentPlayerIndex: state.turn.currentPlayerIndex ?? null,
    score: state.score,
    maxScore: state.stats.maxScore,
    clueTokens: state.clueTokens,
    strikes: state.strikes.length,
    cardsRemainingInTheDeck: state.cardsRemainingInTheDeck,
    stackDirections: [...state.playStackDirections],
  };
}

test(
  "the game library derives the same numbers as the server's rules from the same events",
  () => {
    const output = execFileSync(GAMES, {
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    const games = z.array(gameSchema).parse(JSON.parse(output));

    for (const game of games) {
      const defaults = getDefaultMetadata(
        game.numPlayers as NumPlayers,
        game.variantName,
      );
      const { numPlayers } = defaults.options;
      const metadata: GameMetadata = {
        ...defaults,
        options: { ...game.options, numPlayers },
      };
      const reversible = hasReversedSuits(getVariant(game.variantName));
      let state = getInitialGameState(metadata);
      let applied = 0;
      for (const checkpoint of game.checkpoints) {
        const { numEvents } = checkpoint;
        for (const event of game.events.slice(applied, numEvents)) {
          state = gameReducer(
            state,
            toVisibleGameAction(event),
            false,
            false,
            false,
            false,
            metadata,
          );
        }
        applied = numEvents;

        const library = JSON.stringify(
          comparable(libraryCheckpoint(state, numEvents), reversible),
        );
        const engine = JSON.stringify(comparable(checkpoint, reversible));
        if (library !== engine) {
          throw new Error(
            `The game library and the engine disagree in "${game.variantName}" (${game.numPlayers} players, ${JSON.stringify(game.options)}) after ${numEvents} events.\nLibrary: ${library}\nEngine:  ${engine}`,
          );
        }
      }
    }
  },
  TIMEOUT_MS,
);
