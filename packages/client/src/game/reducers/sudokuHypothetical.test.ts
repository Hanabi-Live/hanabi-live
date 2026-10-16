import type {
  CardIdentity,
  CardOrder,
  CardState,
  GameState,
  PlanHypotheticalActionContext,
} from "@hanabi-live/game";
import {
  getVariant,
  hypotheticalStateReducer,
  initializeHypotheticalState,
  planHypotheticalAction,
} from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { assertDefined, assertNotNull } from "complete-common";
import { loadGameJSON } from "../../../test/loadGameJSON";
import sudokuGame from "../../../test_data/sudoku_hypothetical_1663033.json";
import { initialState } from "./initialStates/initialState";

const replay = loadGameJSON(sudokuGame);
const { metadata } = replay;
const variant = getVariant(metadata.options.variantName);
const notes = initialState(metadata).notes.ourNotes;
const cardIdentities = sudokuGame.deck as unknown as readonly CardIdentity[];

function expectConsistentCollections(state: GameState) {
  const locations = [
    ...state.hands.flat(),
    ...state.playStacks.flat(),
    ...state.discardStacks.flat(),
    ...state.hole,
  ];
  expect(new Set(locations).size).toBe(locations.length);

  for (const [player, hand] of state.hands.entries()) {
    for (const order of hand) {
      expect(state.deck[order]?.location).toBe(player);
    }
  }
  for (const stack of state.playStacks) {
    for (const order of stack) {
      expect(state.deck[order]?.location).toBe("playStack");
    }
  }
  for (const stack of state.discardStacks) {
    for (const order of stack) {
      expect(state.deck[order]?.location).toBe("discard");
    }
  }
  for (const order of state.hole) {
    expect(state.deck[order]?.location).toBe("hole");
  }
}

describe("Sudoku hypothetical from public game 1663033 (issue #3040)", () => {
  test("reconstructs the hand at the reported replay segment", () => {
    const gameState = replay.replay.states[60];
    assertDefined(gameState, "Missing replay segment 60.");
    expect(metadata.options.variantName).toBe("Sudoku (5 Suits)");
    expect(gameState.turn.currentPlayerIndex).toBe(0);
    expect(gameState.hands[0]).toEqual([30, 38, 42, 44, 47]);
  });

  test.each([59, 60, 61])(
    "keeps collections consistent after hypothetical plays and discards at segment %i",
    (segment) => {
      const gameState = replay.replay.states[segment];
      assertDefined(gameState, `Missing replay segment ${segment}.`);
      const playerIndex = gameState.turn.currentPlayerIndex;
      assertNotNull(
        playerIndex,
        `Missing current player at segment ${segment}.`,
      );

      const hand = gameState.hands[playerIndex];
      assertDefined(hand, `Missing hand at segment ${segment}.`);

      for (const order of hand) {
        for (const type of ["play", "discard"] as const) {
          const card: CardState | undefined = gameState.deck[order];
          assertDefined(card, `Missing card ${order}.`);
          const context: PlanHypotheticalActionContext = {
            gameState,
            metadata,
            variant,
            cardIdentities,
            morphedIdentities: [],
            notes,
            playing: false,
            cardViews: [
              {
                state: card,
                isStackBase: false,
                visibleSuitIndex: null,
                visibleRank: null,
              },
            ],
          };
          const actions = planHypotheticalAction({ type, order }, context);
          assertNotNull(actions, "Failed to plan a hand action.");

          let hypothetical = initializeHypotheticalState(
            gameState,
            false,
            [],
            true,
            metadata,
          );
          for (const action of actions) {
            hypothetical = hypotheticalStateReducer(
              hypothetical,
              action,
              true,
              metadata,
            );
            expectConsistentCollections(hypothetical.ongoing);
          }
          expect(hypothetical.ongoing.turn.turnNum).toBe(
            gameState.turn.turnNum + 1,
          );
        }
      }
    },
  );
  test("rejects a deck card already drawn to the other player's hand", () => {
    const gameState = replay.replay.states[59];
    assertDefined(gameState, "Missing replay segment 59.");
    let hypothetical = initializeHypotheticalState(
      gameState,
      false,
      [],
      true,
      metadata,
    );

    const intents = [
      { type: "colorClue", target: 0, value: 3 },
      { type: "colorClue", target: 1, value: 1 },
      { type: "rankClue", target: 0, value: 4 },
      { type: "colorClue", target: 1, value: 0 },
      { type: "play", order: 6 as CardOrder },
      { type: "play", order: 47 as CardOrder },
    ] as const;

    for (const intent of intents) {
      const { ongoing } = hypothetical;
      const orders =
        intent.type === "play" ? [intent.order] : ongoing.hands[intent.target];
      const cardViews = orders.map((order) => {
        const state: CardState | undefined = ongoing.deck[order];
        const identity = cardIdentities[order];
        assertDefined(state, `Missing card ${order}.`);
        assertDefined(identity, `Missing identity ${order}.`);
        return {
          state,
          isStackBase: false,
          visibleSuitIndex: identity.suitIndex,
          visibleRank: identity.rank,
        };
      });

      const planned = planHypotheticalAction(intent, {
        gameState: ongoing,
        metadata,
        variant,
        cardIdentities,
        morphedIdentities: hypothetical.morphedIdentities,
        notes,
        playing: false,
        cardViews,
      });
      assertNotNull(planned, "Failed to plan a replay action.");
      for (const action of planned) {
        hypothetical = hypotheticalStateReducer(
          hypothetical,
          action,
          true,
          metadata,
        );
        expectConsistentCollections(hypothetical.ongoing);
      }
    }

    const after = hypothetical.ongoing;
    expect(after.cardsRemainingInTheDeck).toBe(0);
    expect(after.turn.currentPlayerIndex).toBe(1);
    expect(after.hands[0]).toContain(49);
    expect(after.hands[1]).not.toContain(49);

    // Replaying card 49 from another hand would duplicate it in the UI.
    const card = after.deck[49];
    assertDefined(card, "Missing the final card.");
    const morphedIdentities: Array<CardIdentity | undefined> = [];
    morphedIdentities[49] = { suitIndex: 0, rank: 4 };
    const invalidPlan = planHypotheticalAction(
      { type: "play", order: 49 as CardOrder },
      {
        gameState: after,
        metadata,
        variant,
        cardIdentities,
        morphedIdentities,
        notes,
        playing: false,
        cardViews: [
          {
            state: card,
            isStackBase: false,
            visibleSuitIndex: null,
            visibleRank: null,
          },
        ],
      },
    );
    expect(invalidPlan).toBeNull();
  });
});
