import type {
  CardOrder,
  Rank,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import { MAX_STRIKES } from "@hanabi-live/game";
import { eRange } from "complete-common";
import type { ForwardedRef } from "react";
import { forwardRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { PACE_HIGH_RISK_COLOR } from "../ui/paceRiskColor.ts";
import {
  CARD_CORNER_PER_WIDTH,
  CARD_HEIGHT_PER_WIDTH,
  CardFace,
  describeCard,
  RANK_BOTTOM_PER_WIDTH,
} from "./Card.tsx";
import type { CardNotes } from "./CardNote.tsx";
import { CardNote } from "./CardNote.tsx";
import { Pip } from "./Pip.tsx";
import { DROP_ZONE_CLASS, WELL_CLASS } from "./surfaces.ts";

/** How far each discarded card covers the one before it in its row, as a fraction of its width. */
const DISCARD_OVERLAP_PER_WIDTH = 0.4;

/**
 * The space between the bottom of a discarded card's rank and the row below it, as a fraction of
 * the card's width.
 */
const DISCARD_ROW_GAP_PER_WIDTH = 0.04;

/** The padding inside the play stacks' box, in CSS pixels. */
export const PLAY_STACKS_PADDING = 8;

/** The space between two play stacks, in CSS pixels. */
export const PLAY_STACK_GAP = 6;

/** The space between the play stacks, the deck, and the tokens, in CSS pixels. */
export const PLAY_AREA_GAP = 8;

/**
 * The width of the label to the left of each play stack that names its suit, in CSS pixels. When
 * the columns stack, the label is under the stack instead, as tall as this.
 */
const SUIT_LABEL_SIZE = 14;

/** The space between a suit label and its play stack, in CSS pixels. */
const SUIT_LABEL_GAP = 4;

/** The variables that place the suit labels (see "SuitLabel"). */
const SUIT_LABEL_VARIABLES = {
  "--suit-label-size": `${SUIT_LABEL_SIZE}px`,
  "--suit-label-gap": `${SUIT_LABEL_GAP}px`,
  "--suit-label-space": `${SUIT_LABEL_SIZE + SUIT_LABEL_GAP}px`,
} as React.CSSProperties;

/** The size of each clue color's swatch in a suit label, in CSS pixels. */
const SUIT_LABEL_SWATCH_SIZE = {
  normal: 12,

  /** It is larger in colorblind mode to hold the color's letter. */
  colorblind: SUIT_LABEL_SIZE,
} as const;

/**
 * Whether the play stacks have labels that name their suits, as on the classic screen. They show
 * when the suits are hard to tell apart at a glance, such as suits of two colors. The "Up or Down"
 * and "Sudoku" variants have none, as on the classic screen.
 */
function hasSuitLabels(variant: Variant): boolean {
  return variant.showSuitNames && !variant.upOrDown && !variant.sudoku;
}

/** Joins color names into a list, such as "Green and Blue". */
const COLOR_LIST_FORMAT = new Intl.ListFormat("en", { type: "conjunction" });

/** The tooltip of a play stack's suit label: the suit, the colors that touch it, and its note. */
function getSuitLabelTooltip(suit: Suit, abbreviation: string): string {
  let text = suit.displayName;
  if (suit.allClueColors) {
    text += ": every color clue touches it.";
  } else if (suit.clueColors.length >= 2) {
    const colors = COLOR_LIST_FORMAT.format(
      suit.clueColors.map((color) => color.name),
    );
    text += `: ${colors} clues touch it.`;
  } else {
    text += ".";
  }
  return `${text} In notes, write "${abbreviation.toLowerCase()}".`;
}

/**
 * The label to the left of a play stack: the letter of the suit in notes and, below it for a suit
 * that two or more colors touch, a swatch of each color. Its tooltip names the suit. When the
 * columns stack, the stacks are a row with no room beside them, so the label is under its stack,
 * with the swatches beside the letter.
 */
function SuitLabel({
  suit,
  abbreviation,
  colorblindMode,
  showTooltip,
}: {
  readonly suit: Suit;
  readonly abbreviation: string;
  readonly colorblindMode: boolean;
  readonly showTooltip: boolean;
}): React.JSX.Element {
  const swatchSize = colorblindMode
    ? SUIT_LABEL_SWATCH_SIZE.colorblind
    : SUIT_LABEL_SWATCH_SIZE.normal;

  return (
    <div
      aria-label={getSuitLabelTooltip(suit, abbreviation)}
      className="tw:absolute tw:top-1/2 tw:left-0 tw:flex tw:w-(--suit-label-size) tw:-translate-y-1/2 tw:flex-col tw:items-center tw:justify-center tw:gap-[3px] tw:narrow-980:static tw:narrow-980:mt-(--suit-label-gap) tw:narrow-980:h-(--suit-label-size) tw:narrow-980:w-auto tw:narrow-980:translate-y-0 tw:narrow-980:flex-row"
      data-suit-label
      ref={tooltipRef(
        showTooltip ? getSuitLabelTooltip(suit, abbreviation) : undefined,
      )}
      role="note"
    >
      <span className="tw:text-[13px] tw:leading-none tw:font-bold tw:text-game-text">
        {abbreviation}
      </span>
      {suit.clueColors.length >= 2
        && suit.clueColors.map((color) => (
          <span
            className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-[3px] tw:border tw:border-solid tw:border-white/70 tw:text-[9px] tw:leading-none tw:font-extrabold tw:text-white tw:[text-shadow:0_0_2px_black]"
            key={color.name}
            style={{
              width: swatchSize,
              height: swatchSize,
              backgroundColor: colorblindMode
                ? color.fillColorblind
                : color.fill,
            }}
          >
            {colorblindMode && color.abbreviation}
          </span>
        ))}
    </div>
  );
}

/** How much of the suit's color tints an empty play stack, in percent. */
const EMPTY_STACK_TINT_PERCENT = 20;

/**
 * The look of an empty play stack: a soft fill and an edge in its suit's color, so that the
 * fireworks are in color before anyone plays them.
 */
function getEmptyStackStyle(
  suit: Suit,
  colorblindMode: boolean,
): React.CSSProperties {
  const colors = suit.fillColors ?? [
    colorblindMode ? suit.fillColorblind : suit.fill,
  ];
  const tints = colors.map(
    (color) =>
      `color-mix(in srgb, ${color} ${EMPTY_STACK_TINT_PERCENT}%, transparent)`,
  );
  return {
    background:
      tints.length === 1
        ? tints[0]
        : `linear-gradient(135deg, ${tints.join(", ")})`,
    borderColor: colors.length === 1 ? colors[0] : "white",
  };
}

export interface StackView {
  readonly suitIndex: SuitIndex;

  /** The rank on top of the stack, or `undefined` before the stack starts. */
  readonly topRank: Rank | undefined;

  /** The card on top of the stack, so that a card can move between a hand and the stack. */
  readonly topOrder: CardOrder | undefined;

  /**
   * The rank of the card under the top card, or `undefined` when the top card is the first. It
   * shows while a newly played card moves onto the stack.
   */
  readonly belowRank: Rank | undefined;
}

export interface DiscardView {
  readonly order: CardOrder;
  readonly suitIndex: SuitIndex | undefined;
  readonly rank: Rank | undefined;
}

/**
 * The look of a drop target, which changes while the player drags a card. A target that cannot take
 * the card is "unavailable", and "blocked" while the card is over it.
 */
export type ZoneState =
  "idle" | "available" | "hovered" | "unavailable" | "blocked";

/**
 * Returns a callback ref that gives a drop target to `ref`, with a tooltip that names it. The
 * tooltip does not show while the player drags a card, because the target shows a label then.
 */
function zoneRef(
  ref: ForwardedRef<HTMLElement>,
  state: ZoneState,
  name: string,
): (element: HTMLElement | null) => () => void {
  const tooltip = tooltipRef(state === "idle" ? name : undefined);
  return (element) => {
    if (typeof ref === "function") {
      ref(element);
    } else if (ref !== null) {
      ref.current = element;
    }
    const removeTooltip = tooltip(element);
    return () => {
      removeTooltip?.();
      if (typeof ref === "function") {
        ref(null);
      } else if (ref !== null) {
        ref.current = null;
      }
    };
  };
}

/**
 * While the player drags a card, the play stacks and the discard pile both darken, to show where
 * the card can go. The discard pile darkens at max clues too, where it refuses the card.
 */
const zoneClasses: Record<ZoneState, string> = {
  idle: WELL_CLASS,
  available: DROP_ZONE_CLASS,
  hovered: `${DROP_ZONE_CLASS} tw:inset-ring-3 tw:inset-ring-clue`,
  // The discard pile dims its cards itself, so that its sign and label stay bright.
  unavailable: DROP_ZONE_CLASS,
  blocked: DROP_ZONE_CLASS,
};

function isRefusing(state: ZoneState): boolean {
  return state === "unavailable" || state === "blocked";
}

function ZoneLabel({
  state,
  text,
  unavailableText,
}: {
  readonly state: ZoneState;
  readonly text: string;
  readonly unavailableText: string;
}): React.JSX.Element | undefined {
  if (state === "idle") {
    return undefined;
  }

  return (
    <span
      className={`tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:z-20 tw:-translate-1/2 tw:rounded-full tw:px-3.5 tw:py-1.5 tw:text-center tw:font-bold tw:whitespace-nowrap tw:shadow-lg ${
        state === "hovered" || state === "blocked"
          ? "tw:bg-clue tw:text-card-ink"
          : "tw:bg-game-text tw:text-card-ink"
      }`}
    >
      {isRefusing(state) ? unavailableText : text}
    </span>
  );
}

/**
 * The play stacks, where the player drops a card to play it, with the deck and the table's tokens
 * below them. Players look to the bottom left for the clue count, as on the classic screen.
 */
export const PlayArea = forwardRef<
  HTMLElement,
  {
    readonly stacks: readonly StackView[];
    readonly variant: Variant;
    readonly colorblindMode: boolean;
    readonly cardWidth: number;
    readonly cardsInDeck: number;

    /** The turns left in the game once the deck is empty (see `Deck`). */
    readonly turnsLeft: number | undefined;
    readonly zoneState: ZoneState;
    readonly notes: CardNotes;

    /** The clue tokens and the strikes (see `TableTokens`). */
    readonly tokens: React.ReactNode;
  }
>(
  (
    {
      stacks,
      variant,
      colorblindMode,
      cardWidth,
      cardsInDeck,
      turnsLeft,
      zoneState,
      notes,
      tokens,
    },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
    const suitLabels = hasSuitLabels(variant);

    return (
      // One column: the stacks, the deck, and the tokens. The boxes are as wide as the widest, and
      // the tokens are at the bottom, level with the bottom of the controls below the hands. When
      // the columns stack, the stacks and the deck are one row, with the tokens below it.
      <div
        className="tw:flex tw:shrink-0 tw:flex-col tw:items-center"
        style={{ gap: PLAY_AREA_GAP }}
      >
        <div
          className="tw:contents tw:narrow-980:flex tw:narrow-980:items-start"
          style={{ gap: PLAY_AREA_GAP }}
        >
          <section
            aria-label="Play stacks"
            // The box shows only while the player drags a card, to show that they can drop it here.
            className={`tw:relative tw:flex tw:flex-col tw:items-center tw:self-stretch tw:rounded-game-panel ${
              zoneState === "idle" ? "" : zoneClasses[zoneState]
            }`}
            // The clue rail runs halfway between this box and the hands (see "Hands.tsx").
            data-play-stacks
            ref={zoneRef(ref, zoneState, "Play stacks")}
            style={{ padding: PLAY_STACKS_PADDING }}
          >
            <div
              className="tw:flex tw:flex-col tw:narrow-980:flex-row tw:narrow-980:flex-wrap"
              style={{ gap: PLAY_STACK_GAP }}
            >
              {stacks.map((stack) => {
                const suit = variant.suits[stack.suitIndex];
                const name = suit?.displayName ?? "";

                // What lies under the top card: the card below it, or else the empty stack. It
                // stays in place while a newly played card moves on top of it.
                const below =
                  stack.belowRank === undefined ? (
                    <div
                      className="tw:box-border tw:flex tw:items-center tw:justify-center tw:border-2 tw:border-solid tw:border-game-line"
                      style={{
                        width: cardWidth,
                        height,
                        borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
                        ...(suit !== undefined
                          && getEmptyStackStyle(suit, colorblindMode)),
                      }}
                    >
                      {suit !== undefined && (
                        <Pip
                          shadow
                          size={cardWidth * 0.6}
                          suit={suit}
                          variant={variant}
                        />
                      )}
                    </div>
                  ) : (
                    <CardFace
                      colorblindMode={colorblindMode}
                      rank={stack.belowRank}
                      suitIndex={stack.suitIndex}
                      variant={variant}
                      width={cardWidth}
                    />
                  );

                const abbreviation = variant.suitAbbreviations[stack.suitIndex];

                return (
                  <div
                    // In a column, the labels have the same space on the right, so that the stacks
                    // stay in line with the deck below them.
                    className={
                      suitLabels
                        ? "tw:relative tw:px-(--suit-label-space) tw:narrow-980:px-0"
                        : undefined
                    }
                    key={stack.suitIndex}
                    style={suitLabels ? SUIT_LABEL_VARIABLES : undefined}
                  >
                    <div
                      aria-label={
                        stack.topRank === undefined
                          ? `${name}: nothing played`
                          : describeCard(
                              variant,
                              stack.suitIndex,
                              stack.topRank,
                            )
                      }
                      className="tw:relative"
                      // A misplayed card launches over its stack (see "playMotion.ts").
                      data-stack-slot={stack.suitIndex}
                      role="img"
                    >
                      {below}
                      {stack.topRank !== undefined && (
                        <div
                          className="tw:absolute tw:inset-0"
                          data-card-order={stack.topOrder}
                          data-card-place={`stack-${stack.suitIndex}`}
                          data-play-stack
                        >
                          {stack.topOrder === undefined ? undefined : (
                            <CardNote notes={notes} order={stack.topOrder}>
                              <CardFace
                                colorblindMode={colorblindMode}
                                note={notes.notesHtml.has(stack.topOrder)}
                                noteUnread={notes.unreadNotes.has(
                                  stack.topOrder,
                                )}
                                rank={stack.topRank}
                                suitIndex={stack.suitIndex}
                                variant={variant}
                                width={cardWidth}
                              />
                            </CardNote>
                          )}
                        </div>
                      )}
                    </div>
                    {suitLabels
                      && suit !== undefined
                      && abbreviation !== undefined && (
                        <SuitLabel
                          abbreviation={abbreviation}
                          colorblindMode={colorblindMode}
                          showTooltip={zoneState === "idle"}
                          suit={suit}
                        />
                      )}
                  </div>
                );
              })}
            </div>
            <ZoneLabel state={zoneState} text="Play" unavailableText="Play" />
          </section>
          <Deck
            cardsInDeck={cardsInDeck}
            cardWidth={cardWidth}
            turnsLeft={turnsLeft}
          />
        </div>
        {tokens}
      </div>
    );
  },
);

/**
 * How far each card under the top of the deck shows below and to the right of the card above it, in
 * CSS pixels.
 */
const DECK_EDGE_OFFSET = 2;

/**
 * How many card edges show under the top of the deck, by the cards left: the most at the start,
 * fewer as it runs low, and none for the last card. Each entry is the fewest cards for its edges.
 */
const DECK_EDGES = [
  {
    minCards: 20,
    edges: 3,
  },
  {
    minCards: 8,
    edges: 2,
  },
  {
    minCards: 2,
    edges: 1,
  },
] as const;

/** The most room that the edges under the top of the deck take, below and to the right of it. */
export const DECK_PILE_DEPTH = DECK_EDGES[0].edges * DECK_EDGE_OFFSET;

function getDeckEdges(cardsInDeck: number): number {
  return DECK_EDGES.find((entry) => cardsInDeck >= entry.minCards)?.edges ?? 0;
}

/**
 * The back of a card: dark ink with a faint diagonal lattice inside a thin frame, so that the deck
 * reads as a pile of face-down cards, not as one more slot on the table. Each card has a light
 * edge, so that the cards under the top one show as a stack.
 */
const CARD_BACK_STYLE = {
  backgroundColor: "var(--card-ink)",
  backgroundImage: [
    "repeating-linear-gradient(45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
    "repeating-linear-gradient(-45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
  ].join(", "),
} as const;

/** The size of the count of cards in the deck, in card widths. */
const CARDS_LEFT_SIZE = 0.5;

/** The size of the turns left on the empty deck, and of its caption, in card widths. */
const TURNS_LEFT_SIZE = 0.4;
const TURNS_LEFT_CAPTION_SIZE = 0.17;

/**
 * The deck: a pile of face-down cards with the number left on top, which gets thinner as it runs
 * low. Once it is empty, it is an empty slot, like an empty play stack, that shows the turns left
 * in the game, as on the classic screen. New cards are drawn from it (see "cardMotion.ts").
 */
function Deck({
  cardsInDeck,
  cardWidth,
  turnsLeft,
}: {
  readonly cardsInDeck: number;
  readonly cardWidth: number;

  /**
   * The turns left in the game once the deck is empty, or `undefined` if the game has no final
   * round (as in "All or Nothing").
   */
  readonly turnsLeft: number | undefined;
}): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const edges = getDeckEdges(cardsInDeck);
  const empty = cardsInDeck === 0;
  // Whoever draws the last card starts the final round, so its count stands out.
  const lastCard = cardsInDeck === 1;
  const finalRound = empty && turnsLeft !== undefined;
  const turns = turnsLeft === 1 ? "turn" : "turns";
  // In the final round, only the border of the empty slot is faint, so that the turns left stand
  // out.
  let emptyStyle = "";
  if (finalRound) {
    emptyStyle = "tw:border-game-line/60";
  } else if (empty) {
    emptyStyle = "tw:border-game-line tw:opacity-60";
  }
  const description = finalRound
    ? `${turnsLeft} ${turns} left. Then the game ends.`
    : "Cards left in the deck";

  return (
    <div
      aria-label={finalRound ? description : `${cardsInDeck} cards in the deck`}
      className="tw:flex tw:flex-col tw:items-center tw:gap-1.5"
      ref={tooltipRef(description)}
      role="img"
    >
      <div
        className="tw:relative"
        style={{
          width: cardWidth + DECK_PILE_DEPTH,
          height: height + DECK_PILE_DEPTH,
        }}
      >
        {Array.from({ length: edges }, (_, i) => {
          const offset = (edges - i) * DECK_EDGE_OFFSET;
          return (
            <div
              className="tw:absolute tw:ring-1 tw:ring-game-text/80"
              // The cards under the top one only show their edges, so they keep their order.
              key={offset}
              style={{
                ...CARD_BACK_STYLE,
                width: cardWidth,
                borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
                height,
                left: offset,
                top: offset,
              }}
            />
          );
        })}
        <div
          className={`tw:absolute tw:top-0 tw:left-0 tw:box-border tw:flex tw:items-center tw:justify-center ${
            empty
              ? "tw:border-2 tw:border-dashed"
              : "tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%)] tw:ring-1 tw:ring-game-text/80"
          } ${emptyStyle}`}
          data-deck
          style={{
            ...(!empty && CARD_BACK_STYLE),
            width: cardWidth,
            borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
            height,
          }}
        >
          {finalRound ? (
            // Smaller than the count of cards, and always with its caption, so that it does not
            // read as cards left.
            <span
              className="tw:flex tw:flex-col tw:items-center tw:leading-none tw:font-extrabold"
              style={{ color: PACE_HIGH_RISK_COLOR }}
            >
              <span style={{ fontSize: cardWidth * TURNS_LEFT_SIZE }}>
                {turnsLeft}
              </span>
              <span
                className="tw:mt-[0.3em] tw:text-center tw:font-bold tw:text-white tw:uppercase"
                style={{ fontSize: cardWidth * TURNS_LEFT_CAPTION_SIZE }}
              >
                {turns}
                <br />
                left
              </span>
            </span>
          ) : (
            <span
              className={`tw:font-extrabold ${empty ? "tw:text-game-muted" : "tw:text-white"}`}
              style={{
                fontSize: cardWidth * CARDS_LEFT_SIZE,
                color: lastCard ? PACE_HIGH_RISK_COLOR : undefined,
              }}
            >
              {cardsInDeck}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The discarded cards, one row for each suit, where the player drops a card to discard it. Each
 * card is a button that shows the turn on which it was discarded. The pile keeps room for a row of
 * every suit, so that it stays the same size as cards are discarded.
 */
export const DiscardPile = forwardRef<
  HTMLElement,
  {
    readonly rows: ReadonlyArray<readonly DiscardView[]>;
    readonly variant: Variant;
    readonly colorblindMode: boolean;
    readonly cardWidth: number;
    readonly zoneState: ZoneState;

    /** Whether the team has every clue token, so that no one can discard. */
    readonly atMaxClues: boolean;
    readonly onShowDiscard: (order: CardOrder) => void;
    readonly notes: CardNotes;
  }
>(
  (
    {
      rows,
      variant,
      colorblindMode,
      cardWidth,
      zoneState,
      atMaxClues,
      onShowDiscard,
      notes,
    },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;

    // As on the classic screen, each row covers all of the row above but its ranks.
    const rowStep =
      cardWidth * (RANK_BOTTOM_PER_WIDTH + DISCARD_ROW_GAP_PER_WIDTH);
    const rowsHeight = height + (variant.suits.length - 1) * rowStep;

    return (
      <section
        aria-label="Discards"
        className={`tw:relative tw:box-border tw:flex tw:flex-col tw:gap-3 tw:rounded-game-panel tw:px-4.5 tw:py-4 ${zoneClasses[zoneState]} ${
          // At max clues, a quiet dashed border in the clue color shows that no one can discard,
          // before anyone picks up a card and while they drag one.
          atMaxClues
            ? "tw:outline-2 tw:-outline-offset-2 tw:outline-clue/60 tw:outline-dashed"
            : ""
        }`}
        ref={zoneRef(ref, zoneState, "Discard pile")}
      >
        {/* A faint trash can behind the cards names the pile without a heading. */}
        <i
          aria-hidden="true"
          className={`fas fa-trash-alt tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:text-game-text ${
            isRefusing(zoneState) ? "tw:opacity-10" : "tw:opacity-20"
          }`}
          style={{ fontSize: cardWidth * 1.125 }}
        />
        <div
          className={`tw:relative tw:flex tw:flex-col ${
            isRefusing(zoneState) ? "tw:opacity-60" : ""
          }`}
          style={{ height: rowsHeight }}
        >
          {rows.map((row, rowIndex) => (
            <div
              className="tw:flex"
              key={row[0]?.order}
              style={{
                marginTop: rowIndex === 0 ? 0 : rowStep - height,
              }}
            >
              {row.map((card, i) => (
                <CardNote
                  className="tw:shrink-0"
                  key={card.order}
                  notes={notes}
                  order={card.order}
                  style={{
                    marginLeft:
                      i === 0 ? 0 : -cardWidth * DISCARD_OVERLAP_PER_WIDTH,
                  }}
                >
                  <button
                    aria-label={`${describeCard(variant, card.suitIndex, card.rank)}. Show the turn it was discarded`}
                    className="tw:relative tw:block tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:transition-transform tw:hover:z-10 tw:hover:-translate-y-1.5 tw:focus-visible:z-10 tw:focus-visible:-translate-y-1.5"
                    data-card-order={card.order}
                    data-card-place={`discard-${rowIndex}-${i}`}
                    onClick={() => {
                      onShowDiscard(card.order);
                    }}
                    style={{
                      borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
                    }}
                    type="button"
                  >
                    <CardFace
                      colorblindMode={colorblindMode}
                      note={notes.notesHtml.has(card.order)}
                      noteUnread={notes.unreadNotes.has(card.order)}
                      rank={card.rank}
                      suitIndex={card.suitIndex}
                      variant={variant}
                      width={cardWidth}
                    />
                  </button>
                </CardNote>
              ))}
            </div>
          ))}
        </div>
        {zoneState === "blocked" && <NoEntrySign />}
        <ZoneLabel
          state={zoneState}
          text="Discard"
          unavailableText="No discarding at max clues"
        />
      </section>
    );
  },
);

/**
 * The sign over the discard pile while the player holds a card over it and the team cannot discard.
 * It is a circle with a slash, not an X, because an X on this screen is a strike. It is in the
 * color of clues, because the team has too many clues to discard. It is larger than the held card,
 * so that the card does not cover it. It is in the middle of the pile, around the label.
 */
function NoEntrySign(): React.JSX.Element {
  return (
    <div className="tw:pointer-events-none tw:absolute tw:inset-3 tw:z-10">
      <svg
        aria-hidden="true"
        className="tw:size-full tw:text-clue tw:drop-shadow-[0_2px_6px_rgb(0_0_0/60%)]"
        viewBox="0 0 100 100"
      >
        <circle
          cx={50}
          cy={50}
          fill="none"
          r={45}
          stroke="currentColor"
          strokeWidth={8}
        />
        <path d="M18.2 18.2 81.8 81.8" stroke="currentColor" strokeWidth={8} />
      </svg>
    </div>
  );
}

/**
 * The box of the clue tokens and the strikes. Under the deck, the clue count is above the strikes,
 * so that the column stays narrow and short. When the columns stack, they are side by side.
 */
const TOKENS_BOX_CLASS = `tw:relative tw:flex tw:flex-col tw:items-center tw:gap-[8px] tw:rounded-game-panel tw:px-1.5 tw:py-[8px] tw:narrow-980:flex-row tw:narrow-980:justify-center tw:narrow-980:gap-8 tw:narrow-980:px-4 tw:narrow-980:py-4 ${WELL_CLASS}`;

/**
 * The height of the tokens under the deck, with the gap above them. It is the sum of the box's
 * classes, which are in pixels, not "rem", so that this sum stays right: 8 pixels of padding above
 * and below, the clue count (34 pixels), a gap of 8 pixels, and the strike boxes (28 pixels).
 */
export const TABLE_TOKENS_HEIGHT = PLAY_AREA_GAP + 8 + 34 + 8 + 28 + 8;

/**
 * A clue token, drawn as a disc in the color of clues with a ring inside it: the physical game
 * counts clues with tokens.
 */
function ClueTokenIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="tw:size-[24px] tw:text-clue"
      viewBox="0 0 24 24"
    >
      <circle cx={12} cy={12} fill="currentColor" r={11} />
      <circle
        cx={12}
        cy={12}
        fill="none"
        r={6.5}
        stroke="var(--card-ink)"
        strokeOpacity={0.45}
        strokeWidth={2}
      />
    </svg>
  );
}

/** The color of the clue count: it stands out only at the limits. */
function getClueCountClass(atMaxClues: boolean, outOfClues: boolean): string {
  if (atMaxClues) {
    return "tw:text-clue";
  }
  if (outOfClues) {
    return "tw:text-game-muted";
  }
  return "tw:text-game-text";
}

/**
 * The X drawn inside a box for each strike. A shape, not only a color, so that players who cannot
 * tell red apart still see the strikes.
 */
function StrikeMark({
  upcoming = false,
}: {
  /** A strike that happens later in the game, which shows faded. */
  readonly upcoming?: boolean;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={`tw:size-[21px] tw:narrow-980:size-[22px] ${upcoming ? "tw:text-game-muted tw:opacity-35" : "tw:text-critical"}`}
      viewBox="0 0 24 24"
    >
      <path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={3.4}
      />
    </svg>
  );
}

/**
 * The clue tokens and the strikes, below the deck. They are real tokens in the physical game, so
 * they sit on the table instead of with the numbers along the bottom.
 */
export function TableTokens({
  clues,
  atMaxClues,
  outOfClues,
  strikes,
  strikeSegments,
  onShowStrike,
}: {
  readonly clues: number;

  /** Whether the team has every clue token, so that no one can discard. */
  readonly atMaxClues: boolean;

  /** Whether the team has too few clue tokens to give a clue. */
  readonly outOfClues: boolean;
  readonly strikes: number;

  /**
   * For each strike box, the segment of the strike that it stands for, or `undefined` when it does
   * not stand for one that the viewer may see. Clicking a box with a strike shows its turn.
   */
  readonly strikeSegments: ReadonlyArray<number | undefined>;
  readonly onShowStrike: (segment: number) => void;
}): React.JSX.Element {
  return (
    <div
      className={`tw:mt-auto tw:shrink-0 tw:self-stretch ${TOKENS_BOX_CLASS}`}
    >
      <section
        aria-label="Clue tokens"
        className="tw:flex tw:h-[34px] tw:items-center tw:gap-1.5 tw:narrow-980:gap-2"
        ref={tooltipRef("Clue tokens")}
      >
        {/* One large number: the count that players check most. It stands out only at the
            limits, where the rules change what the team can do: in the color of clues at the
            maximum, when someone must clue, and gray with none, when no one can. */}
        <ClueTokenIcon />
        <span
          className={`tw:text-[34px] tw:leading-none tw:font-extrabold ${getClueCountClass(atMaxClues, outOfClues)}`}
          // A spark flies to the count when a completed stack gives a clue back (see
          // "scoreMotion.ts").
          data-clue-count
        >
          {clues}
        </span>
      </section>
      <section aria-label="Strikes">
        <div
          aria-label={`${strikes} of ${MAX_STRIKES} strikes`}
          className="tw:flex tw:h-[28px] tw:items-center tw:gap-1.5 tw:narrow-980:h-[32px]"
          role="group"
        >
          {[...eRange(MAX_STRIKES)].map((i) => {
            const segment = strikeSegments[i];
            const struck = i < strikes;
            // In a replay, a strike that happens later in the game shows faded, as on the classic
            // screen. Clicking it goes to its turn.
            const upcoming = !struck && segment !== undefined;
            const className = `tw:box-border tw:flex tw:size-[28px] tw:items-center tw:justify-center tw:rounded-game-control tw:narrow-980:size-[32px] tw:border-2 tw:border-solid tw:p-0 ${
              struck
                ? "tw:border-critical tw:bg-critical/15"
                : "tw:border-game-line tw:bg-transparent"
            }`;
            let mark: React.ReactNode;
            if (struck) {
              mark = <StrikeMark />;
            } else if (upcoming) {
              mark = <StrikeMark upcoming />;
            }
            return segment === undefined ? (
              // A box without a strike to show says what the boxes are. A box with one has its own
              // tooltip.
              <span
                className={className}
                data-strike-box={i}
                key={i}
                ref={tooltipRef("Strikes")}
              >
                {mark}
              </span>
            ) : (
              <button
                aria-label={`Show the turn of strike ${i + 1}`}
                className={`${className} tw:cursor-pointer tw:hover:brightness-125`}
                data-strike-box={i}
                key={i}
                onClick={() => {
                  onShowStrike(segment);
                }}
                ref={tooltipRef(
                  // A turn is one more than its segment, as in the clue log.
                  upcoming
                    ? `A strike happens later in the game, on turn ${segment + 1}. Click to go to it.`
                    : `This strike happened on turn ${segment + 1}. Click to go to it.`,
                )}
                type="button"
              >
                {mark}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
