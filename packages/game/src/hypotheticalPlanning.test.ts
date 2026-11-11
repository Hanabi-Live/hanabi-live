/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { describe, expect, test } from "bun:test";
import { StackDirection } from "./enums/StackDirection.ts";
import { getDefaultVariant, getVariant, VARIANT_NAMES } from "./gameData.ts";
import { START_CARD_RANK } from "./generated/protocol.ts";
import type {
  HypotheticalCardInput,
  HypotheticalCardView,
  PlanHypotheticalActionContext,
} from "./hypotheticalPlanning.ts";
import {
  getHypotheticalCard,
  getHypotheticalTouchedCards,
  planHypotheticalAction,
} from "./hypotheticalPlanning.ts";
import type { CardIdentity } from "./interfaces/CardIdentity.ts";
import type { CardNote } from "./interfaces/CardNote.ts";
import type { CardState } from "./interfaces/CardState.ts";
import type { GameState } from "./interfaces/GameState.ts";
import type { Variant } from "./interfaces/Variant.ts";
import { getDefaultMetadata } from "./metadata.ts";
import { gameReducer } from "./reducers/gameReducer.ts";
import { getInitialCardState } from "./reducers/initialStates/initialCardState.ts";
import { getInitialGameStateTest } from "./reducers/initialStates/initialGameStateTest.ts";
import { getTotalCardsInDeck } from "./rules/deck.ts";
import type { CardOrder } from "./types/CardOrder.ts";
import type { ColorIndex } from "./types/ColorIndex.ts";
import type { PlayerIndex } from "./types/PlayerIndex.ts";
import type { RankClueNumber } from "./types/RankClueNumber.ts";
import type { SuitIndex } from "./types/SuitIndex.ts";
import type { GameAction } from "./types/gameActions.ts";

const variant = getDefaultVariant();
const metadata = getDefaultMetadata(2);
const emptyNote: CardNote = {
  possibilities: [],
  knownTrash: false,
  needsFix: false,
  questionMark: false,
  exclamationMark: false,
  spook: false,
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
      { suitIndex: undefined, rank: undefined },
    ],
    morphedIdentities: [],
    showDrawnCards: true,
    startingPlayerIndex: 0,
    notes: [emptyNote, emptyNote],
    playing: true,
    cardViews: [view(card0, 1, 1), view(card1, undefined, undefined)],
  };
  return { ...context, ...overrides };
}

function view(
  state: CardState,
  visibleSuitIndex: SuitIndex | undefined,
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
    cardViews: [...context.cardViews, view(finalCard, undefined, undefined)],
  };
}

function applyPlan(
  actions: readonly GameAction[] | undefined,
  context: PlanHypotheticalActionContext,
): GameState {
  expect(actions).not.toBeUndefined();
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
  test.each(["play", "discard"] as const)(
    "rejects a %s of another player's card",
    (type) => {
      const base = makeContext();
      const context: PlanHypotheticalActionContext = {
        ...base,
        cardIdentities: [base.cardIdentities[0]!, { suitIndex: 0, rank: 1 }],
      };
      expect(
        planHypotheticalAction({ type, order: 1 as CardOrder }, context),
      ).toBeUndefined();
    },
  );

  test("draws the bottom card before a successful play", () => {
    const context = makeBottomDeckContext();
    const actions = planHypotheticalAction(
      { type: "play", order: 2 as CardOrder },
      context,
    );
    expect(actions).toEqual<unknown>([
      {
        type: "draw",
        order: 2,
        playerIndex: 0,
        identity: { suitIndex: 0, rank: 1 },
      },
      {
        type: "play",
        order: 2,
        playerIndex: 0,
        identity: { suitIndex: 0, rank: 1 },
      },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[2]?.location).toBe("playStack");
    expect(state.playStacks[0]).toEqual<unknown>([2]);
    expect(state.cardsRemainingInTheDeck).toBe(0);
    expect(state.turn.turnNum).toBe(7);
    expect(state.turn.currentPlayerIndex).toBe(1);
  });

  test("draws the bottom card before a failed discard", () => {
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
    expect(actions).toEqual<unknown>([
      {
        type: "draw",
        order: 2,
        playerIndex: 0,
        identity: { suitIndex: 0, rank: 2 },
      },
      {
        type: "discard",
        order: 2,
        playerIndex: 0,
        identity: { suitIndex: 0, rank: 2 },
        failed: true,
      },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[2]).toMatchObject({
      location: "discard",
      isMisplayed: true,
    });
    expect(state.discardStacks[0]).toEqual<unknown>([2]);
    expect(state.strikes.map(({ order }) => order)).toEqual<unknown>([2]);
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
    expect(state.hands[0]).toEqual<unknown>([2]);
    expect(state.playStacks[0]).toEqual<unknown>([0]);
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
        identity: { suitIndex, rank: 1 },
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
        { suitIndex: undefined, rank: undefined },
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
    expect(actions?.[0]).toMatchObject({ type: "draw" });
    expect(actions?.[0]).not.toHaveProperty("identity");
    expect(actions?.[1]).toMatchObject({
      type: "play",
      identity: { suitIndex: 0, rank: 1 },
    });
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
          view(
            getInitialCardState(3 as CardOrder, variant, 2),
            undefined,
            undefined,
          ),
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
          () => undefined,
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

  test("turns a misplay into a failed discard", () => {
    const actions = planHypotheticalAction(
      { type: "play", order: 0 as CardOrder },
      makeContext({
        cardIdentities: [{ suitIndex: 0, rank: 2 }],
      }),
    );
    expect(actions?.slice(0, 1)).toEqual<unknown>([
      {
        type: "discard",
        playerIndex: 0,
        order: 0,
        identity: { suitIndex: 0, rank: 2 },
        failed: true,
      },
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
      identity: { suitIndex: 1, rank: 2 },
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
          { suitIndex: undefined, rank: undefined },
        ],
      }),
    );
    expect(unknown?.[1]).toMatchObject({ type: "draw", order: 1 });
    expect(unknown?.[1]).not.toHaveProperty("identity");
  });

  test("rejects play or discard when the identity is unknown", () => {
    expect(
      planHypotheticalAction(
        { type: "play", order: 0 as CardOrder },
        makeContext({
          cardIdentities: [{ suitIndex: undefined, rank: undefined }],
          notes: [emptyNote],
        }),
      ),
    ).toBeUndefined();
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
      identity: { suitIndex: 1, rank: 1 },
    });
  });

  test("plans color and rank clues with MsgClue values", () => {
    const colorIndex = variant.clueColors.findIndex((color) =>
      variant.suits[0]!.clueColors.some(
        (suitColor) => suitColor.name === color.name,
      ),
    ) as ColorIndex;
    const colorActions = planHypotheticalAction(
      {
        type: "clue",
        target: 1 as PlayerIndex,
        clue: { type: "color", value: colorIndex },
      },
      makeContext(),
    );
    expect(colorActions?.[0]).toMatchObject({
      type: "clue",
      clue: { type: "color", value: colorIndex },
      giver: 0,
      target: 1,
    });
    const rankActions = planHypotheticalAction(
      {
        type: "clue",
        target: 1 as PlayerIndex,
        clue: { type: "rank", value: 1 as RankClueNumber },
      },
      makeContext(),
    );
    expect(rankActions?.[0]).toMatchObject({
      type: "clue",
      clue: { type: "rank", value: 1 },
    });
  });

  test.each([
    { showDrawnCards: false, target: 0, ignoreNegative: true },
    { showDrawnCards: true, target: 0, ignoreNegative: false },
    { showDrawnCards: false, target: 1, ignoreNegative: false },
  ] as const)(
    "clue negatives with $showDrawnCards shown and target $target",
    ({ showDrawnCards, target, ignoreNegative }) => {
      const base = makeContext();
      const context: PlanHypotheticalActionContext = {
        ...base,
        showDrawnCards,
        gameState: {
          ...base.gameState,
          turn: {
            ...base.gameState.turn,
            currentPlayerIndex: (1 - target) as PlayerIndex,
          },
        },
      };
      const actions = planHypotheticalAction(
        {
          type: "clue",
          target: target as PlayerIndex,
          clue: { type: "rank", value: 3 as RankClueNumber },
        },
        context,
      );
      expect(actions?.[0]).toMatchObject({ type: "clue", ignoreNegative });
    },
  );

  test("passing the turn spends a clue without touching or logging a clue", () => {
    const context = makeContext();
    const state = applyPlan(
      planHypotheticalAction({ type: "passTurn" }, context),
      context,
    );
    expect(state.clueTokens).toBe(context.gameState.clueTokens - 1);
    expect(state.turn.currentPlayerIndex).toBe(1);
    expect(state.turn.segment).toBe(context.gameState.turn.segment! + 1);
    expect(state.clues).toEqual([]);
    expect(state.deck).toEqual(context.gameState.deck);
    expect(state.log.at(-1)?.text).toBe("[Hypo] Alice passes the turn");
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
        identity: { suitIndex: undefined, rank: undefined },
      }),
    );
    const clue = { type: "rank" as const, value: 1 as RankClueNumber };
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
    expect(
      getHypotheticalTouchedCards([allTouched], clue, variant),
    ).toEqual<unknown>([0]);

    const noPossibilities = getHypotheticalCard(
      cardInput({
        state: {
          ...getInitialCardState(0 as CardOrder, variant, 2),
          possibleCardsFromClues: [[0, 1]],
          possibleCards: [],
        },
        morphedIdentity: { suitIndex: 0 as SuitIndex, rank: undefined },
        visibleRank: undefined,
      }),
    );
    // The client used `every` for both visibility and clue matching, so an empty list is touched.
    expect(
      getHypotheticalTouchedCards([noPossibilities], clue, variant),
    ).toEqual<unknown>([0]);
  });

  test("does not touch a blank morph", () => {
    const blank = getHypotheticalCard(
      cardInput({ morphedIdentity: { suitIndex: undefined, rank: undefined } }),
    );
    expect(
      getHypotheticalTouchedCards(
        [blank],
        { type: "rank", value: 1 as RankClueNumber },
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
        morphedIdentity: { suitIndex: 0 as SuitIndex, rank: undefined },
      }),
    );
    expect(partial.identity).toEqual({ suitIndex: 0, rank: undefined });
    expect(partial.possibilities).toEqual([
      [0, 1],
      [0, 2],
    ]);

    const singleton = getHypotheticalCard(
      cardInput({
        state,
        identity: { suitIndex: undefined, rank: undefined },
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
          hands: [[1 as CardOrder], [0 as CardOrder]],
        },
      },
    );
    expect(actions?.at(-1)).toMatchObject({
      type: "turn",
      currentPlayerIndex: 0,
    });
  });

  test("returns no plan when the current player is undefined", () => {
    const context = makeContext();
    expect(
      planHypotheticalAction(
        { type: "discard", order: 0 as CardOrder },
        {
          ...context,
          gameState: {
            ...context.gameState,
            turn: { ...context.gameState.turn, currentPlayerIndex: undefined },
          },
        },
      ),
    ).toBeUndefined();
  });
});

/** Plans a play of a red 4 from player 0's hand, optionally morphing the red stack base first. */
function playRedFour(
  stackBaseMorph: CardIdentity | undefined,
  testVariant: Variant = variant,
) {
  const base =
    testVariant === variant
      ? makeContext()
      : makeBottomDeckContext(testVariant);
  const morphedIdentities: Array<CardIdentity | undefined> = [];
  if (stackBaseMorph !== undefined) {
    morphedIdentities[getTotalCardsInDeck(testVariant)] = stackBaseMorph;
  }
  const redFour = { suitIndex: 0 as SuitIndex, rank: 4 as const };
  return planHypotheticalAction(
    { type: "play", order: 0 as CardOrder },
    {
      ...base,
      cardIdentities: [redFour, ...base.cardIdentities.slice(1)],
      cardViews: [
        view(base.gameState.deck[0]!, 0, 4),
        ...base.cardViews.slice(1),
      ],
      morphedIdentities,
    },
  );
}

function isStrike(actions: readonly GameAction[] | undefined) {
  return (
    actions?.some((action) => action.type === "discard" && action.failed)
    === true
  );
}

describe("hypothetical plays on a morphed stack base", () => {
  test("plays the next rank after the morphed card", () => {
    const actions = playRedFour({ suitIndex: 0 as SuitIndex, rank: 3 });
    expect(actions?.[0]).toMatchObject({
      type: "play",
      order: 0,
      identity: { suitIndex: 0, rank: 4 },
    });
    expect(isStrike(actions)).toBe(false);
  });

  test("is a misplay without the morph", () => {
    expect(isStrike(playRedFour(undefined))).toBe(true);
  });

  test("ignores a stack base morphed into a card of another suit", () => {
    expect(isStrike(playRedFour({ suitIndex: 1 as SuitIndex, rank: 3 }))).toBe(
      true,
    );
  });

  test("treats a start card morph on an undecided stack like the played start card", () => {
    const upOrDown = VARIANT_NAMES.map(getVariant).find(
      (candidate) => candidate.upOrDown,
    );
    expect(upOrDown).toBeDefined();
    expect(isStrike(playRedFour(undefined, upOrDown))).toBe(true);
    expect(
      isStrike(
        playRedFour(
          { suitIndex: 0 as SuitIndex, rank: START_CARD_RANK },
          upOrDown,
        ),
      ),
    ).toBe(false);
  });
});

function playWithNote(
  morphedIdentity: CardIdentity | undefined,
  playing: boolean,
): readonly GameAction[] | undefined {
  // Our unknown card 0 has a note saying it is a red 1.
  const base = makeContext();
  return planHypotheticalAction(
    { type: "play", order: 0 as CardOrder },
    {
      ...base,
      playing,
      cardIdentities: [
        { suitIndex: undefined, rank: undefined },
        ...base.cardIdentities.slice(1),
      ],
      cardViews: [
        view(base.gameState.deck[0]!, undefined, undefined),
        ...base.cardViews.slice(1),
      ],
      notes: [
        { ...emptyNote, possibilities: [[0, 1]] },
        ...base.notes.slice(1),
      ],
      morphedIdentities: morphedIdentity === undefined ? [] : [morphedIdentity],
    },
  );
}

describe("hypothetical plays of hidden cards with a note", () => {
  const hidden = { suitIndex: undefined, rank: undefined };

  test("uses the note for a card hidden by a blank morph while playing", () => {
    expect(playWithNote(hidden, true)?.[0]).toMatchObject({
      type: "play",
      order: 0,
      identity: { suitIndex: 0, rank: 1 },
    });
  });

  test("ignores notes outside of an ongoing game", () => {
    expect(playWithNote(hidden, false)).toBeUndefined();
  });

  test("prefers a morph to a real identity over the note", () => {
    expect(
      playWithNote({ suitIndex: 1 as SuitIndex, rank: 3 }, true)?.[0],
    ).toMatchObject({ identity: { suitIndex: 1, rank: 3 } });
  });
});
