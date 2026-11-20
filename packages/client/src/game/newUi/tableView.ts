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

/**
 * A large mark over a card, from a keyword in the viewer's note, as on the classic screen. A note
 * with several keywords shows each of their marks, in this order.
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

  /** The large marks that the viewer's note shows over the card. */
  readonly noteMarks: readonly NoteMark[];

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
   * What rules out every card that the pip would make, though the clues allow them: "seen" when the
   * holder sees every copy of them, and "note" when the identity in the note on the card is needed
   * to rule them out. It is `undefined` when the card can still be one of them.
   */
  readonly ruledOutBy: RuledOutBy | undefined;

  /** Whether a clue of this color or rank touched the card. */
  readonly positive: boolean;
}

export interface SuitPipView extends PipView {
  readonly suitIndex: SuitIndex;
}

export interface RankPipView extends PipView {
  readonly rank: Rank;
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
  /**
   * The bubble that shows every card that this card can be, while the viewer holds the pointer down
   * on the card or holds Space over it.
   */
  readonly bubble: PossibleCardsView | undefined;
}

/** A suit that the clues allow, with the ranks that the card can be and the ones that it cannot. */
interface PossibleSuitView extends SuitPipView {
  /** The ranks that the card can be in this suit. */
  readonly ranks: readonly Rank[];

  /** The cards of this suit that the clues allow, but that the card cannot be. */
  readonly removed: readonly RemovedCardView[];
}

/** What rules out a card that the clues allow. */
export type RuledOutBy = "seen" | "note";

/** A card that the clues allow, but that the card cannot be. */
interface RemovedCardView {
  readonly rank: Rank;

  /**
   * What rules it out: "seen" when the holder sees every copy of it, and "note" when the identity
   * in the note on the card leaves it out.
   */
  readonly by: RuledOutBy;
}

export interface PossibleCardsView {
  /**
   * The suits that the clues allow, in the variant's order. A suit is ruled out when the card
   * cannot be any of its cards.
   */
  readonly suits: readonly PossibleSuitView[];
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

  /** Whether the empathy view also applies the viewer's note, as it does on the viewer's hand. */
  readonly empathyIncludesNotes?: boolean;

  /**
   * Whether the card shows its identity once the game reveals it, even on a turn before that. As on
   * the classic screen, the viewer's own hand does this, so that a replay shows what each card was.
   */
  readonly showsRevealedIdentity?: boolean;

  readonly finished: boolean;

  /** "Real life mode" hides the hints that a physical game would not have. */
  readonly realLifeMode: boolean;

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
  showsRevealedIdentity = false,
  finished,
  realLifeMode,
  hGroupConventions = false,
}: CardViewOptions): CardView {
  const identityOptions = {
    cardIdentity,
    state: cardState,
    note,
    empathy: empathy && !showsRevealedIdentity,
    empathyIncludesNotes,
    isStackBase: false,
    finished,
  };
  // As on the classic screen, the marks of a note stay off an empathy view that leaves out notes,
  // and off a finished game.
  const showsNoteMarks = (!empathy || empathyIncludesNotes) && !finished;

  // A "blank" note shows the card as one that nobody knows.
  const blank = showsNoteMarks && note.blank;
  const shownIdentity = blank
    ? undefined
    : getCardIdentityToShow(identityOptions);

  // As on the classic screen, real life mode shows the plain card back until both the suit and the
  // rank are known.
  const identity =
    shownIdentity === undefined
    || (realLifeMode
      && (shownIdentity.suitIndex === undefined
        || shownIdentity.rank === undefined))
      ? {
          suitIndex: undefined,
          rank: undefined,
        }
      : shownIdentity;
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
          suitIndex,
          rank,
        })
      : undefined;

  const clued = isCardClued(cardState);
  const border = getCardBorderPresentation(cardState, note, finished);
  const noteMarks = showsNoteMarks
    ? NOTE_MARKS.filter((mark) => note[NOTE_MARK_KEYWORDS[mark]])
    : [];
  const markedTrash = noteMarks.includes("trash");
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
        markedFix: noteMarks.includes("fix"),
        clued,
        positivelyClued: cardState.numPositiveClues > 0,
        note,
        throwItInAHole: variant.throwItInAHole,
      }),
    noteMarks,
    trashIcon,
    pips,
    identityFromNote:
      identity === shownIdentity && isCardIdentityFromNote(identityOptions),
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
    suitIndex,
    rank,
  }: {
    readonly suitIndex: SuitIndex | undefined;
    readonly rank: Rank | undefined;
  },
): CardPipsView | undefined {
  // The pips are the suits and ranks that the clues allow. The note fades the ones that it rules
  // out, as the bubble does, instead of hiding them.
  const presentation = getCardPipPresentation(variant, cardState, note, true);
  const ruledOut = getRuledOutCards(cardState, note);
  const suits =
    suitIndex === undefined
      ? getShownPips(presentation.suitPips).map((pip) => ({
          ruledOutBy: getPipRuledOutBy(
            cardState.possibleCardsFromClues
              .filter(([cardSuitIndex]) => cardSuitIndex === pip.suitIndex)
              .map(([cardSuitIndex, cardRank]) =>
                ruledOut(cardSuitIndex, cardRank),
              ),
          ),
          positive: pip.positive,
          suitIndex: pip.suitIndex as SuitIndex,
        }))
      : [];
  const ranks =
    rank === undefined
      ? getShownPips(presentation.rankPips).map((pip) => ({
          ruledOutBy: getPipRuledOutBy(
            cardState.possibleCardsFromClues
              .filter(([, cardRank]) => cardRank === pip.rank)
              .map(([cardSuitIndex, cardRank]) =>
                ruledOut(cardSuitIndex, cardRank),
              ),
          ),
          positive: pip.positive,
          rank: pip.rank,
        }))
      : [];

  return suits.length === 0 && ranks.length === 0
    ? undefined
    : {
        suits,
        ranks,
        bubble: getPossibleCardsView(variant, cardState, note),
      };
}

/**
 * Returns the bubble of every card that a card can be (see `PossibleCardsView`). It shows the cards
 * that the clues allow, and marks the ones that the holder sees every copy of. It also applies the
 * identity in the card's note, unless that leaves no card.
 */
function getPossibleCardsView(
  variant: Variant,
  cardState: CardState,
  note: CardNote,
): PossibleCardsView {
  const fromClues = cardState.possibleCardsFromClues;
  const ruledOut = getRuledOutCards(cardState, note);

  // The rows leave out the note, so that a suit that only the note rules out keeps its row.
  const rows =
    getCardPipPresentation(variant, cardState, note, true, {
      rowPerSuit: true,
    }).possibilityRows ?? [];

  return {
    suits: rows
      .flatMap((row) => row.suitPips)
      .map((pip) => {
        const ranks: Rank[] = [];
        const removed: RemovedCardView[] = [];
        for (const [suitIndex, rank] of fromClues) {
          if (suitIndex !== pip.suitIndex) {
            continue;
          }
          const by = ruledOut(suitIndex, rank);
          if (by === undefined) {
            ranks.push(rank);
          } else {
            removed.push({
              rank,
              by,
            });
          }
        }
        return {
          suitIndex: pip.suitIndex as SuitIndex,
          ruledOutBy:
            ranks.length > 0
              ? undefined
              : getPipRuledOutBy(removed.map((card) => card.by)),
          positive: pip.positive,
          ranks,
          removed,
        };
      })
      .filter((suit) => suit.ranks.length > 0 || suit.removed.length > 0),
  };
}

/**
 * Returns what rules out a pip, from what rules out each card that it would make (see
 * `PipView.ruledOutBy`). The cards that the holder sees are a fact, so they win when they alone
 * rule out the pip.
 */
function getPipRuledOutBy(
  cards: ReadonlyArray<RuledOutBy | undefined>,
): RuledOutBy | undefined {
  if (cards.includes(undefined)) {
    return undefined;
  }
  return cards.every((by) => by === "seen") ? "seen" : "note";
}

/**
 * Returns what rules out a card that the clues allow: "seen" when the holder sees every copy of it,
 * "note" when the identity in the note on the card leaves it out, or `undefined` when the card can
 * be it. The note applies only when it leaves at least one card and rules out at least one.
 */
function getRuledOutCards(
  cardState: CardState,
  note: CardNote,
): (suitIndex: number, rank: Rank) => RuledOutBy | undefined {
  const holderCards = new Set(
    cardState.possibleCardsForEmpathy.map(([suitIndex, rank]) =>
      cardKey(suitIndex, rank),
    ),
  );
  const noteCards = new Set(
    note.possibilities.map(([suitIndex, rank]) => cardKey(suitIndex, rank)),
  );
  const fromVisibleCards = cardState.possibleCardsFromClues.filter(
    ([suitIndex, rank]) => holderCards.has(cardKey(suitIndex, rank)),
  );
  const fromNote = fromVisibleCards.filter(([suitIndex, rank]) =>
    noteCards.has(cardKey(suitIndex, rank)),
  );
  const appliesNote =
    fromNote.length > 0 && fromNote.length < fromVisibleCards.length;

  return (suitIndex, rank) => {
    const key = cardKey(suitIndex, rank);
    if (!holderCards.has(key)) {
      return "seen";
    }
    if (appliesNote && !noteCards.has(key)) {
      return "note";
    }
    return undefined;
  };
}

function cardKey(suitIndex: number, rank: Rank): string {
  return `${suitIndex},${rank}`;
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
 * Whether a trash card in a hand shows faded, on both game screens. A card that shows the wrench
 * from a note never fades, so that the mark stays easy to see. A card that the viewer marked as
 * trash fades unless a clue touched it. Other trash fades only when nothing else marks the card as
 * worth a look: a clue, a note that calls it blank or chop moved, or a variant that hides what was
 * played.
 */
export function shouldFadeTrash({
  trash,
  markedTrash,
  markedFix,
  clued,
  positivelyClued,
  note,
  throwItInAHole,
}: {
  readonly trash: boolean;
  readonly markedTrash: boolean;
  readonly markedFix: boolean;
  readonly clued: boolean;
  readonly positivelyClued: boolean;
  readonly note: Pick<CardNote, "blank" | "chopMoved">;
  readonly throwItInAHole: boolean;
}): boolean {
  return (
    !markedFix
    && ((markedTrash && !positivelyClued)
      || (trash && !clued && !note.blank && !note.chopMoved && !throwItInAHole))
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
