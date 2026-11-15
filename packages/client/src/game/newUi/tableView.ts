// What the redesigned game screen shows, worked out from the game state. These functions do not
// touch React or the page, so that they can be tested on their own.

import type {
  CardIdentity,
  CardNote,
  CardOrder,
  CardState,
  Clue,
  ColorIndex,
  GameMetadata,
  GameState,
  MsgClue,
  PlayerIndex,
  Rank,
  StackDirection,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import {
  CardStatus,
  PipState,
  cardsReducer,
  getCardBorderPresentation,
  getCardIdentityToShow,
  getCardPipPresentation,
  getClueCost,
  isAtMaxClueTokens,
  isCardClued,
  isCardIdentityFromNote,
  isCardTouchedByClue,
  isHandLocked,
} from "@hanabi-live/game";
import { DEFAULT_EMPATHY_STYLE, EmpathyStyle } from "../empathyStyle.ts";

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
   * As on the classic screen, it shows with or without the empathy view.
   */
  readonly trashIcon: boolean;

  /**
   * For a card that its holder cannot see: what the clues and the other cards tell them about it.
   * It is `undefined` when it would tell the holder nothing that the card face does not.
   */
  readonly pips: CardPipsView | undefined;

  /** Whether the viewer's note changes the suit or rank that the card face shows. */
  readonly identityFromNote: boolean;

  /** Whether a "blank" note makes the card look like the back of a card, as in the deck. */
  readonly blank: boolean;

  /**
   * Whether the card shows a question mark, because discarding it now would discard the second copy
   * of a card that the team still needs (the H-Group's "double discard avoidance").
   */
  readonly doubleDiscard: boolean;

  /** The direction of the play stack of the suit that the card face shows. */
  readonly stackDirection: StackDirection | undefined;
}

/** A suit or a rank that a card can be, as a pip on the card. */
interface PipView {
  /**
   * Whether the holder ruled it out because they see every copy of the cards that it would make,
   * though the clues allow it. The card crosses it out.
   */
  readonly eliminated: boolean;

  /** Whether a clue of this color or rank touched the card. */
  readonly positive: boolean;
}

export interface SuitPipView extends PipView {
  readonly suitIndex: SuitIndex;
}

export interface RankPipView extends PipView {
  readonly rank: Rank;
}

/** A row of suits that can be the same ranks. */
export interface PossibilityRowView {
  readonly suits: readonly SuitPipView[];
  readonly ranks: readonly RankPipView[];
}

/**
 * What a card that its holder cannot see shows about it. The lists of suits and ranks are empty
 * when the card face already shows that part. When the clues leave a set of cards that separate
 * suits and ranks cannot show, such as "any red card, or a blue 1", the card shows rows instead:
 * each row lists suits with the ranks that they can be.
 */
export interface CardPipsView {
  readonly suits: readonly SuitPipView[];
  readonly ranks: readonly RankPipView[];
  readonly rows: readonly PossibilityRowView[] | undefined;
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

  /** How the card shows what its holder knows. It is the default when it is left out. */
  readonly empathyStyle?: EmpathyStyle;

  /**
   * Whether the viewer turned on the H-Group conventions setting, in a variant that is not hard.
   */
  readonly hGroupConventions?: boolean;
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
  empathyStyle = DEFAULT_EMPATHY_STYLE,
  hGroupConventions = false,
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

  // As on the classic screen, a card shows no pips in real life mode, nor when a "blank" note asks
  // for the card to look like the deck.
  const pips =
    empathy && !realLifeMode && !blank
      ? getPipsView(variant, cardState, note, {
          empathyIncludesNotes,
          empathyStyle,
          suitIndex,
          rank,
        })
      : undefined;

  const clued = isCardClued(cardState);
  const border = getCardBorderPresentation(cardState, note, finished);
  const noteMark = showsNoteMarks
    ? NOTE_MARKS.find((mark) => note[NOTE_MARK_KEYWORDS[mark]])
    : undefined;
  const markedTrash = noteMark === "trash";
  const trashIcon =
    !realLifeMode && !markedTrash && cardState.isKnownTrashFromEmpathy;
  const critical = !realLifeMode && status === CardStatus.Critical;

  return {
    order: cardState.order,
    suitIndex,
    rank,
    clued: border.clued,
    noteBorder: getNoteBorder(border),
    critical,
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
    pips,
    identityFromNote: !blank && isCardIdentityFromNote(identityOptions),
    blank,
    // As on the classic screen, the question mark leaves out the cards that already show a reason
    // to keep or discard them.
    doubleDiscard:
      hGroupConventions
      && !realLifeMode
      && cardState.inDoubleDiscard
      && !critical
      && !trashIcon
      && !markedTrash
      && !border.clued,
    stackDirection:
      suitIndex === undefined
        ? undefined
        : gameState.playStackDirections[suitIndex],
  };
}

/** Returns what a card shows about what its holder knows (see `CardPipsView`). */
function getPipsView(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
  {
    empathyIncludesNotes,
    empathyStyle,
    suitIndex,
    rank,
  }: {
    readonly empathyIncludesNotes: boolean;
    readonly empathyStyle: EmpathyStyle;
    readonly suitIndex: SuitIndex | undefined;
    readonly rank: Rank | undefined;
  },
): CardPipsView | undefined {
  const presentation = getCardPipPresentation(variant, cardState, note, true, {
    rowPerSuit: empathyStyle === EmpathyStyle.RowPerSuit,
    empathyIncludesNotes,
  });
  const suits =
    suitIndex === undefined
      ? getShownPips(presentation.suitPips).map((pip) => ({
          ...toPipView(pip),
          suitIndex: pip.suitIndex as SuitIndex,
        }))
      : [];
  const ranks =
    rank === undefined
      ? getShownPips(presentation.rankPips).map((pip) => ({
          ...toPipView(pip),
          rank: pip.rank,
        }))
      : [];

  // The rows need both the suit and the rank to be unknown, as on the classic screen.
  const rows =
    suitIndex === undefined
    && rank === undefined
    && empathyStyle !== EmpathyStyle.Pips
      ? presentation.possibilityRows?.map((row) => ({
          suits: row.suitPips.map((pip) => ({
            ...toPipView(pip),
            suitIndex: pip.suitIndex as SuitIndex,
          })),
          ranks: row.rankPips
            .filter((pip) => pip.state !== PipState.Hidden)
            .map((pip) => ({
              ...toPipView(pip),
              rank: pip.rank,
            })),
        }))
      : undefined;

  return rows === undefined && suits.length === 0 && ranks.length === 0
    ? undefined
    : {
        suits,
        ranks,
        rows,
      };
}

/**
 * The pips that a card shows: the ones that the clues allow, with the ones that the holder ruled
 * out. One pip alone tells the holder nothing that the clues did not, so it does not show.
 */
function getShownPips<T extends { readonly state: PipState }>(
  pips: readonly T[],
): readonly T[] {
  const shown = pips.filter((pip) => pip.state !== PipState.Hidden);
  return shown.length > 1 ? shown : [];
}

function toPipView(pip: {
  readonly state: PipState;
  readonly positive: boolean;
}): PipView {
  return {
    eliminated: pip.state === PipState.Eliminated,
    positive: pip.positive,
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
  return (
    (markedTrash && !positivelyClued)
    || (trash && !clued && !note.blank && !note.chopMoved && !throwItInAHole)
  );
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
 * Returns the cards of the game as they would be after a clue that the viewer is choosing, so that
 * the target's hand can show what the clue would tell them, as on the classic screen.
 */
export function getCluePreviewDeck(
  gameState: GameState,
  metadata: GameMetadata,
  variant: Variant,
  {
    giver,
    target,
    clue,
    touched,
  }: {
    readonly giver: PlayerIndex;
    readonly target: PlayerIndex;
    readonly clue: Clue;
    readonly touched: readonly CardOrder[];
  },
): readonly CardState[] {
  const msgClue: MsgClue =
    clue.type === "color"
      ? {
          type: "color",
          color: variant.clueColors.findIndex(
            (color) => color.name === clue.value.name,
          ) as ColorIndex,
        }
      : {
          type: "rank",
          rank: clue.value,
        };
  return cardsReducer(
    gameState.deck,
    {
      type: "clue",
      clue: msgClue,
      playerIndex: giver,
      orders: touched,
      receiverIndex: target,
      ignoreNegative: false,
    },
    gameState,
    metadata,
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

/**
 * A warning for the current player, from the H-Group conventions: their hand is locked, so they may
 * not be able to discard, or the last player discarded a card that may be the other copy of a card
 * in their hand. The classic screen shows it under the current player's name.
 */
export type TurnWarning = "locked" | "doubleDiscard";

/**
 * Returns the warning for the current player. There is none when the team cannot clue or cannot
 * discard, which the clue tokens already show.
 */
export function getTurnWarning(
  gameState: GameState,
  variant: Variant,
): TurnWarning | undefined {
  const { currentPlayerIndex } = gameState.turn;
  const hand =
    currentPlayerIndex === undefined
      ? undefined
      : gameState.hands[currentPlayerIndex];
  if (
    hand === undefined
    || gameState.clueTokens < getClueCost(variant)
    || isAtMaxClueTokens(gameState.clueTokens, variant)
  ) {
    return undefined;
  }

  if (isHandLocked(hand, gameState.deck)) {
    return "locked";
  }

  return gameState.stats.doubleDiscardCard === undefined
    ? undefined
    : "doubleDiscard";
}
