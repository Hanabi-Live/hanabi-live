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
  getCardBorderPresentation,
  getCardIdentityToShow,
  getCardPipPresentation,
  getEfficiency,
  isCardClued,
  isCardIdentityFromNote,
  isCardTouchedByClue,
} from "@hanabi-live/game";
import { EFFICIENCY_DECIMAL_PLACES } from "../ui/constants.ts";

/**
 * A large mark over a card, from a keyword in the viewer's note, as on the classic screen. A note
 * with several keywords shows the first mark in this order.
 */
const NOTE_MARKS = [
  "trash",
  "fix",
  "spook",
  "exclamationMark",
  "questionMark",
] as const;

export type NoteMark = (typeof NOTE_MARKS)[number];

/** The keyword in a note that shows each mark. */
const NOTE_MARK_KEYWORDS = {
  trash: "knownTrash",
  fix: "needsFix",
  spook: "spook",
  exclamationMark: "exclamationMark",
  questionMark: "questionMark",
} as const satisfies Record<NoteMark, keyof CardNote>;

/** A border in another color than the clue color, from a keyword in the viewer's note. */
export type NoteBorder = "chopMoved" | "finessed" | "discardPermission";

/** How a card in a hand looks. */
export interface CardView {
  readonly order: CardOrder;

  /**
   * The suit and rank on the card's face; either is `undefined` when the viewer does not know it.
   */
  readonly suitIndex: SuitIndex | undefined;
  readonly rank: Rank | undefined;

  /**
   * Whether the card shows as clued: it is raised and has a border in the clue color. As on the
   * classic screen, a "clued" note marks an unclued card as clued, and an "unclued" note does the
   * opposite.
   */
  readonly clued: boolean;

  /** The border that a note gives a card that does not show as clued. */
  readonly noteBorder: NoteBorder | undefined;

  /** The last copy of a card that still needs to be played. */
  readonly critical: boolean;

  /** Whether the card shows faded, because it can no longer be played (see `shouldFadeTrash`). */
  readonly trash: boolean;

  /** The large mark that the viewer's note shows over the card. */
  readonly noteMark: NoteMark | undefined;

  /**
   * Whether the card shows a trash badge, because the clues prove to its holder that it is trash.
   * Other players' trash cards only fade.
   */
  readonly trashIcon: boolean;

  /**
   * For a card that its holder cannot see: the suits and ranks that it can still be. A list with
   * one entry or none means that the holder knows that part, so the screen does not show it.
   */
  readonly possibleSuitIndexes: readonly SuitIndex[];
  readonly possibleRanks: readonly Rank[];

  /** Whether the viewer's note changes the suit or rank that the card face shows. */
  readonly identityFromNote: boolean;
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
  const identityOptions = {
    cardIdentity,
    state: cardState,
    note,
    empathy,
    empathyIncludesNotes,
    isStackBase: false,
    finished,
  };
  // As on the classic screen, the marks of a note stay off an empathy view that leaves out notes,
  // and off a finished game.
  const showsNoteMarks = (!empathy || empathyIncludesNotes) && !finished;

  // A "blank" note shows the card as one that nobody knows.
  const blank = showsNoteMarks && note.blank;
  const identity = blank
    ? {
        suitIndex: undefined,
        rank: undefined,
      }
    : getCardIdentityToShow(identityOptions);
  const { suitIndex, rank } = identity;

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

  const clued = isCardClued(cardState);
  const border = getCardBorderPresentation(cardState, note, finished);
  const noteMark = showsNoteMarks
    ? NOTE_MARKS.find((mark) => note[NOTE_MARK_KEYWORDS[mark]])
    : undefined;
  const markedTrash = noteMark === "trash";
  const trashIcon =
    !realLifeMode
    && !markedTrash
    && empathy
    && cardState.isKnownTrashFromEmpathy;

  return {
    order: cardState.order,
    suitIndex,
    rank,
    clued: border.clued,
    noteBorder: getNoteBorder(border),
    critical: !realLifeMode && status === CardStatus.Critical,
    trash:
      !realLifeMode
      // As on the classic screen, a card fades only for what it shows or for a note that marks it
      // as trash. A card whose identity does not show stays at full strength, even when the holder
      // knows that it is trash: its badge says so.
      && shouldFadeTrash({
        trash: status === CardStatus.Trash,
        markedTrash,
        clued,
        positivelyClued: cardState.numPositiveClues > 0,
        note,
        throwItInAHole: variant.throwItInAHole,
      }),
    noteMark,
    trashIcon,
    possibleSuitIndexes,
    possibleRanks,
    identityFromNote: !blank && isCardIdentityFromNote(identityOptions),
  };
}

function getNoteBorder(
  border: ReturnType<typeof getCardBorderPresentation>,
): NoteBorder | undefined {
  if (border.finessed) {
    return "finessed";
  }
  if (border.discardPermission) {
    return "discardPermission";
  }
  if (border.chopMoved) {
    return "chopMoved";
  }
  return undefined;
}

/**
 * Whether a trash card in a hand shows faded, on both game screens. A card that the viewer marked
 * as trash fades unless a clue touched it. Other trash fades only when nothing else marks the card
 * as worth a look: a clue, a note that calls it blank or chop moved, or a variant that hides what
 * was played.
 */
export function shouldFadeTrash({
  trash,
  markedTrash,
  clued,
  positivelyClued,
  note,
  throwItInAHole,
}: {
  readonly trash: boolean;
  readonly markedTrash: boolean;
  readonly clued: boolean;
  readonly positivelyClued: boolean;
  readonly note: Pick<CardNote, "blank" | "chopMoved">;
  readonly throwItInAHole: boolean;
}): boolean {
  if (markedTrash && !positivelyClued) {
    return true;
  }

  return trash && !clued && !note.blank && !note.chopMoved && !throwItInAHole;
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
