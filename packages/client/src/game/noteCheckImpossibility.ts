// Warns the player when a note that they wrote names only cards that the card cannot be.

import type {
  CardNote,
  CardOrder,
  CardState,
  PlayerIndex,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import {
  START_CARD_RANK,
  canCardPossiblyBeFromEmpathy,
  getTotalCardsInDeck,
} from "@hanabi-live/game";
import * as modals from "../modals.ts";
import { currentState, currentVariant } from "./gameSession.ts";

export { possibleCardsFromNoteAndClues } from "@hanabi-live/game";

/**
 * Warns when a note on a stack base names another suit, so that players do not mix up which stack
 * base is which. Returns whether it warned.
 */
function checkStackBaseNote(note: CardNote, suitIndex: SuitIndex | undefined) {
  if (
    note.possibilities.length === 0
    || note.possibilities.some((possibility) => possibility[0] === suitIndex)
  ) {
    return false;
  }

  modals.showWarning("You cannot morph a stack base to have a different suit.");
  return true;
}

export function checkNoteImpossibility(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
  cardIsStackBase: boolean,
  ourPlayerIndex: PlayerIndex | undefined,
): void {
  const { possibilities } = note;
  if (possibilities.length === 0) {
    return;
  }

  if (cardIsStackBase) {
    checkStackBaseNote(note, cardState.suitIndex);
    return;
  }

  // Only validate cards in our own hand.
  if (
    cardState.location !== ourPlayerIndex
    || possibilities.some((possibility) =>
      canCardPossiblyBeFromEmpathy(cardState, possibility[0], possibility[1]),
    )
  ) {
    return;
  }

  // We have specified a list of identities where none are possible.
  const impossibilities = possibilities.map(([suitIndex, rank]) => {
    const suit = variant.suits[suitIndex];
    const suitName = suit?.displayName ?? "Unknown";
    const impossibleSuit = suitName.toLowerCase();
    const impossibleRank = rank === START_CARD_RANK ? "START" : rank.toString();

    return `${impossibleSuit} ${impossibleRank}`;
  });
  modals.showWarning(
    impossibilities.length === 1
      ? `That card cannot possibly be ${impossibilities[0]}`
      : `That card cannot possibly be any of ${impossibilities.join(", ")}`,
  );
}

/**
 * Checks our note on a card, or on a stack base, after we wrote it. The classic screen checks the
 * notes of the cards that it draws itself (see `HanabiCard.checkSpecialNote`).
 */
export function checkOurNote(order: CardOrder): void {
  const state = currentState();
  const variant = currentVariant();
  const note = state.notes.ourNotes[order];
  if (note === undefined) {
    return;
  }

  // Stack bases use the orders after the final card in the deck.
  const totalCardsInDeck = getTotalCardsInDeck(variant);
  if (order >= totalCardsInDeck) {
    checkStackBaseNote(note, (order - totalCardsInDeck) as SuitIndex);
    return;
  }

  const cardState = state.visibleState?.deck[order];
  if (cardState !== undefined) {
    checkNoteImpossibility(
      variant,
      cardState,
      note,
      false,
      state.metadata.ourPlayerIndex,
    );
  }
}
