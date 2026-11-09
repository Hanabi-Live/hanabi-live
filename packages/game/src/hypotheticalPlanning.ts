/* eslint-disable unicorn/no-null */

import { assertDefined } from "complete-common";
import { possibleCardsFromNoteAndClues } from "./cardPresentation";
import { StackDirection } from "./enums/StackDirection";
import { ClueType, NO_VALUE, START_CARD_RANK } from "./generated/protocol";
import type { HypotheticalGameAction } from "./hypotheticalState";
import type { CardIdentity } from "./interfaces/CardIdentity";
import type { CardNote } from "./interfaces/CardNote";
import type { CardState } from "./interfaces/CardState";
import type { GameMetadata } from "./interfaces/GameMetadata";
import type { GameState } from "./interfaces/GameState";
import type { Variant } from "./interfaces/Variant";
import { isCardTouchedByClue, msgClueToClue } from "./rules/clues";
import { getTotalCardsInDeck } from "./rules/deck";
import {
  getNextPlayableRanks,
  getNextPlayableRanksAfter,
} from "./rules/playStacks";
import type { CardOrder } from "./types/CardOrder";
import type { ColorIndex } from "./types/ColorIndex";
import type { ActionDraw } from "./types/gameActions";
import type { MsgClue } from "./types/MsgClue";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { Rank } from "./types/Rank";
import type { RankClueNumber } from "./types/RankClueNumber";
import type { SuitIndex } from "./types/SuitIndex";
import type { SuitRankTuple } from "./types/SuitRankTuple";

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
    }
  | { readonly type: "passTurn" };

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
/**
 * While playing, a player's note identifies a card in a hypothetical when the note and the clues
 * leave only one possibility.
 */
export function getIdentityFromNote(
  note: CardNote,
  state: CardState,
  playing: boolean,
): CardIdentity | undefined {
  if (!playing) {
    return undefined;
  }

  const possibilities = possibleCardsFromNoteAndClues(note, state);
  if (possibilities.length !== 1) {
    return undefined;
  }

  const possibility = possibilities[0];
  assertDefined(possibility, "Expected one note and clue possibility.");
  const [suitIndex, rank] = possibility;
  return { suitIndex, rank };
}

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

  // A blank morph only hides the card (for example, a card drawn during the hypothetical), so the
  // player's own note still identifies it.
  const blankMorph =
    morphedIdentity?.suitIndex === null && morphedIdentity.rank === null;
  const noteIdentity = getIdentityFromNote(note, state, playing);
  let morphedCardIdentity: CardIdentity;
  if (morphedIdentity !== undefined && !blankMorph) {
    morphedCardIdentity = morphedIdentity;
  } else if (noteIdentity !== undefined) {
    morphedCardIdentity = noteIdentity;
  } else if (morphedIdentity !== undefined) {
    morphedCardIdentity = morphedIdentity;
  } else if (isStackBase) {
    morphedCardIdentity = {
      suitIndex: state.suitIndex,
      rank: state.rank,
    };
  } else {
    morphedCardIdentity = identity;
  }

  if (
    morphedCardIdentity.suitIndex !== null
    && morphedCardIdentity.rank !== null
  ) {
    return {
      order: state.order,
      identity: morphedCardIdentity,
      possibilities: [
        [morphedCardIdentity.suitIndex, morphedCardIdentity.rank],
      ],
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
        ([suitIndexB, rankB]) => suitIndexA === suitIndexB && rankA === rankB,
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
        isCardTouchedByClue(variant, fullClue, possibleSuitIndex, possibleRank),
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
/**
 * In a hypothetical, a stack base can be morphed into a card of its suit to pretend that the stack
 * has already been played up to that card. This lasts until a card is played on the stack. In "Up
 * or Down" variants, a stack whose direction is still undecided can only have the start card on it,
 * so other ranks are ambiguous and are ignored.
 *
 * @returns The morphed rank, or undefined if the stack base is not morphed in this way.
 */
function getMorphedStackBaseRank(
  suitIndex: SuitIndex,
  playStack: readonly CardOrder[],
  playStackDirection: StackDirection,
  context: PlanHypotheticalActionContext,
): Rank | undefined {
  if (playStack.length > 0) {
    return undefined;
  }

  // Stack bases use the card orders after the final card in the deck.
  const stackBaseOrder = (getTotalCardsInDeck(context.variant)
    + suitIndex) as CardOrder;
  const morphedIdentity = context.morphedIdentities[stackBaseOrder];
  if (
    morphedIdentity?.suitIndex !== suitIndex
    || morphedIdentity.rank === null
    || (playStackDirection === StackDirection.Undecided
      && morphedIdentity.rank !== START_CARD_RANK)
  ) {
    return undefined;
  }

  return morphedIdentity.rank;
}

export function planHypotheticalAction(
  intent: HypotheticalActionIntent,
  context: PlanHypotheticalActionContext,
): readonly HypotheticalGameAction[] | null {
  const { gameState, metadata, variant } = context;
  const playerIndex = gameState.turn.currentPlayerIndex;
  if (playerIndex === null) {
    return null;
  }

  function cardAt(order: CardOrder): HypotheticalCard | undefined {
    const view = context.cardViews.find(
      (candidate) => candidate.state.order === order,
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
    const identity = cardIdentity ?? { suitIndex: null, rank: null };
    return getHypotheticalCard({
      ...view,
      identity,
      morphedIdentity: context.morphedIdentities[order],
      note,
      playing: context.playing,
    });
  }

  const actions: HypotheticalGameAction[] = [];
  if (intent.type === "play" || intent.type === "discard") {
    // Reject cards held by other players to prevent duplicated card orders.
    const isInOtherHand = gameState.hands.some(
      (hand, otherPlayerIndex) =>
        otherPlayerIndex !== playerIndex && hand.includes(intent.order),
    );
    if (isInOtherHand) {
      return null;
    }

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
      const morphedTopRank = getMorphedStackBaseRank(
        suitIndex,
        playStack,
        playStackDirection,
        context,
      );
      const nextRanks =
        morphedTopRank === undefined
          ? getNextPlayableRanks(
              suitIndex,
              playStack,
              playStackDirection,
              gameState.playStackStarts,
              variant,
              gameState.deck,
            )
          : getNextPlayableRanksAfter(
              suitIndex,
              morphedTopRank,
              playStackDirection,
              gameState.playStackStarts,
              variant,
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
      const drawAction: ActionDraw = {
        type: "draw",
        order: nextCardOrder,
        playerIndex,
        suitIndex: nextCard?.suitIndex ?? -1,
        rank: nextCard?.rank ?? -1,
      };
      const isBottomDeckAction =
        metadata.options.deckPlays
        && gameState.deck.length === context.cardIdentities.length - 1
        && intent.order === nextCardOrder;
      if (isBottomDeckAction) {
        // The final card must exist in state before it can be played or discarded.
        actions.unshift(drawAction);
      } else {
        actions.push(drawAction);
      }
    }
  } else if (intent.type === "passTurn") {
    actions.push({
      type: "clue",
      clue: { type: NO_VALUE, value: NO_VALUE },
      giver: playerIndex,
      list: [],
      target: playerIndex,
      ignoreNegative: true,
    });
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
