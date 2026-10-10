/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, expect, test } from "@jest/globals";
import { ClueType } from "./enums/ClueType";
import { StackDirection } from "./enums/StackDirection";
import { getDefaultVariant, getVariant, VARIANT_NAMES } from "./gameData";
import type {
  HypotheticalCardInput,
  HypotheticalCardView,
  PlanHypotheticalActionContext,
} from "./hypotheticalPlanning";
import {
  getHypotheticalCard,
  getHypotheticalTouchedCards,
  planHypotheticalAction,
} from "./hypotheticalPlanning";
import type { CardNote } from "./interfaces/CardNote";
import type { CardState } from "./interfaces/CardState";
import type { GameState } from "./interfaces/GameState";
import type { Variant } from "./interfaces/Variant";
import { getDefaultMetadata } from "./metadata";
import { gameReducer } from "./reducers/gameReducer";
import { getInitialCardState } from "./reducers/initialStates/initialCardState";
import { getInitialGameStateTest } from "./reducers/initialStates/initialGameStateTest";
import type { CardOrder } from "./types/CardOrder";
import type { ColorIndex } from "./types/ColorIndex";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { RankClueNumber } from "./types/RankClueNumber";
import type { SuitIndex } from "./types/SuitIndex";
import type { GameAction } from "./types/gameActions";

const variant = getDefaultVariant();
const metadata = getDefaultMetadata(2);
const emptyNote: CardNote = {
  possibilities: [],
  knownTrash: false,
  needsFix: false,
  questionMark: false,
  exclamationMark: false,
  chopMoved: false,
  finessed: false,
  discardPermission: false,
  blank: false,
  unclued: false,
  clued: false,
  text: "",
};

function makeContext(
  overrides: Partial<PlanHypotheticalActionContext> = {},
): PlanHypotheticalActionContext {
  const card0 = getInitialCardState(0 as CardOrder, variant, 2);
  const card1 = getInitialCardState(1 as CardOrder, variant, 2);
  const base = getInitialGameStateTest(metadata);
  const gameState: GameState = {
    ...base,
    turn: {
      ...base.turn,
      segment: 4,
      turnNum: 6,
      currentPlayerIndex: 0,
    },
    deck: [card0, card1],
    hands: [[0 as CardOrder], [1 as CardOrder]],
  };
  const context: PlanHypotheticalActionContext = {
    gameState,
    metadata,
    variant,
    cardIdentities: [
      { suitIndex: 0, rank: 1 },
      { suitIndex: null, rank: null },
    ],
    morphedIdentities: [],
    notes: [emptyNote, emptyNote],
    playing: true,
    cardViews: [view(card0, 1, 1), view(card1, null, null)],
  };
  return { ...context, ...overrides };
}

function view(
  state: CardState,
  visibleSuitIndex: SuitIndex | null,
  visibleRank: CardState["rank"],
): HypotheticalCardView {
  return { state, isStackBase: false, visibleSuitIndex, visibleRank };
}

function cardInput(
  overrides: Partial<HypotheticalCardInput> = {},
): HypotheticalCardInput {
  const state = getInitialCardState(0 as CardOrder, variant, 2);
  return {
    state,
    identity: { suitIndex: 0, rank: 1 },
    morphedIdentity: undefined,
    note: emptyNote,
    playing: true,
    isStackBase: false,
    visibleSuitIndex: 0,
    visibleRank: 1,
    ...overrides,
  };
}

function makeBottomDeckContext(
  testVariant: Variant = variant,
): PlanHypotheticalActionContext {
  const context = makeContext();
  const testMetadata = getDefaultMetadata(2, testVariant.name);
  const finalCard = getInitialCardState(2 as CardOrder, testVariant, 2);
  return {
    ...context,
    variant: testVariant,
    metadata: {
      ...testMetadata,
      options: { ...testMetadata.options, deckPlays: true },
    },
    gameState: {
      ...getInitialGameStateTest(testMetadata),
      turn: context.gameState.turn,
      deck: [0, 1].map((order) => ({
        ...getInitialCardState(order as CardOrder, testVariant, 2),
        location: order as PlayerIndex,
      })),
      hands: context.gameState.hands,
      cardsRemainingInTheDeck: 1,
    },
    cardIdentities: [...context.cardIdentities, { suitIndex: 0, rank: 1 }],
    notes: [...context.notes, emptyNote],
    cardViews: [...context.cardViews, view(finalCard, null, null)],
  };
}

function applyPlan(
  actions: readonly GameAction[] | null,
  context: PlanHypotheticalActionContext,
): GameState {
  expect(actions).not.toBeNull();
  let state = context.gameState;
  for (const action of actions!) {
    state = gameReducer(
      state,
      action,
      context.playing,
      false,
      false,
      true,
      context.metadata,
    );
  }
  return state;
}

describe("hypothetical planning", () => {
  test("draws the bottom card before a successful play", () => {
    const context = makeBottomDeckContext();
    const actions = planHypotheticalAction(
      { type: "play", order: 2 as CardOrder },
      context,
    );
    expect(actions).toEqual([
      { type: "draw", order: 2, playerIndex: 0, suitIndex: 0, rank: 1 },
      { type: "play", order: 2, playerIndex: 0, suitIndex: 0, rank: 1 },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[2]?.location).toBe("playStack");
    expect(state.playStacks[0]).toEqual([2]);
    expect(state.cardsRemainingInTheDeck).toBe(0);
    expect(state.turn.turnNum).toBe(7);
    expect(state.turn.currentPlayerIndex).toBe(1);
  });

  test("draws the bottom card before a failed discard and strike", () => {
    const base = makeBottomDeckContext();
    const context = {
      ...base,
      cardIdentities: [
        ...base.cardIdentities.slice(0, 2),
        { suitIndex: 0 as SuitIndex, rank: 2 as const },
      ],
    };
    const actions = planHypotheticalAction(
      { type: "play", order: 2 as CardOrder },
      context,
    );
    expect(actions).toEqual([
      { type: "draw", order: 2, playerIndex: 0, suitIndex: 0, rank: 2 },
      {
        type: "discard",
        order: 2,
        playerIndex: 0,
        suitIndex: 0,
        rank: 2,
        failed: true,
      },
      { type: "strike", num: 1, turn: 4, order: 2 },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[2]).toMatchObject({
      location: "discard",
      isMisplayed: true,
    });
    expect(state.discardStacks[0]).toEqual([2]);
    expect(state.strikes.map(({ order }) => order)).toEqual([2]);
    expect(state.cardsRemainingInTheDeck).toBe(0);
  });

  test("keeps normal hand play before the final draw", () => {
    const context = makeBottomDeckContext();
    const actions = planHypotheticalAction(
      { type: "play", order: 0 as CardOrder },
      context,
    );
    expect(actions?.map(({ type }) => type)).toEqual(["play", "draw", "turn"]);
    const state = applyPlan(actions, context);
    expect(state.hands[0]).toEqual([2]);
    expect(state.playStacks[0]).toEqual([0]);
    expect(state.cardsRemainingInTheDeck).toBe(0);
  });

  test.each(["play", "discard"] as const)(
    "draws before an inverted bottom-deck %s",
    (type) => {
      const invertedVariant = VARIANT_NAMES.map(getVariant).find((candidate) =>
        candidate.suits.some((suit) => suit.inverted),
      );
      expect(invertedVariant).toBeDefined();
      const suitIndex = invertedVariant!.suits.findIndex(
        (suit) => suit.inverted,
      );
      const base = makeBottomDeckContext(invertedVariant);
      const context = {
        ...base,
        cardIdentities: [
          ...base.cardIdentities.slice(0, 2),
          { suitIndex: suitIndex as SuitIndex, rank: 1 as const },
        ],
      };
      const actions = planHypotheticalAction(
        { type, order: 2 as CardOrder },
        context,
      );
      const invertedType = type === "play" ? "discard" : "play";
      expect(actions?.map((action) => action.type)).toEqual([
        "draw",
        invertedType,
        "turn",
      ]);
      expect(actions?.[1]).toMatchObject({
        type: invertedType,
        suitIndex,
        rank: 1,
      });
      const state = applyPlan(actions, context);
      expect(state.hands).toEqual(context.gameState.hands);
      expect(state.deck[2]?.location).toBe(
        invertedType === "play" ? "playStack" : "discard",
      );
      expect(state.strikes).toEqual([]);
      expect(state.cardsRemainingInTheDeck).toBe(0);
    },
  );

  test("preserves an unknown bottom draw identity when the played card is morphed", () => {
    const base = makeBottomDeckContext();
    const context = {
      ...base,
      cardIdentities: [
        ...base.cardIdentities.slice(0, 2),
        { suitIndex: null, rank: null },
      ],
      morphedIdentities: [
        undefined,
        undefined,
        { suitIndex: 0 as SuitIndex, rank: 1 as const },
      ],
    };
    const actions = planHypotheticalAction(
      { type: "play", order: 2 as CardOrder },
      context,
    );
    expect(actions?.[0]).toMatchObject({
      type: "draw",
      suitIndex: -1,
      rank: -1,
    });
    expect(actions?.[1]).toMatchObject({ type: "play", suitIndex: 0, rank: 1 });
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[2]?.location).toBe("playStack");
  });

  test("does not move the draw first when deck plays are disabled", () => {
    const base = makeBottomDeckContext();
    const context = {
      ...base,
      metadata: {
        ...base.metadata,
        options: { ...base.metadata.options, deckPlays: false },
      },
    };
    const actions = planHypotheticalAction(
      { type: "play", order: 2 as CardOrder },
      context,
    );
    expect(actions?.map(({ type }) => type)).toEqual(["play", "draw", "turn"]);
  });

  test.each([2, 3])(
    "does not treat future card order %s as the bottom card with two cards remaining",
    (order) => {
      const base = makeBottomDeckContext();
      const context = {
        ...base,
        cardIdentities: [
          ...base.cardIdentities,
          { suitIndex: 0 as SuitIndex, rank: 1 as const },
        ],
        notes: [...base.notes, emptyNote],
        cardViews: [
          ...base.cardViews,
          view(getInitialCardState(3 as CardOrder, variant, 2), null, null),
        ],
        gameState: { ...base.gameState, cardsRemainingInTheDeck: 2 },
      };
      const actions = planHypotheticalAction(
        { type: "play", order: order as CardOrder },
        context,
      );
      expect(actions?.map(({ type }) => type)).toEqual([
        "play",
        "draw",
        "turn",
      ]);
      expect(actions?.[1]).toMatchObject({ type: "draw", order: 2 });
    },
  );

  test("plans a successful play", () => {
    const actions = planHypotheticalAction(
      { type: "play", order: 0 as CardOrder },
      makeContext(),
    );
    expect(actions?.map(({ type }) => type)).toEqual(["play", "turn"]);
  });

  test("plans a discard", () => {
    const actions = planHypotheticalAction(
      { type: "discard", order: 0 as CardOrder },
      makeContext(),
    );
    expect(actions?.[0]).toMatchObject({ type: "discard", failed: false });
  });

  test("inverts play and discard for inverted suits", () => {
    const invertedVariant = VARIANT_NAMES.map(getVariant).find((candidate) =>
      candidate.suits.some((suit) => suit.inverted),
    );
    expect(invertedVariant).toBeDefined();
    const suitIndex = invertedVariant!.suits.findIndex((suit) => suit.inverted);
    const context = makeContext({
      variant: invertedVariant!,
      metadata: getDefaultMetadata(2, invertedVariant!.name),
      cardIdentities: [{ suitIndex: suitIndex as SuitIndex, rank: 1 }],
      gameState: {
        ...makeContext().gameState,
        playStacks: invertedVariant!.suits.map(
          () => [],
        ) as unknown as GameState["playStacks"],
        playStackDirections: invertedVariant!.suits.map(
          () => StackDirection.Up,
        ) as unknown as GameState["playStackDirections"],
        playStackStarts: invertedVariant!.suits.map(
          () => null,
        ) as unknown as GameState["playStackStarts"],
      },
    });
    expect(
      planHypotheticalAction(
        { type: "play", order: 0 as CardOrder },
        context,
      )?.[0]?.type,
    ).toBe("discard");
    expect(
      planHypotheticalAction(
        { type: "discard", order: 0 as CardOrder },
        context,
      )?.[0]?.type,
    ).toBe("play");
  });

  test("turns a misplay into a failed discard and strike", () => {
    const actions = planHypotheticalAction(
      { type: "play", order: 0 as CardOrder },
      makeContext({
        cardIdentities: [{ suitIndex: 0, rank: 2 }],
      }),
    );
    expect(actions?.slice(0, 2)).toEqual([
      {
        type: "discard",
        playerIndex: 0,
        order: 0,
        suitIndex: 0,
        rank: 2,
        failed: true,
      },
      { type: "strike", num: 1, turn: 4, order: 0 },
    ]);
  });

  test("generates a draw with known or unknown identity", () => {
    const context = makeContext({
      gameState: {
        ...makeContext().gameState,
        deck: [getInitialCardState(0 as CardOrder, variant, 2)],
      },
      cardIdentities: [
        { suitIndex: 0, rank: 1 },
        { suitIndex: 1, rank: 2 },
      ],
    });
    const known = planHypotheticalAction(
      { type: "discard", order: 0 as CardOrder },
      context,
    );
    expect(known?.[1]).toMatchObject({
      type: "draw",
      order: 1,
      suitIndex: 1,
      rank: 2,
    });

    const unknown = planHypotheticalAction(
      { type: "discard", order: 0 as CardOrder },
      makeContext({
        gameState: {
          ...makeContext().gameState,
          deck: [getInitialCardState(0 as CardOrder, variant, 2)],
        },
        cardIdentities: [
          { suitIndex: 0, rank: 1 },
          { suitIndex: null, rank: null },
        ],
      }),
    );
    expect(unknown?.[1]).toMatchObject({
      type: "draw",
      order: 1,
      suitIndex: -1,
      rank: -1,
    });
  });

  test("rejects play or discard when the identity is unknown", () => {
    expect(
      planHypotheticalAction(
        { type: "play", order: 0 as CardOrder },
        makeContext({
          cardIdentities: [{ suitIndex: null, rank: null }],
          notes: [emptyNote],
        }),
      ),
    ).toBeNull();
  });

  test("uses the card state for stack base identities", () => {
    const context = makeContext();
    const stackBaseState = {
      ...context.cardViews[0]!.state,
      suitIndex: 1 as SuitIndex,
      rank: 1 as CardState["rank"],
    };
    const actions = planHypotheticalAction(
      { type: "play", order: 0 as CardOrder },
      {
        ...context,
        cardIdentities: [],
        cardViews: [
          {
            ...context.cardViews[0]!,
            state: stackBaseState,
            isStackBase: true,
          },
        ],
      },
    );
    expect(actions?.[0]).toMatchObject({
      type: "play",
      order: 0,
      suitIndex: 1,
      rank: 1,
    });
  });

  test("plans color and rank clues with MsgClue values", () => {
    const colorIndex = variant.clueColors.findIndex((color) =>
      variant.suits[0]!.clueColors.some(
        (suitColor) => suitColor.name === color.name,
      ),
    ) as ColorIndex;
    const colorActions = planHypotheticalAction(
      { type: "colorClue", target: 1 as PlayerIndex, value: colorIndex },
      makeContext(),
    );
    expect(colorActions?.[0]).toMatchObject({
      type: "clue",
      clue: { type: ClueType.Color, value: colorIndex },
      giver: 0,
      target: 1,
    });
    const rankActions = planHypotheticalAction(
      {
        type: "rankClue",
        target: 1 as PlayerIndex,
        value: 1 as RankClueNumber,
      },
      makeContext(),
    );
    expect(rankActions?.[0]).toMatchObject({
      type: "clue",
      clue: { type: ClueType.Rank, value: 1 },
    });
  });

  test("calculates touches from all possibilities and visibility", () => {
    const touchedCard = getHypotheticalCard(
      cardInput({
        state: {
          ...getInitialCardState(0 as CardOrder, variant, 2),
          possibleCardsFromClues: [
            [0, 1],
            [0, 2],
          ],
          possibleCards: [
            [0, 1],
            [0, 2],
          ],
        },
        identity: { suitIndex: null, rank: null },
      }),
    );
    const clue = { type: ClueType.Rank, value: 1 as RankClueNumber };
    expect(getHypotheticalTouchedCards([touchedCard], clue, variant)).toEqual(
      [],
    );
    const allTouched = getHypotheticalCard(
      cardInput({
        state: {
          ...getInitialCardState(0 as CardOrder, variant, 2),
          possibleCardsFromClues: [
            [0, 1],
            [0, 2],
          ],
          possibleCards: [
            [0, 1],
            [0, 2],
          ],
        },
        visibleRank: 1,
      }),
    );
    expect(getHypotheticalTouchedCards([allTouched], clue, variant)).toEqual([
      0,
    ]);

    const noPossibilities = getHypotheticalCard(
      cardInput({
        state: {
          ...getInitialCardState(0 as CardOrder, variant, 2),
          possibleCardsFromClues: [[0, 1]],
          possibleCards: [],
        },
        morphedIdentity: { suitIndex: 0 as SuitIndex, rank: null },
        visibleRank: null,
      }),
    );
    // The client used `every` for both visibility and clue matching, so an empty list is touched.
    expect(
      getHypotheticalTouchedCards([noPossibilities], clue, variant),
    ).toEqual([0]);
  });

  test("does not touch a blank morph", () => {
    const blank = getHypotheticalCard(
      cardInput({ morphedIdentity: { suitIndex: null, rank: null } }),
    );
    expect(
      getHypotheticalTouchedCards(
        [blank],
        { type: ClueType.Rank, value: 1 as RankClueNumber },
        variant,
      ),
    ).toEqual([]);
  });

  test("preserves partial morphs and intersects notes with clue possibilities", () => {
    const state = {
      ...getInitialCardState(0 as CardOrder, variant, 2),
      possibleCardsFromClues: [
        [0, 1],
        [0, 2],
      ] as const,
      possibleCards: [
        [0, 1],
        [0, 2],
      ] as const,
    };
    const partial = getHypotheticalCard(
      cardInput({
        state,
        morphedIdentity: { suitIndex: 0 as SuitIndex, rank: null },
      }),
    );
    expect(partial.identity).toEqual({ suitIndex: 0, rank: null });
    expect(partial.possibilities).toEqual([
      [0, 1],
      [0, 2],
    ]);

    const singleton = getHypotheticalCard(
      cardInput({
        state,
        identity: { suitIndex: null, rank: null },
        note: {
          ...emptyNote,
          possibilities: [
            [0, 1],
            [0, 3],
          ],
        },
      }),
    );
    expect(singleton.identity).toEqual({ suitIndex: 0, rank: 1 });
    expect(singleton.possibilities).toEqual([[0, 1]]);
  });

  test("adds the next player's final turn action", () => {
    const actions = planHypotheticalAction(
      { type: "discard", order: 0 as CardOrder },
      makeContext(),
    );
    expect(actions?.at(-1)).toEqual({
      type: "turn",
      num: 7,
      currentPlayerIndex: 1,
    });
  });

  test("wraps the final turn action to player zero", () => {
    const context = makeContext();
    const actions = planHypotheticalAction(
      { type: "discard", order: 0 as CardOrder },
      {
        ...context,
        gameState: {
          ...context.gameState,
          turn: {
            ...context.gameState.turn,
            currentPlayerIndex: 1,
          },
        },
      },
    );
    expect(actions?.at(-1)).toMatchObject({
      type: "turn",
      currentPlayerIndex: 0,
    });
  });

  test("returns no plan when the current player is null", () => {
    const context = makeContext();
    expect(
      planHypotheticalAction(
        { type: "discard", order: 0 as CardOrder },
        {
          ...context,
          gameState: {
            ...context.gameState,
            turn: { ...context.gameState.turn, currentPlayerIndex: null },
          },
        },
      ),
    ).toBeNull();
  });
});
