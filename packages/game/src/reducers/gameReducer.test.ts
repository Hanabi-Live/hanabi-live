import { describe, expect, test } from "bun:test";
import { assertDefined, eRange, iRange } from "complete-common";
import { DEFAULT_PLAYER_NAMES } from "../constants.ts";
import { CardStatus } from "../enums/CardStatus.ts";
import { MAX_CLUES } from "../generated/protocol.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import { getDefaultMetadata } from "../metadata.ts";
import { colorClue, discard, draw, play, rankClue } from "../testActions.ts";
import type { ActionClue, GameAction } from "../types/gameActions.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type { Rank } from "../types/Rank.ts";
import { recalculateDeductions } from "./cardDeductionReducer.ts";
import { gameReducer } from "./gameReducer.ts";
import { getInitialGameState } from "./initialStates/initialGameState.ts";
import { getInitialGameStateTest } from "./initialStates/initialGameStateTest.ts";
import { getEfficiencyFromGameState } from "./reducerHelpers.ts";

const NUM_PLAYERS = 3;
const DEFAULT_METADATA = getDefaultMetadata(NUM_PLAYERS);
const CLUE_STARVED_METADATA = getDefaultMetadata(
  NUM_PLAYERS,
  "Clue Starved (6 Suits)",
);
const SUDOKU_METADATA = getDefaultMetadata(NUM_PLAYERS, "Sudoku (5 Suits)");

describe("gameReducer", () => {
  test("rejects a draw that skips a card order", () => {
    const state = getInitialGameStateTest(DEFAULT_METADATA);
    expect(() =>
      gameReducer(
        state,
        draw(0, 1, 0, 1),
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      ),
    ).toThrow(
      "Received a draw for card order 1, but the next card order in the deck is: 0",
    );
  });

  test("hidden Duck clues retain public markings and logs without identity deductions", () => {
    const metadata = getDefaultMetadata(2, "Duck (5 Suits)");
    let state = getInitialGameStateTest(metadata);
    const first = draw(1, 0, 0, 1);
    for (const action of [first, draw(1, 1, 1, 2)]) {
      state = gameReducer(state, action, true, false, false, false, metadata);
    }
    const action: ActionClue = {
      type: "clue",
      clue: { type: undefined, value: undefined },
      giver: 0,
      target: 1,
      orders: [first.order],
      ignoreNegative: false,
    };
    const updated = gameReducer(
      state,
      action,
      true,
      false,
      false,
      false,
      metadata,
    );
    expect(updated.clues.at(-1)).toMatchObject({
      type: undefined,
      value: undefined,
      giver: 0,
      target: 1,
      list: [0],
      negativeList: [1],
    });
    expect(updated.log.at(-1)?.text).toContain("quacks");
    expect(updated.clueTokens).toBe(state.clueTokens - 1);
    expect(updated.deck[0]?.numPositiveClues).toBe(1);
    expect(updated.deck[1]?.hasClueApplied).toBe(true);
    for (const [index, card] of updated.deck.entries()) {
      expect(card.possibleCards).toEqual<unknown>(
        state.deck[index]?.possibleCards,
      );
      expect(card.positiveColorClues).toEqual([]);
      expect(card.positiveRankClues).toEqual([]);
    }
  });

  test("does not mutate state", () => {
    const state = getInitialGameState(DEFAULT_METADATA);
    const unchangedState = getInitialGameState(DEFAULT_METADATA);
    const newState = gameReducer(
      state,
      draw(0, 0),
      true,
      false,
      false,
      false,
      DEFAULT_METADATA,
    );
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe("turn", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      expect(state.turn.turnNum).toBeGreaterThan(initialState.turn.turnNum);
    });
  });

  describe("currentPlayerIndex", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      expect(state.turn.currentPlayerIndex).not.toEqual(
        initialState.turn.currentPlayerIndex,
      );
    });
  });

  describe("efficiency", () => {
    test("is Infinity after a play on the first turn", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Blind-play that red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(Infinity);
    });

    test("is 0 after a misplay on the first turn", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Misplay the red 1.
      const discardAction = discard(0, 0, 0, 1, true);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(0);
    });

    test("is 3 after a 3-for-1 clue", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a red 1, a red 2, and a red 3.
      for (const i of iRange(1, 3)) {
        const order = i - 1;
        const rank = i as Rank;
        const drawAction = draw(0, order, 0, rank);
        state = gameReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          DEFAULT_METADATA,
        );
      }

      // Give a 3-for-1 clue touching the 3 red cards.
      const clueAction = colorClue(0, 1, [0, 1, 2], 0);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(3);
    });

    test("is decreased after a misplay", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a yellow 2 to player 0.
      const drawYellow2Action = draw(0, 0, 1, 2);
      state = gameReducer(
        state,
        drawYellow2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Draw a red 1 to player 1.
      const drawRed1Action = draw(1, 1, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Give a 1-for-1 clue.
      const clueAction = colorClue(0, 0, [0], 1);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Play that red 1.
      const playAction = play(1, 1, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Misplay the yellow 2.
      const discardAction = discard(0, 0, 1, 2, true);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(0.5);
    });

    test("is decreased after a clue from playing a 5 is wasted", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a red 2, a red 4, and a red 5 to player 0.
      const drawRed2Action = draw(0, 0, 0, 2);
      state = gameReducer(
        state,
        drawRed2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed4Action = draw(0, 1, 0, 4);
      state = gameReducer(
        state,
        drawRed4Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed5Action = draw(0, 2, 0, 5);
      state = gameReducer(
        state,
        drawRed5Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Draw a red 1, a red 3, and a red 1 to player 1.
      const drawRed1Action = draw(1, 3, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed3Action = draw(1, 4, 0, 3);
      state = gameReducer(
        state,
        drawRed3Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed1Action2 = draw(1, 5, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action2,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 gives a 1-for-1 clue.
      const clueAction = rankClue(1, 0, [3, 5], 1);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 plays the red 1.
      const playRed1Action = play(1, 3, 0, 1);
      state = gameReducer(
        state,
        playRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 plays the red 2.
      const playRed2Action = play(0, 0, 0, 2);
      state = gameReducer(
        state,
        playRed2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 plays the red 3.
      const playRed3Action = play(1, 4, 0, 3);
      state = gameReducer(
        state,
        playRed3Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 plays the red 4.
      const playRed4Action = play(0, 1, 0, 4);
      state = gameReducer(
        state,
        playRed4Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 discards the other red 1.
      const discardAction = discard(1, 5, 0, 1, false);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.clueTokens).toBe(MAX_CLUES);
      const efficiency1 = getEfficiencyFromGameState(state);
      expect(efficiency1).toBe(4); // e.g. 4 / 1

      // Player 0 plays the red 5.
      const playRed5Action = play(0, 2, 0, 5);
      state = gameReducer(
        state,
        playRed5Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency2 = getEfficiencyFromGameState(state);
      expect(efficiency2).toBe(2.5); // e.g. 5 / 2 (because we wasted a clue)
    });

    describe("Clue Starved", () => {
      test("is decreased after a clue from playing a 5 is wasted", () => {
        let state = getInitialGameStateTest(CLUE_STARVED_METADATA);

        // Draw a red 2, a red 4, and a red 5 to player 0.
        const drawRed2Action = draw(0, 0, 0, 2);
        state = gameReducer(
          state,
          drawRed2Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed4Action = draw(0, 1, 0, 4);
        state = gameReducer(
          state,
          drawRed4Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed5Action = draw(1, 2, 0, 5);
        state = gameReducer(
          state,
          drawRed5Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Draw a red 1, a red 3, a red 1, and a red 1 to player 1.
        const drawRed1Action = draw(1, 3, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed3Action = draw(1, 4, 0, 3);
        state = gameReducer(
          state,
          drawRed3Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed1Action2 = draw(0, 5, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action2,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed1Action3 = draw(0, 6, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action3,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 gives a 1-for-1 clue.
        const clueAction = rankClue(1, 0, [3, 5, 6], 1);
        state = gameReducer(
          state,
          clueAction,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 plays the red 1.
        const playRed1Action = play(1, 3, 0, 1);
        state = gameReducer(
          state,
          playRed1Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 plays the red 2.
        const playRed2Action = play(0, 0, 0, 2);
        state = gameReducer(
          state,
          playRed2Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 plays the red 3.
        const playRed3Action = play(1, 4, 0, 3);
        state = gameReducer(
          state,
          playRed3Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 plays the red 4.
        const playRed4Action = play(0, 1, 0, 4);
        state = gameReducer(
          state,
          playRed4Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 discards the other two red 1s.
        const discardAction1 = discard(1, 5, 0, 1, false);
        state = gameReducer(
          state,
          discardAction1,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const discardAction2 = discard(1, 6, 0, 1, false);
        state = gameReducer(
          state,
          discardAction2,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        expect(state.clueTokens).toBe(MAX_CLUES * 2);
        const efficiency1 = getEfficiencyFromGameState(state);
        expect(efficiency1).toBe(4); // e.g. 4 / 1

        // Player 0 plays the red 5.
        const playRed5Action = play(0, 2, 0, 5);
        state = gameReducer(
          state,
          playRed5Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        const efficiency2 = getEfficiencyFromGameState(state);
        expect(efficiency2).toBeCloseTo(3.33);
        // e.g. 5 / 1.5 (because we wasted half a clue)
      });
    });
  });

  describe("Sudoku", () => {
    const RED = 0;
    const YELLOW = 1;
    const GREEN = 2;
    const BLUE = 3;
    const PURPLE = 4;

    test("recomputes cross-suit cardStatus after play changes available stack starts", () => {
      let state = getInitialGameStateTest(SUDOKU_METADATA);

      function currentPlayerIndex() {
        const playerIndex = state.turn.currentPlayerIndex;
        assertDefined(
          playerIndex,
          "Expected currentPlayerIndex to be non-null during this Sudoku regression test.",
        );
        return playerIndex;
      }

      let playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 0, RED, 3),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        play(playerIndex, 0, RED, 3),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 1, YELLOW, 2),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        play(playerIndex, 1, YELLOW, 2),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 2, BLUE, 5),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        play(playerIndex, 2, BLUE, 5),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      // Hold a purple 5.
      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 3, PURPLE, 5),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      // Discard both purple 2s.
      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 4, PURPLE, 2),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        discard(playerIndex, 4, PURPLE, 2, false),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 5, PURPLE, 2),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        discard(playerIndex, 5, PURPLE, 2, false),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      expect(state.cardStatus[PURPLE][5]).not.toBe(CardStatus.Trash);

      // Play a green 4, occupying the remaining viable stack start (4).
      playerIndex = currentPlayerIndex();
      state = gameReducer(
        state,
        draw(playerIndex, 6, GREEN, 4),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );
      state = gameReducer(
        state,
        play(playerIndex, 6, GREEN, 4),
        true,
        false,
        false,
        false,
        SUDOKU_METADATA,
      );

      expect(state.cardStatus[PURPLE][5]).toBe(CardStatus.Trash);
    });
  });

  describe("clues", () => {
    test("are added to the list of clues", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const clue = state.clues[0];
      assertDefined(clue, "Failed to get the clue.");

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(clue.giver).toBe(testClue.giver);
      expect(clue.target).toBe(testClue.target);
      expect(clue.type).toBe(testClue.clue.type);
      expect(clue.value).toBe(testClue.clue.value);
      expect(clue.list).toEqual([]);
      expect(clue.negativeList).toEqual([]);
    });

    test("are remembered with the correct positive and negative cards", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw 5 cards (red 1-3, yellow 4-5).
      for (const i of eRange(5)) {
        const suitIndex = i <= 2 ? 0 : 1;
        const rank = (i + 1) as Rank;
        const drawAction = draw(1, i, suitIndex, rank);
        state = gameReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          DEFAULT_METADATA,
        );
      }

      // Player 0 gives a clue that touches cards 0, 1, and 2.
      const testClue = rankClue(5, 0, [0, 1, 2], 1);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const clue = state.clues[0];
      assertDefined(clue, "Failed to get the clue.");

      expect(clue.list).toEqual<unknown>([0, 1, 2]);
      expect(clue.negativeList).toEqual<unknown>([3, 4]);
    });

    test("decrement clueTokens", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.clueTokens).toBe(MAX_CLUES - 1);
    });
  });

  describe("plays", () => {
    test("increase the score by 1", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Play a red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.score).toBe(1);
    });
  });
});

function applyAction(
  state: GameState,
  action: GameAction,
  metadata: GameMetadata,
): GameState {
  return gameReducer(state, action, true, false, false, false, metadata);
}

/**
 * Card deduction is incremental, so its result must match a full recalculation from the clues on
 * the table.
 */
function expectFullyDeduced(state: GameState, metadata: GameMetadata) {
  const full = recalculateDeductions(state.deck, state.hands, [], metadata);
  for (const [order, card] of state.deck.entries()) {
    const fullCard = full[order];
    assertDefined(
      fullCard,
      `Failed to find the card in the deck at index: ${order}`,
    );
    expect(card.possibleCards).toEqual(fullCard.possibleCards);
    expect(card.possibleCardsForEmpathy).toEqual(
      fullCard.possibleCardsForEmpathy,
    );
  }
}

describe("card deduction", () => {
  const SEATS = [0, 1, 2] as const;

  function getMetadataForSeat(
    ourPlayerIndex: (typeof SEATS)[number],
  ): GameMetadata {
    return {
      ...getDefaultMetadata(NUM_PLAYERS),
      ourUsername: DEFAULT_PLAYER_NAMES[ourPlayerIndex],
      ourPlayerIndex,
    };
  }

  /**
   * Player `p` holds the 1 to 5 of suit `p`, in card orders `p * 5` to `p * 5 + 4`. The cards that
   * we draw ourselves carry no identity.
   */
  function getDealActions(ourPlayerIndex: PlayerIndex): readonly GameAction[] {
    const actions: GameAction[] = [];
    for (const playerIndex of SEATS) {
      for (const rank of [1, 2, 3, 4, 5] as const) {
        const order = playerIndex * 5 + rank - 1;
        actions.push(
          playerIndex === ourPlayerIndex
            ? draw(playerIndex, order)
            : draw(playerIndex, order, playerIndex, rank),
        );
      }
    }
    return actions;
  }

  function deal(metadata: GameMetadata): GameState {
    let state = getInitialGameState(metadata);
    for (const action of getDealActions(metadata.ourPlayerIndex)) {
      state = applyAction(state, action, metadata);
    }
    return state;
  }

  test.each(SEATS)(
    "the deal applies what we can see from seat %i",
    (ourPlayerIndex) => {
      const metadata = getMetadataForSeat(ourPlayerIndex);
      const state = deal(metadata);
      const hand = state.hands[ourPlayerIndex];
      assertDefined(
        hand,
        `Failed to find the hand at index: ${ourPlayerIndex}`,
      );
      for (const order of hand) {
        const card = state.deck[order];
        assertDefined(
          card,
          `Failed to find the card in the deck at index: ${order}`,
        );
        for (const otherPlayerIndex of SEATS) {
          if (otherPlayerIndex === ourPlayerIndex) {
            continue;
          }
          // We can see the only copy of the 5 of each other player's suit.
          expect(card.possibleCards).not.toContainEqual([otherPlayerIndex, 5]);
        }
        // We hold the only 5 of our own suit and cannot see it.
        expect(card.possibleCards).toContainEqual([ourPlayerIndex, 5]);
      }
    },
  );

  test.each(SEATS)(
    "incremental deduction equals a full recalculation from seat %i",
    (ourPlayerIndex) => {
      const metadata = getMetadataForSeat(ourPlayerIndex);
      let state = getInitialGameState(metadata);

      // The deal.
      for (const action of getDealActions(ourPlayerIndex)) {
        state = applyAction(state, action, metadata);
        expectFullyDeduced(state, metadata);
      }

      // Player 0 plays their red 1 and draws a blue 5 (the first-turn replacement draw).
      state = applyAction(state, play(0, 0, 0, 1), metadata);
      expectFullyDeduced(state, metadata);
      state = applyAction(
        state,
        ourPlayerIndex === 0 ? draw(0, 15) : draw(0, 15, 3, 5),
        metadata,
      );
      expectFullyDeduced(state, metadata);

      // Player 1 gives a rank 5 clue to player 2, touching order 14.
      state = applyAction(state, rankClue(5, 1, [14], 2), metadata);
      expectFullyDeduced(state, metadata);

      // Player 2 discards their green 1 and draws a purple 5.
      state = applyAction(state, discard(2, 10, 2, 1, false), metadata);
      expectFullyDeduced(state, metadata);
      state = applyAction(
        state,
        ourPlayerIndex === 2 ? draw(2, 16) : draw(2, 16, 4, 5),
        metadata,
      );
      expectFullyDeduced(state, metadata);

      // Player 0 gives a color clue for suit 1 to player 1, touching orders 5 to 9.
      state = applyAction(state, colorClue(1, 0, [5, 6, 7, 8, 9], 1), metadata);
      expectFullyDeduced(state, metadata);

      // Player 1 plays their yellow 1 and draws a blue 1.
      state = applyAction(state, play(1, 5, 1, 1), metadata);
      expectFullyDeduced(state, metadata);
      state = applyAction(
        state,
        ourPlayerIndex === 1 ? draw(1, 17) : draw(1, 17, 3, 1),
        metadata,
      );
      expectFullyDeduced(state, metadata);
    },
  );
});
