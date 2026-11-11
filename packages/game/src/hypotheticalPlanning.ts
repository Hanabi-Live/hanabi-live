import { assertDefined } from "complete-common";
import { identityField } from "./cardEventIdentity.ts";
import { possibleCardsFromNoteAndClues } from "./cardPresentation.ts";
import { StackDirection } from "./enums/StackDirection.ts";
import { START_CARD_RANK } from "./generated/protocol.ts";
import type { HypotheticalGameAction } from "./hypotheticalState.ts";
import type { CardIdentity } from "./interfaces/CardIdentity.ts";
import type { CardNote } from "./interfaces/CardNote.ts";
import type { CardState } from "./interfaces/CardState.ts";
import type { GameMetadata } from "./interfaces/GameMetadata.ts";
import type { GameState } from "./interfaces/GameState.ts";
import type { Variant } from "./interfaces/Variant.ts";
import { isCardTouchedByClue, msgClueToClue } from "./rules/clues.ts";
import { getTotalCardsInDeck } from "./rules/deck.ts";
import {
  getNextPlayableRanks,
  getNextPlayableRanksAfter,
} from "./rules/playStacks.ts";
import type { CardOrder } from "./types/CardOrder.ts";
import type { ActionDraw } from "./types/gameActions.ts";
import type { MsgClue } from "./types/MsgClue.ts";
import type { PlayerIndex } from "./types/PlayerIndex.ts";
import type { Rank } from "./types/Rank.ts";
import type { SuitIndex } from "./types/SuitIndex.ts";
import type { SuitRankTuple } from "./types/SuitRankTuple.ts";

export type HypotheticalActionIntent =
  | { readonly type: "play"; readonly order: CardOrder }
  | { readonly type: "discard"; readonly order: CardOrder }
  | {
      readonly type: "clue";
      readonly target: PlayerIndex;
      readonly clue: MsgClue;
    }
  | { readonly type: "passTurn" };

/** Plain data from a card view needed to reproduce its hypothetical behavior. */
export interface HypotheticalCardView {
  readonly state: CardState;
  readonly isStackBase: boolean;
  readonly visibleSuitIndex: SuitIndex | undefined;
  readonly visibleRank: CardState["rank"];
}

/** A UI independent representation of a card while planning a hypothetical action. */
export interface HypotheticalCard {
  readonly order: CardOrder;
  readonly identity: CardIdentity;
  readonly possibilities: readonly SuitRankTuple[];
  readonly visibleSuitIndex: SuitIndex | undefined;
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
    morphedIdentity !== undefined
    && morphedIdentity.suitIndex === undefined
    && morphedIdentity.rank === undefined;
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
    morphedCardIdentity.suitIndex !== undefined
    && morphedCardIdentity.rank !== undefined
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
    if (suitIndex === undefined && rank === undefined) {
      // Blank morphs are never touched, even when their underlying possibilities match.
      continue;
    }

    if (
      card.possibilities.every(([possibleSuitIndex, possibleRank]) =>
        isCardTouchedByClue(variant, fullClue, possibleSuitIndex, possibleRank),
      )
      && card.possibilities.every(() =>
        clue.type === "rank"
          ? card.visibleRank !== undefined
          : card.visibleSuitIndex !== undefined,
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
  readonly showDrawnCards: boolean;
  readonly startingPlayerIndex: PlayerIndex | undefined;
  readonly notes: readonly CardNote[];
  readonly playing: boolean;
  readonly cardViews: readonly HypotheticalCardView[];
}

/** Returns the game actions for a hypothetical intent, or undefined when it cannot be planned. */
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
    || morphedIdentity.rank === undefined
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
): readonly HypotheticalGameAction[] | undefined {
  const { gameState, metadata, variant } = context;
  const playerIndex = gameState.turn.currentPlayerIndex;
  if (playerIndex === undefined) {
    return undefined;
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
    const identity = cardIdentity ?? { suitIndex: undefined, rank: undefined };
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
      return undefined;
    }

    const card = cardAt(intent.order);
    if (
      card === undefined
      || card.identity.suitIndex === undefined
      || card.identity.rank === undefined
    ) {
      return undefined;
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
        ...identityField({ suitIndex, rank }),
      });
    } else {
      actions.push({
        type: "discard",
        playerIndex,
        order: intent.order,
        ...identityField({ suitIndex, rank }),
        failed,
      });
    }

    if (gameState.deck.length < context.cardIdentities.length) {
      const nextCardOrder = gameState.deck.length as CardOrder;
      const nextCard = context.cardIdentities[nextCardOrder];
      const drawAction: ActionDraw = {
        type: "draw",
        order: nextCardOrder,
        playerIndex,
        ...identityField({
          suitIndex: nextCard?.suitIndex,
          rank: nextCard?.rank,
        }),
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
      clue: { type: undefined, value: undefined },
      giver: playerIndex,
      orders: [],
      target: playerIndex,
      ignoreNegative: true,
    });
  } else {
    const { clue } = intent;
    const targetCards: HypotheticalCard[] = [];
    const targetHand = gameState.hands[intent.target];
    assertDefined(targetHand, "Expected a hand for the clue target.");
    for (const order of targetHand) {
      const card = cardAt(order);
      if (card === undefined) {
        return undefined;
      }
      targetCards.push(card);
    }
    actions.push({
      type: "clue",
      clue,
      giver: playerIndex,
      orders: getHypotheticalTouchedCards(targetCards, clue, variant),
      target: intent.target,
      // While drawn cards are hidden, negative information could reveal the starting player's
      // hidden cards.
      ignoreNegative:
        !context.showDrawnCards
        && intent.target === context.startingPlayerIndex,
    });
  }

  let nextPlayerIndex = playerIndex + 1;
  if (nextPlayerIndex === metadata.options.numPlayers) {
    nextPlayerIndex = 0;
  }
  actions.push({
    type: "turn",
    turn: gameState.turn.turnNum + 1,
    currentPlayerIndex: nextPlayerIndex as PlayerIndex,
  });

  return actions;
}
