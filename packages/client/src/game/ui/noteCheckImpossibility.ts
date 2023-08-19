import type { Rank, SuitRankTuple, Variant } from "@hanabi/data";
import { START_CARD_RANK } from "@hanabi/data";
import * as modals from "../../modals";
import { canPossiblyBeFromEmpathy } from "../rules/card";
import type { CardNote } from "../types/CardNote";
import type { CardState } from "../types/CardState";
import { globals } from "./globals";

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
    cardIsStackBase &&
    possibilities.every((possibility) => possibility[0] !== cardState.suitIndex)
  ) {
    modals.showWarning(
      "You cannot morph a stack base to have a different suit.",
    );
    return;
  }

  // Only validate cards in our own hand.
  if (
    !(cardState.location === globals.metadata.ourPlayerIndex) ||
    possibilities.some((possibility) =>
      canPossiblyBeFromEmpathy(cardState, possibility[0], possibility[1]),
    )
  ) {
    return;
  }

  // We have specified a list of identities where none are possible.
  const impossibilities = Array.from(possibilities, ([suitIndex, rank]) => {
    const suitName = variant.suits[suitIndex]!.displayName;
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

export function possibleCardsFromNoteAndClues(
  note: CardNote,
  state: CardState,
): readonly SuitRankTuple[] {
  const possibilitiesWithNotes = note.possibilities.filter(
    ([suitIndexA, rankA]) =>
      state.possibleCardsFromClues.some(
        ([suitIndexB, rankB]) => suitIndexA === suitIndexB && rankA === rankB,
      ),
  );

  if (possibilitiesWithNotes.length === 0) {
    return state.possibleCardsFromClues;
  }

  return possibilitiesWithNotes;
}

export function getSuitIndexFromNote(
  note: CardNote,
  state: CardState,
): number | null {
  if (note.possibilities.length > 0) {
    const possibilities = possibleCardsFromNoteAndClues(note, state);
    const [candidateSuitIndex] = possibilities[0]!;
    if (
      possibilities.every(([suitIndex]) => suitIndex === candidateSuitIndex)
    ) {
      return candidateSuitIndex;
    }
  }
  return null;
}

export function getRankFromNote(
  note: CardNote,
  state: CardState,
): Rank | undefined {
  const possibilities = possibleCardsFromNoteAndClues(note, state);
  const possibleRanks = possibilities.map((possibility) => possibility[1]);
  const firstPossibleRank = possibleRanks[0];
  if (firstPossibleRank === undefined) {
    return undefined;
  }

  const allPossibilitiesHaveTheSameRank = possibleRanks.every(
    (rank) => rank === firstPossibleRank,
  );
  return allPossibilitiesHaveTheSameRank ? firstPossibleRank : undefined;
}
