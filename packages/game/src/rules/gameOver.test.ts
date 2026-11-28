import { describe, expect, test } from "bun:test";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import { getDefaultMetadata } from "../metadata.ts";
import { gameReducer } from "../reducers/gameReducer.ts";
import { getInitialGameState } from "../reducers/initialStates/initialGameState.ts";
import { draw } from "../testActions.ts";
import type { Rank } from "../types/Rank.ts";
import type { SuitIndex } from "../types/SuitIndex.ts";
import { isGameOver } from "./gameOver.ts";

/** A two-player game in which Alice holds no cards and Bob holds one card. */
function withBobHolding(
  metadata: GameMetadata,
  suitIndex: SuitIndex,
  rank: Rank,
): GameState {
  return gameReducer(
    getInitialGameState(metadata),
    draw(1, 0, suitIndex, rank),
    "hypothetical",
    metadata,
  );
}

describe("isGameOver", () => {
  const LAST_SUIT_INDEX = 2;

  test.each([
    {
      rank: 5,
      over: true,
    },
    {
      rank: 1,
      over: false,
    },
  ] as const)(
    "in the final round, an inverted card of rank $rank gives over = $over",
    ({ rank, over }) => {
      const metadata = getDefaultMetadata(2, "Orange (3 Suits)");
      const state = withBobHolding(metadata, LAST_SUIT_INDEX, rank);
      const finalRound = {
        ...state,
        turn: {
          ...state.turn,
          endTurnNum: state.turn.turnNum + metadata.options.numPlayers,
        },
      };
      expect(isGameOver(finalRound, metadata)).toBe(over);
    },
  );

  test.each([
    {
      name: "a card that no clue touches",
      suitIndex: LAST_SUIT_INDEX,
      emptyClues: false,
      over: true,
    },
    {
      name: "a card that a clue touches",
      suitIndex: 0,
      emptyClues: false,
      over: false,
    },
    {
      name: "a card that no clue touches, with empty clues",
      suitIndex: LAST_SUIT_INDEX,
      emptyClues: true,
      over: false,
    },
  ] as const)(
    "in All or Nothing, a player with no cards whose teammate holds $name gives over = $over",
    ({ suitIndex, emptyClues, over }) => {
      const defaults = getDefaultMetadata(2, "Null (3 Suits)");
      const metadata = {
        ...defaults,
        options: {
          ...defaults.options,
          allOrNothing: true,
          emptyClues,
        },
      };
      const state = withBobHolding(metadata, suitIndex, 5);
      expect(state.turn.currentPlayerIndex).toBe(0);
      expect(isGameOver(state, metadata)).toBe(over);
    },
  );
});
