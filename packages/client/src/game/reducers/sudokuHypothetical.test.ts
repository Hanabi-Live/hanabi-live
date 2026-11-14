import type {
  CardIdentity,
  CardOrder,
  CardState,
  GameState,
  PlanHypotheticalActionContext,
} from "@hanabi-live/game";
import {
  getVariantById,
  hypotheticalStateReducer,
  initializeHypotheticalState,
  planHypotheticalAction,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { describe, expect, test } from "vitest";
import { loadGameJson } from "../../../test/loadGameJson.ts";
import sudokuGame from "../../../test_data/sudoku_hypothetical_1663033.json";
import { initialState } from "./initialStates/initialState.ts";

const replay = loadGameJson(sudokuGame);
const { metadata } = replay;
const variant = getVariantById(metadata.options.variantId);
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
      expect(state.deck[order]?.location).toBe<unknown>(player);
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
    expect(state.deck[order]?.location).toBe<unknown>("hole");
  }
}

describe("Sudoku hypothetical from public game 1663033 (issue #3040)", () => {
  test("reconstructs the hand at the reported replay segment", () => {
    const gameState = replay.replay.states[60];
    assertDefined(gameState, "Missing replay segment: 60");
    expect(variant.name).toBe("Sudoku (5 Suits)");
    expect(gameState.turn.currentPlayerIndex).toBe(0);
    expect(gameState.hands[0]).toEqual<unknown>([30, 38, 42, 44, 47]);
  });

  test.each([59, 60, 61])(
    "keeps collections consistent after hypothetical plays and discards at segment %i",
    (segment) => {
      const gameState = replay.replay.states[segment];
      assertDefined(gameState, `Missing replay segment: ${segment}`);
      const playerIndex = gameState.turn.currentPlayerIndex;
      assertDefined(
        playerIndex,
        `Missing current player at segment: ${segment}`,
      );

      const hand = gameState.hands[playerIndex];
      assertDefined(hand, `Missing hand at segment: ${segment}`);

      for (const order of hand) {
        for (const type of ["play", "discard"] as const) {
          const card: CardState | undefined = gameState.deck[order];
          assertDefined(card, `Missing card: ${order}`);
          const context: PlanHypotheticalActionContext = {
            gameState,
            metadata,
            variant,
            cardIdentities,
            morphedIdentities: [],
            showDrawnCards: true,
            startingPlayerIndex: undefined,
            notes,
            playing: false,
            cardViews: [
              {
                state: card,
                isStackBase: false,
                visibleSuitIndex: undefined,
                visibleRank: undefined,
              },
            ],
          };
          const actions = planHypotheticalAction(
            {
              type,
              order,
            },
            context,
          );
          assertDefined(actions, "Failed to plan a hand action.");

          let hypothetical = initializeHypotheticalState(
            gameState,
            false,
            [],
            metadata,
          );
          for (const action of actions) {
            hypothetical = hypotheticalStateReducer(
              hypothetical,
              action,
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
    assertDefined(gameState, "Missing replay segment: 59");
    let hypothetical = initializeHypotheticalState(
      gameState,
      false,
      [],
      metadata,
    );

    const intents = [
      {
        type: "clue",
        receiverIndex: 0,
        clue: {
          type: "color",
          color: 3,
        },
      },
      {
        type: "clue",
        receiverIndex: 1,
        clue: {
          type: "color",
          color: 1,
        },
      },
      {
        type: "clue",
        receiverIndex: 0,
        clue: {
          type: "rank",
          rank: 4,
        },
      },
      {
        type: "clue",
        receiverIndex: 1,
        clue: {
          type: "color",
          color: 0,
        },
      },
      {
        type: "play",
        order: 6 as CardOrder,
      },
      {
        type: "play",
        order: 47 as CardOrder,
      },
    ] as const;

    for (const intent of intents) {
      const { ongoing } = hypothetical;
      const orders =
        intent.type === "play"
          ? [intent.order]
          : ongoing.hands[intent.receiverIndex];
      const cardViews = orders.map((order) => {
        const state: CardState | undefined = ongoing.deck[order];
        const identity = cardIdentities[order];
        assertDefined(state, `Missing card: ${order}`);
        assertDefined(identity, `Missing identity: ${order}`);
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
        showDrawnCards: hypothetical.showDrawnCards,
        startingPlayerIndex: hypothetical.startingPlayerIndex,
        notes,
        playing: false,
        cardViews,
      });
      assertDefined(planned, "Failed to plan a replay action.");
      for (const action of planned) {
        hypothetical = hypotheticalStateReducer(hypothetical, action, metadata);
        expectConsistentCollections(hypothetical.ongoing);
      }
    }

    const after = hypothetical.ongoing;
    expect(after.cardsRemainingInTheDeck).toBe(0);
    expect(after.turn.currentPlayerIndex).toBe(1);
    expect<readonly number[]>(after.hands[0]).toContain(49);
    expect<readonly number[]>(after.hands[1]).not.toContain(49);

    // Replaying card 49 from another hand would duplicate it in the UI.
    const card = after.deck[49];
    assertDefined(card, "Missing the final card.");
    const morphedIdentities: Array<CardIdentity | undefined> = [];
    morphedIdentities[49] = {
      suitIndex: 0,
      rank: 4,
    };
    const invalidPlan = planHypotheticalAction(
      {
        type: "play",
        order: 49 as CardOrder,
      },
      {
        gameState: after,
        metadata,
        variant,
        cardIdentities,
        morphedIdentities,
        showDrawnCards: true,
        startingPlayerIndex: undefined,
        notes,
        playing: false,
        cardViews: [
          {
            state: card,
            isStackBase: false,
            visibleSuitIndex: undefined,
            visibleRank: undefined,
          },
        ],
      },
    );
    expect(invalidPlan).toBeUndefined();
  });
});
