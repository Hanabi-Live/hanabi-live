/* eslint-disable unicorn/no-null */

import { possibleCardsFromNoteAndClues } from "./cardPresentation";
import { ClueType } from "./enums/ClueType";
import { assertDefined } from "complete-common";
import type { CardIdentity } from "./interfaces/CardIdentity";
import type { CardNote } from "./interfaces/CardNote";
import type { CardState } from "./interfaces/CardState";
import type { GameMetadata } from "./interfaces/GameMetadata";
import type { GameState } from "./interfaces/GameState";
import type { Variant } from "./interfaces/Variant";
import { getNextPlayableRanks } from "./rules/playStacks";
import { isCardTouchedByClue, msgClueToClue } from "./rules/clues";
import type { CardOrder } from "./types/CardOrder";
import type { ColorIndex } from "./types/ColorIndex";
import type { GameAction } from "./types/gameActions";
import type { MsgClue } from "./types/MsgClue";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { RankClueNumber } from "./types/RankClueNumber";
import type { SuitRankTuple } from "./types/SuitRankTuple";
import type { SuitIndex } from "./types/SuitIndex";

export type HypotheticalActionIntent =
  | { readonly type: "play"; readonly order: CardOrder }
  | { readonly type: "discard"; readonly order: CardOrder }
  | {
      readonly type: "colorClue";
      readonly target: PlayerIndex;
      readonly value: ColorIndex;
    }
  | {
      readonly type: "rankClue";
      readonly target: PlayerIndex;
      readonly value: RankClueNumber;
    };

/** Plain data from a card view needed to reproduce its hypothetical behavior. */
export interface HypotheticalCardView {
  readonly state: CardState;
  readonly isStackBase: boolean;
  readonly visibleSuitIndex: SuitIndex | null;
  readonly visibleRank: CardState["rank"];
}

/** A UI independent representation of a card while planning a hypothetical action. */
export interface HypotheticalCard {
  readonly order: CardOrder;
  readonly identity: CardIdentity;
  readonly possibilities: readonly SuitRankTuple[];
  readonly visibleSuitIndex: SuitIndex | null;
  readonly visibleRank: CardState["rank"];
}

export interface HypotheticalCardInput extends HypotheticalCardView {
  readonly identity: CardIdentity;
  readonly morphedIdentity: CardIdentity | undefined;
  readonly note: CardNote;
  readonly playing: boolean;
}

/** Reproduces HanabiCard's identity and possibility semantics using only game data. */
export function getHypotheticalCard(
  input: HypotheticalCardInput,
): HypotheticalCard {
  const {
    state,
    identity,
    morphedIdentity,
    note,
    playing,
    isStackBase,
    visibleSuitIndex,
    visibleRank,
  } = input;

  let morphedCardIdentity: CardIdentity;
  if (morphedIdentity === undefined) {
    const noteAndCluePossibilities = possibleCardsFromNoteAndClues(
      note,
      state,
    );
    if (playing && noteAndCluePossibilities.length === 1) {
      const possibility = noteAndCluePossibilities[0];
      assertDefined(possibility, "Expected one note and clue possibility.");
      const [suitIndex, rank] = possibility;
      morphedCardIdentity = { suitIndex, rank };
    } else if (isStackBase) {
      morphedCardIdentity = {
        suitIndex: state.suitIndex,
        rank: state.rank,
      };
    } else {
      morphedCardIdentity = identity;
    }
  } else {
    morphedCardIdentity = morphedIdentity;
  }

  if (
    morphedCardIdentity.suitIndex !== null
    && morphedCardIdentity.rank !== null
  ) {
    return {
      order: state.order,
      identity: morphedCardIdentity,
      possibilities: [[
        morphedCardIdentity.suitIndex,
        morphedCardIdentity.rank,
      ]],
      visibleSuitIndex,
      visibleRank,
    };
  }

  const possibleCardsWithoutObservation = playing
    ? possibleCardsFromNoteAndClues(note, state)
    : state.possibleCardsFromClues;
  const possibilities = possibleCardsWithoutObservation.filter(
    ([suitIndexA, rankA]) =>
      state.possibleCards.some(
        ([suitIndexB, rankB]) =>
          suitIndexA === suitIndexB && rankA === rankB,
      ),
  );

  return {
    order: state.order,
    identity: morphedCardIdentity,
    possibilities,
    visibleSuitIndex,
    visibleRank,
  };
}

/** Calculates hypothetical clue touches, including the current visibility rule. */
export function getHypotheticalTouchedCards(
  cards: readonly HypotheticalCard[],
  clue: MsgClue,
  variant: Variant,
): readonly CardOrder[] {
  const fullClue = msgClueToClue(clue, variant);
  const touchedCards: CardOrder[] = [];

  for (const card of cards) {
    const { suitIndex, rank } = card.identity;
    if (suitIndex === null && rank === null) {
      // Blank morphs are never touched, even when their underlying possibilities match.
      continue;
    }

    if (
      card.possibilities.every(([possibleSuitIndex, possibleRank]) =>
        isCardTouchedByClue(
          variant,
          fullClue,
          possibleSuitIndex,
          possibleRank,
        ),
      )
      && card.possibilities.every(() =>
        clue.type === ClueType.Rank
          ? card.visibleRank !== null
          : card.visibleSuitIndex !== null,
      )
    ) {
      touchedCards.push(card.order);
    }
  }

  return touchedCards;
}

export interface PlanHypotheticalActionContext {
  readonly gameState: GameState;
  readonly metadata: GameMetadata;
  readonly variant: Variant;
  readonly cardIdentities: readonly CardIdentity[];
  readonly morphedIdentities: ReadonlyArray<CardIdentity | undefined>;
  readonly notes: readonly CardNote[];
  readonly playing: boolean;
  readonly cardViews: readonly HypotheticalCardView[];
}

/** Returns the game actions for a hypothetical intent, or null when it cannot be planned. */
export function planHypotheticalAction(
  intent: HypotheticalActionIntent,
  context: PlanHypotheticalActionContext,
): readonly GameAction[] | null {
  const { gameState, metadata, variant } = context;
  const playerIndex = gameState.turn.currentPlayerIndex;
  if (playerIndex === null) {
    return null;
  }

  function cardAt(order: CardOrder): HypotheticalCard | undefined {
    const view = context.cardViews.find((candidate) =>
      candidate.state.order === order,
    );
    const cardIdentity = context.cardIdentities[order];
    const note = context.notes[order];
    if (
      view === undefined
      || note === undefined
      || (cardIdentity === undefined && !view.isStackBase)
    ) {
      return undefined;
    }
    const identity =
      cardIdentity ?? { suitIndex: null, rank: null };
    return getHypotheticalCard({
      ...view,
      identity,
      morphedIdentity: context.morphedIdentities[order],
      note,
      playing: context.playing,
    });
  }

  const actions: GameAction[] = [];
  if (intent.type === "play" || intent.type === "discard") {
    const card = cardAt(intent.order);
    if (
      card === undefined
      || card.identity.suitIndex === null
      || card.identity.rank === null
    ) {
      return null;
    }

    const { suitIndex, rank } = card.identity;
    const suit = variant.suits[suitIndex];
    let actionType: "play" | "discard" = intent.type;
    if (suit?.inverted === true) {
      actionType = actionType === "play" ? "discard" : "play";
    }

    let failed = false;
    if (actionType === "play") {
      const playStack = gameState.playStacks[suitIndex];
      assertDefined(playStack, "Expected a play stack for the card suit.");
      const playStackDirection = gameState.playStackDirections[suitIndex];
      assertDefined(
        playStackDirection,
        "Expected a play stack direction for the card suit.",
      );
      const nextRanks = getNextPlayableRanks(
        suitIndex,
        playStack,
        playStackDirection,
        gameState.playStackStarts,
        variant,
        gameState.deck,
      );
      if (!nextRanks.includes(rank)) {
        actionType = "discard";
        failed = true;
      }
    }

    if (actionType === "play") {
      actions.push({
        type: "play",
        playerIndex,
        order: intent.order,
        suitIndex,
        rank,
      });
    } else {
      actions.push({
        type: "discard",
        playerIndex,
        order: intent.order,
        suitIndex,
        rank,
        failed,
      });
    }

    if (failed) {
      actions.push({
        type: "strike",
        num: (gameState.strikes.length + 1) as 1 | 2 | 3,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        turn: gameState.turn.segment!,
        order: intent.order,
      });
    }

    if (gameState.deck.length < context.cardIdentities.length) {
      const nextCardOrder = gameState.deck.length as CardOrder;
      const nextCard = context.cardIdentities[nextCardOrder];
      actions.push({
        type: "draw",
        order: nextCardOrder,
        playerIndex,
        suitIndex: nextCard?.suitIndex ?? -1,
        rank: nextCard?.rank ?? -1,
      });
    }
  } else {
    const clue: MsgClue =
      intent.type === "colorClue"
        ? { type: ClueType.Color, value: intent.value }
        : { type: ClueType.Rank, value: intent.value };
    const targetCards: HypotheticalCard[] = [];
    const targetHand = gameState.hands[intent.target];
    assertDefined(targetHand, "Expected a hand for the clue target.");
    for (const order of targetHand) {
      const card = cardAt(order);
      if (card === undefined) {
        return null;
      }
      targetCards.push(card);
    }
    actions.push({
      type: "clue",
      clue,
      giver: playerIndex,
      list: getHypotheticalTouchedCards(targetCards, clue, variant),
      target: intent.target,
      ignoreNegative: false,
    });
  }

  let nextPlayerIndex = playerIndex + 1;
  if (nextPlayerIndex === metadata.options.numPlayers) {
    nextPlayerIndex = 0;
  }
  actions.push({
    type: "turn",
    num: gameState.turn.turnNum + 1,
    currentPlayerIndex: nextPlayerIndex as PlayerIndex,
  });

  return actions;
}
