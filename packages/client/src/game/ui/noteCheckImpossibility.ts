import type { CardNote, CardState, Variant } from "@hanabi-live/game";
import {
  START_CARD_RANK,
  canCardPossiblyBeFromEmpathy,
} from "@hanabi-live/game";
import * as modals from "../../modals";
import { globals } from "./UIGlobals";

export { possibleCardsFromNoteAndClues } from "@hanabi-live/game";

export function checkNoteImpossibility(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
  cardIsStackBase: boolean,
): void {
  const { possibilities } = note;
  if (possibilities.length === 0) {
    return;
  }

  // Prevent players from accidentally mixing up which stack base is which.
  if (
    cardIsStackBase
    && possibilities.every(
      (possibility) => possibility[0] !== cardState.suitIndex,
    )
  ) {
    modals.showWarning(
      "You cannot morph a stack base to have a different suit.",
    );
    return;
  }

  // Only validate cards in our own hand.
  if (
    cardState.location !== globals.metadata.ourPlayerIndex
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
  if (impossibilities.length === 1) {
    modals.showWarning(`That card cannot possibly be ${impossibilities[0]}`);
  } else {
    modals.showWarning(
      `That card cannot possibly be any of ${impossibilities.join(", ")}`,
    );
  }
}
