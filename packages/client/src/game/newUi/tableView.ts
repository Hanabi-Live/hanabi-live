// What the redesigned game screen shows, worked out from the game state. These functions do not
// touch React or the page, so that they can be tested on their own.

import type {
  CardIdentity,
  CardNote,
  CardOrder,
  CardState,
  Clue,
  GameState,
  Options,
  Rank,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import {
  CardStatus,
  PipState,
  getCardIdentityToShow,
  getCardPipPresentation,
  getEfficiency,
  isCardClued,
  isCardTouchedByClue,
} from "@hanabi-live/game";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";

/** How a card in a hand looks. */
export interface CardView {
  readonly order: CardOrder;

  /**
   * The suit and rank on the card's face; either is `undefined` when the viewer does not know it.
   */
  readonly suitIndex: SuitIndex | undefined;
  readonly rank: Rank | undefined;

  readonly clued: boolean;

  /** The last copy of a card that still needs to be played. */
  readonly critical: boolean;

  /** A card that can no longer be played. It shows faded. */
  readonly trash: boolean;

  /**
   * Whether the card also shows a trash icon. Other players' trash cards only fade, unless the
   * viewer marked them as trash in a note; cards in the viewer's own hand show it when the clues
   * prove it.
   */
  readonly trashIcon: boolean;

  /**
   * For a card that its holder cannot see: the suits and ranks that it can still be. A list with
   * one entry or none means that the holder knows that part, so the screen does not show it.
   */
  readonly possibleSuitIndexes: readonly SuitIndex[];
  readonly possibleRanks: readonly Rank[];
}

/**
 * Returns a hand's cards in the order that the screen shows them. The game stores the oldest card
 * first, but the newest card (slot 1) goes on the left, unless the player reversed their hands.
 */
export function getHandDisplayOrder(
  hand: readonly CardOrder[],
  reverseHands: boolean,
): readonly CardOrder[] {
  return reverseHands ? hand : hand.toReversed();
}

interface CardViewOptions {
  readonly gameState: GameState;
  readonly cardState: CardState;
  readonly cardIdentity: CardIdentity;
  readonly note: CardNote;
  readonly variant: Variant;

  /**
   * Whether the card is in the viewer's own hand, so that they see only what its clues tell them.
   */
  readonly empathy: boolean;

  /** Whether the empathy view also applies the viewer's note, as it does with Ctrl + Space. */
  readonly empathyIncludesNotes?: boolean;

  readonly finished: boolean;

  /** "Real life mode" hides the hints that a physical game would not have. */
  readonly realLifeMode: boolean;
}

export function getCardView({
  gameState,
  cardState,
  cardIdentity,
  note,
  variant,
  empathy,
  empathyIncludesNotes = false,
  finished,
  realLifeMode,
}: CardViewOptions): CardView {
  const { suitIndex, rank } = getCardIdentityToShow({
    cardIdentity,
    state: cardState,
    note,
    empathy,
    empathyIncludesNotes,
    isStackBase: false,
    finished,
  });

  const status =
    suitIndex === undefined || rank === undefined
      ? CardStatus.NeedsToBePlayed
      : gameState.cardStatus[suitIndex][rank];

  let possibleSuitIndexes: SuitIndex[] = [];
  let possibleRanks: Rank[] = [];
  if (empathy) {
    const pips = getCardPipPresentation(variant, cardState, note, true, {
      empathyIncludesNotes,
    });
    possibleSuitIndexes = pips.suitPips
      .filter((pip) => pip.state === PipState.Visible)
      .map((pip) => pip.suitIndex as SuitIndex);
    possibleRanks = pips.rankPips
      .filter((pip) => pip.state === PipState.Visible)
      .map((pip) => pip.rank);
  }

  return {
    order: cardState.order,
    suitIndex,
    rank,
    clued: isCardClued(cardState),
    critical: !realLifeMode && status === CardStatus.Critical,
    trash:
      !realLifeMode
      && (status === CardStatus.Trash || cardState.isKnownTrashFromEmpathy),
    trashIcon:
      !realLifeMode
      && (note.knownTrash || (empathy && cardState.isKnownTrashFromEmpathy)),
    possibleSuitIndexes,
    possibleRanks,
  };
}

/** Returns the cards in a hand that a clue would touch, from the identities that we can see. */
export function getTouchedCards(
  variant: Variant,
  hand: readonly CardOrder[],
  cardIdentities: readonly CardIdentity[],
  clue: Clue,
): readonly CardOrder[] {
  return hand.filter((order) => {
    const identity = cardIdentities[order];
    return (
      identity?.suitIndex !== undefined
      && identity.rank !== undefined
      && isCardTouchedByClue(variant, clue, identity.suitIndex, identity.rank)
    );
  });
}

/**
 * Whether a clue may be given. It must touch a card, unless the options or the variant allow clues
 * that touch nothing. (The server checks the rules that depend on characters.)
 */
export function isClueAllowed(
  clue: Clue,
  numTouched: number,
  variant: Variant,
  options: Options,
): boolean {
  return (
    numTouched > 0
    || options.emptyClues
    || (clue.type === "color" && variant.colorCluesTouchNothing)
    || (clue.type === "rank" && variant.rankCluesTouchNothing)
  );
}

/** Returns the pace as the classic screen shows it, or "-" when pace no longer matters. */
export function formatPace(
  pace: number | undefined,
  finalRoundEffectivelyStarted: boolean,
  allOrNothing: boolean,
): string {
  if (pace === undefined || finalRoundEffectivelyStarted || allOrNothing) {
    return "-";
  }

  return pace > 0 ? `+${pace}` : pace.toString();
}

/**
 * Returns the efficiency that the rest of the game needs, as the classic screen shows it. It counts
 * the cards that notes or the player's own modifier mark as gotten.
 */
export function formatFutureEfficiency(
  stats: GameState["stats"],
  efficiencyModifier: number,
): string {
  if (stats.cluesStillUsableNotRounded === undefined) {
    return "-";
  }

  const cardsGotten =
    stats.cardsGotten + efficiencyModifier + (stats.cardsGottenByNotes ?? 0);
  const cardsNotGotten = Math.max(stats.maxScore - cardsGotten, 0);
  const futureEfficiency = getEfficiency(
    cardsNotGotten,
    Math.floor(stats.cluesStillUsableNotRounded),
  );
  return futureEfficiency === undefined
    ? "-"
    : futureEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES);
}

/** The note on a card that has none. */
export const BLANK_NOTE = {
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
} as const satisfies CardNote;
