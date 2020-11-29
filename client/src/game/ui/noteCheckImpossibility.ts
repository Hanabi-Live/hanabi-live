import * as modals from "../../modals";
import { canPossiblyBe } from "../rules/card";
import CardNote from "../types/CardNote";
import CardState from "../types/CardState";
import { STACK_BASE_RANK, START_CARD_RANK } from "../types/constants";
import Variant from "../types/Variant";
import globals from "./globals";

export function checkNoteImpossibility(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
): void {
  const { possibilities } = note;
  if (possibilities.length === 0) {
    return;
  }
  // Prevent players from accidentally mixing up which stack base is which
  if (
    cardState.rank === STACK_BASE_RANK &&
    possibilities.every((possibility) => possibility[0] !== cardState.suitIndex)
  ) {
    modals.warningShow(
      "You cannot morph a stack base to have a different suit.",
    );
    // note.possibilities = [];
    return;
  }

  // Only validate cards in our own hand
  if (
    !(cardState.location === globals.metadata.ourPlayerIndex) ||
    possibilities.some((possibility) =>
      canPossiblyBe(cardState, possibility[0], possibility[1]),
    )
  ) {
    return;
  }

  // We have specified a list of identities where none are possible
  const impossibilities = Array.from(possibilities, ([suitIndex, rank]) => {
    const suitName = variant.suits[suitIndex].displayName;
    const impossibleSuit = suitName.toLowerCase();
    const impossibleRank = rank === START_CARD_RANK ? "START" : rank.toString();
    return `${impossibleSuit} ${impossibleRank}`;
  });
  if (impossibilities.length === 1) {
    modals.warningShow(`That card cannot possibly be ${impossibilities[0]}`);
  } else {
    modals.warningShow(
      `That card cannot possibly be any of ${impossibilities.join(", ")}`,
    );
  }
  // note.possibilities = [];
}

export function possibleCardsFromNoteAndClues(
  note: CardNote,
  state: CardState,
): ReadonlyArray<readonly [number, number]> {
  const possibilities_with_notes = note.possibilities.filter(
    ([suitIndexA, rankA]) =>
    state.possibleCardsFromClues.findIndex(
      ([suitIndexB, rankB]) =>
      suitIndexA === suitIndexB && rankA === rankB,
    ) !== -1,
  );

  if (possibilities_with_notes.length === 0) {
    return state.possibleCardsFromClues;
  }
  return possibilities_with_notes;
}
