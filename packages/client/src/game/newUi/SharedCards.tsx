import type {
  CardOrder,
  EndCondition,
  Rank,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import { getTotalCardsInDeck, MAX_CLUES, MAX_STRIKES } from "@hanabi-live/game";
import { eRange } from "complete-common";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { escapeHtml } from "../../utils.ts";
import type { GameEnd } from "../gameEnd.ts";
import { getGameEndTooltipHtml } from "../gameEnd.ts";
import { getSuitDescriptionHtml } from "../suitDescription.ts";
import { PACE_HIGH_RISK_COLOR } from "../ui/paceRiskColor.ts";
import {
  CARD_BACK_STYLE,
  CARD_CORNER_PER_WIDTH,
  CARD_HEIGHT_PER_WIDTH,
  CardFace,
  describeCard,
  PossibleCardsBubble,
  RANK_BOTTOM_PER_WIDTH,
} from "./Card.tsx";
import {
  DISCARD_PLACE_PREFIX,
  HOLE_PLACE,
  STACK_PLACE_PREFIX,
} from "./cardMotion.ts";
import type { CardNotes } from "./CardNote.tsx";
import { CardNote } from "./CardNote.tsx";
import { ClueTokenIcon } from "./ClueTokenIcon.tsx";
import { DROP_ZONE_FADE_MILLISECONDS } from "./DropZones.tsx";
import { FitText } from "./FitText.tsx";
import { useCloseOnOutsideClick, useElementSize } from "./hooks.ts";
import { Menu } from "./Menu.tsx";
import { Pip } from "./Pip.tsx";
import {
  MENU_ICON_CLASS,
  MENU_ICON_ITEM_CLASS,
  WELL_CLASS,
} from "./surfaces.ts";
import type { PossibleCardsView } from "./tableView.ts";

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

/** The text of a play stack's suit label: the suit, the colors that touch it, and its note. */
function getSuitLabelText(suit: Suit, abbreviation: string): string {
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
  descriptionHtml,
  colorblindMode,
  showTooltip,
}: {
  readonly suit: Suit;
  readonly abbreviation: string;

  /** The description of the suit, as its play stack's tooltip shows it. */
  readonly descriptionHtml: string;
  readonly colorblindMode: boolean;
  readonly showTooltip: boolean;
}): React.JSX.Element {
  const swatchSize = colorblindMode
    ? SUIT_LABEL_SWATCH_SIZE.colorblind
    : SUIT_LABEL_SWATCH_SIZE.normal;

  return (
    <div
      aria-label={getSuitLabelText(suit, abbreviation)}
      className="tw:absolute tw:top-1/2 tw:left-0 tw:flex tw:w-(--suit-label-size) tw:-translate-y-1/2 tw:flex-col tw:items-center tw:justify-center tw:gap-[3px] tw:phone:static tw:phone:mt-(--suit-label-gap) tw:phone:h-(--suit-label-size) tw:phone:w-auto tw:phone:translate-y-0 tw:phone:flex-row"
      data-suit-label
      ref={tooltipRefHtml(
        showTooltip
          ? `${descriptionHtml}<div class="small-tooltip-text">In notes, write "${escapeHtml(abbreviation.toLowerCase())}".</div>`
          : undefined,
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

  /**
   * The rank that the stack base shows, as on the classic screen. In a hypothetical, it is the rank
   * that the stack base was changed into. Otherwise, it is the rank that the viewer's note gives
   * the stack base, in a game that is still going: in "Throw It in a Hole" variants, players note
   * what they think the hole holds.
   */
  readonly baseRank: Rank | undefined;

  /**
   * The label on the stack, or an empty string: which way it goes in "Up or Down" variants and for
   * a reversed suit, or which ranks it can start with in "Sudoku" variants (see "stackLabels.ts").
   */
  readonly label: string;
}

/** The hole of a "Throw It in a Hole" variant, where the players' played cards go. */
export interface HoleView {
  /**
   * The cards that the viewer has seen go into the hole, for a player, who cannot see the score.
   * Spectators do not see it.
   */
  readonly count: number | undefined;

  /** The card that went into the hole last, and what the viewer knows of it. */
  readonly topOrder: CardOrder | undefined;
  readonly topSuitIndex: SuitIndex | undefined;
  readonly topRank: Rank | undefined;
}

/** The suits and ranks that the cards left in the deck can still be. */
export interface DeckEmpathy {
  readonly possibleSuitIndexes: readonly SuitIndex[];
  readonly possibleRanks: readonly Rank[];

  /** The exact cards that the deck can still hold, for the bubble of possible cards. */
  readonly possibleCards: PossibleCardsView;
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
      className={`tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:z-20 tw:-translate-1/2 tw:rounded-full tw:border-2 tw:border-black tw:px-3.5 tw:py-1.5 tw:text-center tw:font-bold tw:whitespace-nowrap tw:shadow-lg ${
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
 * The size of the label on a play stack (see `StackLabel`), as a fraction of the card's width. It
 * shrinks to fit a long label, such as the ranks of a "Sudoku" stack.
 */
const STACK_LABEL_SIZE_PER_WIDTH = 0.22;

/**
 * The label on a play stack that says which way it goes, or which ranks it can start with. It is a
 * dark tag across the bottom of the card, so that it reads on any suit's color, and the stacks keep
 * their size.
 */
function StackLabel({
  text,
  cardWidth,
}: {
  readonly text: string;
  readonly cardWidth: number;
}): React.JSX.Element {
  return (
    <span
      className="tw:pointer-events-none tw:absolute tw:inset-x-[5%] tw:bottom-[5%] tw:z-10 tw:flex tw:justify-center"
      data-stack-label
    >
      <span
        className="tw:flex tw:min-w-0 tw:max-w-full tw:rounded-game-control tw:bg-card-ink/90 tw:px-[0.45em] tw:py-[0.2em] tw:leading-none tw:font-bold tw:text-game-text tw:ring-1 tw:ring-white/30"
        style={{ fontSize: cardWidth * STACK_LABEL_SIZE_PER_WIDTH }}
      >
        <FitText text={text} />
      </span>
    </span>
  );
}

/** The size of the hole, as a fraction of the width of a card on the table. */
const HOLE_SIZE_PER_WIDTH = 1.8;

/** The size of the card in the hole, as a fraction of the width of a card on the table. */
const HOLE_CARD_SIZE_PER_WIDTH = 0.6;

/**
 * The size of the count of cards in the hole, as a fraction of the width of a card on the table.
 */
const HOLE_COUNT_SIZE_PER_WIDTH = 0.45;

/** The size of the caption under the count, as a fraction of the width of a card on the table. */
const HOLE_CAPTION_SIZE_PER_WIDTH = 0.18;

/**
 * The hole of a "Throw It in a Hole" variant: a dark pit over the middle of the play stacks, as on
 * the classic screen. A played card falls into it and sinks out of sight. For a player, who cannot
 * see the score, the pit shows how many cards went into it.
 */
function Hole({
  hole,
  variant,
  colorblindMode,
  cardWidth,
}: {
  readonly hole: HoleView;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly cardWidth: number;
}): React.JSX.Element {
  const size = cardWidth * HOLE_SIZE_PER_WIDTH;
  const { count, topOrder } = hole;
  const description =
    count === undefined
      ? "The hole. Played cards go into it."
      : `${count} ${count === 1 ? "card" : "cards"} in the hole, as far as you know. In this variant, the players cannot see the score or the strikes.`;
  return (
    <div className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-10 tw:flex tw:items-center tw:justify-center">
      <div
        aria-label={description}
        className="tw:pointer-events-auto tw:relative tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full"
        data-hole
        ref={tooltipRef(description)}
        role="img"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle, rgb(0 0 0 / 95%) 0 40%, rgb(0 0 0 / 75%) 58%, rgb(0 0 0 / 0%) 71%)",
        }}
      >
        {topOrder !== undefined && (
          <div
            className="tw:absolute"
            data-card-order={topOrder}
            data-card-place={HOLE_PLACE}
            data-play-stack
          >
            <div className="tw:-rotate-12 tw:opacity-60">
              <CardFace
                colorblindMode={colorblindMode}
                rank={hole.topRank}
                suitIndex={hole.topSuitIndex}
                variant={variant}
                width={cardWidth * HOLE_CARD_SIZE_PER_WIDTH}
              />
            </div>
          </div>
        )}
        {/* The rim of the pit darkens the card in it, so that the card sinks out of sight. */}
        <div
          aria-hidden="true"
          className="tw:absolute tw:inset-0 tw:rounded-full tw:shadow-[inset_0_0_0_1px_rgb(255_255_255/12%)]"
          style={{
            background:
              "radial-gradient(circle, rgb(0 0 0 / 35%) 0 35%, rgb(0 0 0 / 80%) 55%, rgb(0 0 0 / 0%) 71%)",
          }}
        />
        {count !== undefined && (
          <span className="tw:relative tw:flex tw:flex-col tw:items-center tw:leading-none tw:font-extrabold tw:text-game-text">
            <span style={{ fontSize: cardWidth * HOLE_COUNT_SIZE_PER_WIDTH }}>
              {count}
            </span>
            <span
              className="tw:mt-[0.3em] tw:font-bold tw:text-game-muted"
              style={{ fontSize: cardWidth * HOLE_CAPTION_SIZE_PER_WIDTH }}
            >
              in the hole
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The play stacks, where the player drops a card to play it, with the deck and the table's tokens
 * below them. Players look to the bottom left for the clue count, as on the classic screen.
 */
export function PlayArea({
  stacks,
  hole,
  variant,
  colorblindMode,
  cardWidth,
  deck,
  gameEnd,
  zoneState,
  notes,
  tokens,
}: {
  readonly stacks: readonly StackView[];

  /** The hole of a "Throw It in a Hole" variant, if it shows. */
  readonly hole: HoleView | undefined;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly cardWidth: number;
  readonly deck: DeckProps;

  /** How the game ended, on the turn on which it ended. It takes the place of the deck. */
  readonly gameEnd: GameEnd | undefined;
  readonly zoneState: ZoneState;
  readonly notes: CardNotes;

  /** The clue tokens and the strikes (see `TableTokens`). */
  readonly tokens: React.ReactNode;
}): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const suitLabels = hasSuitLabels(variant);
  const dragging = zoneState !== "idle";

  return (
    // One column: the stacks, the deck, and the tokens. The boxes are as wide as the widest, and
    // the tokens are at the bottom, level with the bottom of the controls below the hands. In the
    // phone layout, the stacks and the deck are one row, and the tokens are beside the discard pile
    // instead.
    <div
      className="tw:flex tw:shrink-0 tw:flex-col tw:items-center"
      style={{ gap: PLAY_AREA_GAP }}
    >
      <div
        className="tw:contents tw:phone:flex tw:phone:items-start"
        style={{ gap: PLAY_AREA_GAP }}
      >
        <section
          aria-label="Play stacks"
          className="tw:relative tw:flex tw:flex-col tw:items-center tw:self-stretch"
          // The clue rail runs halfway between this box and the hands (see "Hands.tsx").
          data-play-stacks
          ref={tooltipRef(dragging ? undefined : "Play stacks")}
          style={{ padding: PLAY_STACKS_PADDING }}
        >
          <div
            className="tw:relative tw:flex tw:flex-col tw:phone:flex-row tw:phone:flex-wrap"
            style={{ gap: PLAY_STACK_GAP }}
          >
            {stacks.map((stack) => {
              const suit = variant.suits[stack.suitIndex];
              const name = suit?.displayName ?? "";
              // As on the classic screen, a play stack describes its suit: its name, and the rules
              // that make it special.
              const descriptionHtml =
                getSuitDescriptionHtml(variant, stack.suitIndex) ?? "";

              // What lies under the top card: the card below it, or else the empty stack. It stays
              // in place while a newly played card moves on top of it.
              const belowRank = stack.belowRank ?? stack.baseRank;
              const below =
                belowRank === undefined ? (
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
                    rank={belowRank}
                    suitIndex={stack.suitIndex}
                    variant={variant}
                    width={cardWidth}
                  />
                );

              const abbreviation = variant.suitAbbreviations[stack.suitIndex];
              const topNotesHtml =
                stack.topOrder === undefined
                  ? undefined
                  : notes.notesHtml.get(stack.topOrder);
              const stackBaseOrder = getNotedStackBase(
                variant,
                stack.suitIndex,
              );

              return (
                <div
                  // In a column, the labels have the same space on the right, so that the stacks
                  // stay in line with the deck below them.
                  className={
                    suitLabels
                      ? "tw:relative tw:px-(--suit-label-space) tw:phone:px-0"
                      : undefined
                  }
                  key={stack.suitIndex}
                  style={suitLabels ? SUIT_LABEL_VARIABLES : undefined}
                >
                  <div
                    aria-label={
                      stack.topRank === undefined
                        ? `${name}: nothing played`
                        : describeCard(variant, stack.suitIndex, stack.topRank)
                    }
                    className="tw:relative"
                    // A right-click on an empty stack draws an arrow on its stack base, as on the
                    // classic screen (see "arrowAnchor.ts").
                    data-stack-base-arrow={getStackBase(
                      variant,
                      stack.suitIndex,
                    )}
                    // A misplayed card launches over its stack (see "playMotion.ts").
                    data-stack-slot={stack.suitIndex}
                    ref={tooltipRefHtml(dragging ? undefined : descriptionHtml)}
                    role="img"
                  >
                    {stackBaseOrder === undefined ? (
                      // Alt + right-click changes the stack base in a hypothetical (see
                      // "cardClicks.ts").
                      <div
                        data-stack-base={getStackBase(variant, stack.suitIndex)}
                      >
                        {below}
                      </div>
                    ) : (
                      <CardNote notes={notes} order={stackBaseOrder}>
                        <div data-stack-base={stackBaseOrder}>{below}</div>
                      </CardNote>
                    )}
                    {stack.topRank !== undefined && (
                      <div
                        // A click on the card shows the turn on which it was played (see
                        // "cardClicks.ts").
                        className="tw:absolute tw:inset-0 tw:cursor-pointer"
                        data-card-order={stack.topOrder}
                        data-card-place={`${STACK_PLACE_PREFIX}${stack.suitIndex}`}
                        data-play-stack
                      >
                        {stack.topOrder === undefined ? undefined : (
                          <CardNote
                            // The note of the top card comes first, and then the description of its
                            // suit, as on the classic screen. The notes are a block, so one line
                            // break leaves a blank line after them.
                            notes={
                              topNotesHtml === undefined
                                ? notes
                                : {
                                    ...notes,
                                    notesHtml: new Map(notes.notesHtml).set(
                                      stack.topOrder,
                                      `${topNotesHtml}<br>${descriptionHtml}`,
                                    ),
                                  }
                            }
                            order={stack.topOrder}
                          >
                            <CardFace
                              colorblindMode={colorblindMode}
                              note={topNotesHtml !== undefined}
                              noteUnread={notes.unreadNotes.has(stack.topOrder)}
                              rank={stack.topRank}
                              suitIndex={stack.suitIndex}
                              variant={variant}
                              width={cardWidth}
                            />
                          </CardNote>
                        )}
                      </div>
                    )}
                    {stack.label !== "" && (
                      <StackLabel cardWidth={cardWidth} text={stack.label} />
                    )}
                  </div>
                  {suitLabels
                    && suit !== undefined
                    && abbreviation !== undefined && (
                      <SuitLabel
                        abbreviation={abbreviation}
                        colorblindMode={colorblindMode}
                        descriptionHtml={descriptionHtml}
                        showTooltip={!dragging}
                        suit={suit}
                      />
                    )}
                </div>
              );
            })}
            {hole !== undefined && (
              <Hole
                cardWidth={cardWidth}
                colorblindMode={colorblindMode}
                hole={hole}
                variant={variant}
              />
            )}
          </div>
          <ZoneLabel state={zoneState} text="Play" unavailableText="Play" />
        </section>
        {/* In a row, the deck moves down by the stacks' padding, so that its top card is level
            with the cards of the stacks. */}
        <div
          className="tw:contents tw:phone:block tw:phone:pt-(--play-stacks-padding)"
          style={
            {
              "--play-stacks-padding": `${PLAY_STACKS_PADDING}px`,
            } as React.CSSProperties
          }
        >
          {gameEnd === undefined ? (
            <Deck {...deck} cardWidth={cardWidth} />
          ) : (
            <DeckResult
              cardWidth={cardWidth}
              gameEnd={gameEnd}
              reducedMotion={deck.reducedMotion}
            />
          )}
        </div>
      </div>
      {tokens}
    </div>
  );
}

/**
 * The order of the stack base of a suit. Stack bases use the orders after the final card in the
 * deck.
 */
export function getStackBase(
  variant: Variant,
  suitIndex: SuitIndex,
): CardOrder {
  return (getTotalCardsInDeck(variant) + suitIndex) as CardOrder;
}

/**
 * The order of the stack base of a suit, when it takes notes: only in "Throw It in a Hole"
 * variants, as on the classic screen.
 */
export function getNotedStackBase(
  variant: Variant,
  suitIndex: SuitIndex,
): CardOrder | undefined {
  return variant.throwItInAHole ? getStackBase(variant, suitIndex) : undefined;
}

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

/** The back of one card, such as the last card of the deck while the player holds it. */
export function CardBack({
  width,
}: {
  readonly width: number;
}): React.JSX.Element {
  return (
    <div
      className="tw:box-border tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%)] tw:ring-1 tw:ring-game-text/80"
      style={{
        ...CARD_BACK_STYLE,
        width,
        height: width * CARD_HEIGHT_PER_WIDTH,
        borderRadius: width * CARD_CORNER_PER_WIDTH,
      }}
    />
  );
}

/** The size of the count of cards in the deck, in card widths. */
const CARDS_LEFT_SIZE = 0.5;

/** The size of the turns left on the empty deck, and of its caption, in card widths. */
const TURNS_LEFT_SIZE = 0.4;
const TURNS_LEFT_CAPTION_SIZE = 0.17;

/**
 * How the player plays the last card of the deck, when the "Bottom-Deck Blind Plays" option allows
 * it on their turn.
 */
interface DeckPlay {
  /** Whether the player holds the card, so that it is not on the deck. */
  readonly held: boolean;

  /** Whether the player taps the deck for a menu, instead of dragging the card. */
  readonly tapToMove: boolean;

  /** Whether the menu that plays the card is open. */
  readonly menuOpen: boolean;

  /**
   * Whether the card can be discarded now, or `undefined` when it cannot be discarded at all. Only
   * an inverted suit, which plays when it is discarded, can be.
   */
  readonly canDiscard: boolean | undefined;

  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  readonly onTap: () => void;
  readonly onCloseMenu: () => void;
  readonly onPlay: () => void;
  readonly onDiscard: () => void;
}

export interface DeckProps {
  readonly cardsInDeck: number;

  /**
   * The turns left in the game once the deck is empty, or `undefined` if the game has no final
   * round (as in "All or Nothing").
   */
  readonly turnsLeft: number | undefined;

  /** Whether the game has the "Bottom-Deck Blind Plays" option. */
  readonly deckPlays: boolean;

  /** How the player plays the last card of the deck, when they can. */
  readonly play: DeckPlay | undefined;

  /**
   * Which cards can still be in the deck, while the deck shows them, or `undefined` while it shows
   * its back.
   */
  readonly empathy: DeckEmpathy | undefined;

  /**
   * The viewer holds the pointer down on the deck to see which cards can still be in it, or lets
   * go.
   */
  readonly onHoldEmpathy: (held: boolean) => void;

  /** The width of a card in a hand, so that the deck's bubble of possible cards is as large. */
  readonly handCardWidth: number;
  readonly colorblindMode: boolean;
  readonly variant: Variant;
  readonly reducedMotion: boolean;
}

/**
 * The tooltip of the deck, as HTML: the cards or turns left, and what the player can do with it.
 */
function getDeckTooltip(
  cardsInDeck: number,
  turnsLeft: number | undefined,
  deckPlays: boolean,
  play: DeckPlay | undefined,
): string {
  const lines: string[] = [];
  if (cardsInDeck > 0) {
    lines.push(
      `<strong>${cardsInDeck}</strong> ${cardsInDeck === 1 ? "card" : "cards"} left in the deck.`,
    );
  } else if (turnsLeft === undefined) {
    lines.push("The deck is empty.");
  } else {
    lines.push(
      `The deck is empty. <strong>${turnsLeft}</strong> ${turnsLeft === 1 ? "turn" : "turns"} left, then the game ends.`,
    );
  }

  if (deckPlays) {
    lines.push(
      "Bottom-Deck Blind Plays: the player who would draw the last card can play it from the deck instead.",
    );
  }
  if (play !== undefined) {
    lines.push(
      play.tapToMove
        ? "Tap the deck to play its last card."
        : "Drag the deck to the play stacks to play its last card.",
    );
  } else if (cardsInDeck > 0) {
    lines.push(
      "Hold the mouse button down on the deck to see which cards can still be in it.",
    );
  }

  // The tooltip is narrow, so that its lines wrap as in a paragraph. It uses the smaller text of
  // the screen's other tooltips.
  return `<div class="small-tooltip-text tw:max-w-80">${lines.join("<br>")}</div>`;
}

/**
 * The deck: a pile of face-down cards with the number left on top, which gets thinner as it runs
 * low. Once it is empty, it is an empty slot, like an empty play stack, that shows the turns left
 * in the game, as on the classic screen. New cards are drawn from it (see "cardMotion.ts").
 *
 * Held down, it shows which cards can still be in it. When the player can play its last card, it
 * glows in the color of the player's turn, and the player drags it to the play stacks.
 */
function Deck({
  cardsInDeck,
  turnsLeft,
  deckPlays,
  play,
  empathy,
  onHoldEmpathy,
  handCardWidth,
  colorblindMode,
  variant,
  reducedMotion,
  cardWidth,
}: DeckProps & { readonly cardWidth: number }): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const edges = getDeckEdges(cardsInDeck);
  const empty = cardsInDeck === 0;
  // Whoever draws the last card starts the final round, so its count stands out.
  const lastCard = cardsInDeck === 1;
  const finalRound = empty && turnsLeft !== undefined;
  const turns = turnsLeft === 1 ? "turn" : "turns";
  const showEmpathy = empathy !== undefined && !empty;
  // The top card of the deck, while the pointer is over it, so that the bubble of possible cards
  // points at it. The deck tracks the pointer even without a bubble, so that the bubble opens when
  // the viewer holds Space over it, as over a card in a hand.
  const [hoveredTop, setHoveredTop] = useState<HTMLElement>();
  const held = play?.held === true;

  // A tap anywhere else closes the menu.
  const menuOpen = play?.menuOpen === true;
  const onCloseMenu = play?.onCloseMenu;
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const setMenuOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        onCloseMenu?.();
      }
    },
    [onCloseMenu],
  );
  useCloseOnOutsideClick(menuOpen, menuContainerRef, setMenuOpen);
  // In the final round, only the border of the empty slot is faint, so that the turns left stand
  // out.
  let emptyStyle = "";
  if (finalRound) {
    emptyStyle = "tw:border-game-line/60";
  } else if (empty) {
    emptyStyle = "tw:border-game-line tw:opacity-60";
  }

  function onPointerEnter(event: React.PointerEvent<HTMLElement>) {
    setHoveredTop(event.currentTarget);
  }

  function onPointerLeave() {
    setHoveredTop(undefined);
    onHoldEmpathy(false);
  }

  const bubble =
    showEmpathy
    && hoveredTop !== undefined
    && empathy.possibleCards.suits.length > 0
    && createPortal(
      <PossibleCardsBubble
        anchor={hoveredTop}
        bubble={empathy.possibleCards}
        cardWidth={handCardWidth}
        colorblindMode={colorblindMode}
        variant={variant}
      />,
      document.body,
    );

  let face: React.ReactNode;
  if (showEmpathy) {
    face = (
      <CardFace
        colorblindMode={colorblindMode}
        pips={{
          suits: empathy.possibleSuitIndexes.map((suitIndex) => ({
            suitIndex,
            eliminated: false,
            positive: false,
          })),
          ranks: empathy.possibleRanks.map((rank) => ({
            rank,
            eliminated: false,
            positive: false,
          })),
          bubble: undefined,
        }}
        rank={undefined}
        suitIndex={undefined}
        variant={variant}
        width={cardWidth}
      />
    );
  } else if (finalRound) {
    // Smaller than the count of cards, and always with its caption, so that it does not read as
    // cards left.
    face = (
      <span
        className="tw:flex tw:flex-col tw:items-center tw:leading-none tw:font-extrabold"
        data-deck-count
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
    );
  } else {
    face = (
      <span
        className={`tw:font-extrabold ${empty ? "tw:text-game-muted" : "tw:text-white"}`}
        data-deck-count
        style={{
          fontSize: cardWidth * CARDS_LEFT_SIZE,
          color: lastCard ? PACE_HIGH_RISK_COLOR : undefined,
        }}
      >
        {cardsInDeck}
      </span>
    );
  }

  const topClass = `tw:absolute tw:top-0 tw:left-0 tw:box-border tw:flex tw:items-center tw:justify-center tw:border-0 tw:p-0 ${
    empty
      ? "tw:border-2 tw:border-dashed"
      : "tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%)] tw:ring-1 tw:ring-game-text/80"
  } ${emptyStyle} ${held ? "tw:opacity-30" : ""}`;
  const topStyle = {
    ...(!empty && !showEmpathy && CARD_BACK_STYLE),
    width: cardWidth,
    borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
    height,
  };

  return (
    <div
      aria-label={
        finalRound
          ? `${turnsLeft} ${turns} left. Then the game ends.`
          : `${cardsInDeck} cards in the deck`
      }
      className="tw:flex tw:flex-col tw:items-center tw:gap-1.5"
      ref={tooltipRefHtml(
        showEmpathy
          ? undefined
          : getDeckTooltip(cardsInDeck, turnsLeft, deckPlays, play),
      )}
      // The tooltip would cover the cards that the deck shows while it is held down.
      role={play === undefined ? "img" : "group"}
    >
      <div
        className="tw:relative"
        ref={menuContainerRef}
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
        {play !== undefined && !held && (
          // The glow around the last card says that the player can play it. It pulses, except with
          // "Reduced motion".
          <div
            aria-hidden="true"
            className={`tw:pointer-events-none tw:absolute tw:top-0 tw:left-0 tw:outline-3 tw:outline-offset-2 tw:outline-game-turn tw:outline-solid tw:shadow-[0_0_14px_4px_var(--game-screen-turn)] ${
              reducedMotion ? "" : "tw:animate-pulse"
            }`}
            style={{
              width: cardWidth,
              height,
              borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
            }}
          />
        )}
        {play === undefined ? (
          <div
            className={topClass}
            data-deck
            // Held down, the deck shows which cards can still be in it, as on the classic screen.
            onPointerCancel={() => {
              onHoldEmpathy(false);
            }}
            onPointerDown={(event) => {
              if (
                event.button !== 0
                || event.shiftKey
                || event.altKey
                || event.metaKey
              ) {
                return;
              }
              onHoldEmpathy(true);
            }}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onPointerUp={() => {
              onHoldEmpathy(false);
            }}
            style={topStyle}
          >
            {face}
            {bubble}
          </div>
        ) : (
          <button
            aria-expanded={play.tapToMove ? play.menuOpen : undefined}
            aria-haspopup={play.tapToMove ? "menu" : undefined}
            aria-label={
              play.tapToMove
                ? "Play the last card of the deck"
                : "Drag the last card of the deck to the play stacks to play it"
            }
            className={`${topClass} ${
              play.tapToMove
                ? "tw:cursor-pointer"
                : "tw:cursor-grab tw:touch-none"
            }`}
            data-deck
            onClick={play.tapToMove ? play.onTap : undefined}
            onPointerDown={play.tapToMove ? undefined : play.onPointerDown}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            style={topStyle}
            type="button"
          >
            {face}
            {bubble}
          </button>
        )}
        {play !== undefined && menuOpen && (
          <Menu align="center" className="tw:min-w-40" side="below">
            <button
              className={MENU_ICON_ITEM_CLASS}
              onClick={play.onPlay}
              role="menuitem"
              type="button"
            >
              <i aria-hidden="true" className={`${MENU_ICON_CLASS} fa-play`} />
              Play
            </button>
            {play.canDiscard !== undefined && (
              <button
                className={MENU_ICON_ITEM_CLASS}
                disabled={!play.canDiscard}
                onClick={play.onDiscard}
                role="menuitem"
                type="button"
              >
                <i
                  aria-hidden="true"
                  className={`${MENU_ICON_CLASS} fa-trash`}
                />
                Discard
              </button>
            )}
          </Menu>
        )}
      </div>
    </div>
  );
}

/**
 * The icon and the short caption of each way that a game can end. The caption has one or two lines,
 * so that it fits on a card. The tooltip says the rest.
 */
const RESULT_FACES = {
  normal: {
    icon: "fa-flag-checkered",
    caption: ["Finished"],
  },
  strikeout: {
    icon: "fa-bomb",
    caption: ["Strike", "out"],
  },
  timeout: {
    icon: "fa-hourglass-end",
    caption: ["Out of", "time"],
  },
  terminatedByPlayer: {
    icon: "fa-stop-circle",
    caption: ["Ended", "early"],
  },
  terminatedByVote: {
    icon: "fa-vote-yea",
    caption: ["Ended", "by vote"],
  },
  speedrunFail: {
    icon: "fa-bolt",
    caption: ["Speedrun", "failed"],
  },
  idleTimeout: {
    icon: "fa-bed",
    caption: ["Idle"],
  },
  characterSoftlock: {
    icon: "fa-lock",
    caption: ["No", "clues"],
  },
  allOrNothingFail: {
    icon: "fa-times-circle",
    caption: ["Not", "perfect"],
  },
  allOrNothingSoftlock: {
    icon: "fa-lock",
    caption: ["Stuck"],
  },
} as const satisfies Record<
  EndCondition,
  { readonly icon: string; readonly caption: readonly string[] }
>;

/** The size of the icon, in card widths. */
const ICON_SIZE = 0.36;

/** The largest size of the caption, in card widths. */
const CAPTION_MAX_SIZE = 0.2;

/** The widest that the caption can be, in card widths. */
const CAPTION_MAX_WIDTH = 0.86;

/** About how wide a letter of the caption is, in its font size. */
const CAPTION_LETTER_WIDTH = 0.62;

/** How long the card takes to turn over, in milliseconds. */
const FLIP_MILLISECONDS = 400;

/**
 * How the game ended, in the place of the deck, on the turn on which the game ended. It is a card
 * with an icon and a few words, and its tooltip says the rest. It is red when the players lost or
 * did not finish the game, and white when they finished it. It turns over when it appears, so that
 * the players see that the game is over. It takes the same room as the deck, so that nothing around
 * it moves.
 */
function DeckResult({
  gameEnd,
  cardWidth,
  reducedMotion,
}: {
  readonly gameEnd: GameEnd;
  readonly cardWidth: number;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const face = RESULT_FACES[gameEnd.endCondition];
  const longestLine = Math.max(...face.caption.map((line) => line.length));
  const captionSize = Math.min(
    cardWidth * CAPTION_MAX_SIZE,
    (cardWidth * CAPTION_MAX_WIDTH) / (longestLine * CAPTION_LETTER_WIDTH),
  );

  const cardRef = useRef<HTMLDivElement>(null);
  // Only when it appears, not when the setting changes.
  const flip = useRef(!reducedMotion);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (card === null || !flip.current) {
      return undefined;
    }
    const animation = card.animate(
      [
        { transform: "perspective(600px) rotateY(90deg)" },
        {
          transform: "perspective(600px) rotateY(-8deg) scale(1.08)",
          offset: 0.7,
        },
        { transform: "none" },
      ],
      {
        duration: FLIP_MILLISECONDS,
        easing: "ease-out",
      },
    );
    return () => {
      animation.cancel();
    };
  }, []);

  return (
    <div
      aria-label={`Game over: ${gameEnd.summary}`}
      className="tw:flex tw:flex-col tw:items-center tw:gap-1.5"
      ref={tooltipRefHtml(
        `<div class="small-tooltip-text tw:max-w-80">${getGameEndTooltipHtml(gameEnd)}</div>`,
      )}
      role="img"
    >
      <div
        className="tw:relative"
        style={{
          width: cardWidth + DECK_PILE_DEPTH,
          height: height + DECK_PILE_DEPTH,
        }}
      >
        <div
          className={`tw:absolute tw:top-0 tw:left-0 tw:box-border tw:flex tw:flex-col tw:items-center tw:justify-center tw:leading-none tw:font-extrabold tw:text-card-ink tw:uppercase tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%)] tw:ring-1 tw:ring-game-text/80 ${
            gameEnd.endCondition === "normal"
              ? "tw:bg-game-text"
              : "tw:bg-game-error"
          }`}
          data-deck
          data-result={gameEnd.endCondition}
          ref={cardRef}
          style={{
            width: cardWidth,
            height,
            borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
          }}
        >
          <i
            aria-hidden="true"
            className={`fas ${face.icon}`}
            style={{ fontSize: cardWidth * ICON_SIZE }}
          />
          <span
            className="tw:mt-[0.5em] tw:text-center tw:whitespace-nowrap"
            style={{ fontSize: captionSize }}
          >
            {face.caption.map((line) => (
              <span className="tw:block" key={line}>
                {line}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The discarded cards, one row for each suit, where the player drops a card to discard it. Each
 * card is a button that shows the turn on which it was discarded. The pile keeps room for a row of
 * every suit, so that it stays the same size as cards are discarded. A row that would be wider than
 * the pile overlaps its cards more, so that it still fits.
 */
export function DiscardPile({
  rows,
  variant,
  colorblindMode,
  cardWidth,
  zoneState,
  atMaxClues,
  doubleDiscard,
  realLifeMode,
  onShowDiscard,
  notes,
  reducedMotion,
}: {
  readonly rows: ReadonlyArray<readonly DiscardView[]>;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly cardWidth: number;
  readonly zoneState: ZoneState;

  /** Whether the team has every clue token, so that no one can discard. */
  readonly atMaxClues: boolean;

  /**
   * Whether the last discard makes a "Double Discard" situation, which the pile shows with the
   * "H-Group Conventions" setting, as on the classic screen.
   */
  readonly doubleDiscard: boolean;

  /** Whether the "Real life mode" setting is on, which leaves out the borders of the pile. */
  readonly realLifeMode: boolean;
  readonly onShowDiscard: (order: CardOrder) => void;
  readonly notes: CardNotes;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const showNoDiscard = atMaxClues && !realLifeMode;
  const showDoubleDiscard = doubleDiscard && !atMaxClues && !realLifeMode;

  // As on the classic screen, each row covers all of the row above but its ranks.
  const rowStep =
    cardWidth * (RANK_BOTTOM_PER_WIDTH + DISCARD_ROW_GAP_PER_WIDTH);
  const rowsHeight = height + (variant.suits.length - 1) * rowStep;
  const [rowsElement, setRowsElement] = useState<HTMLDivElement | null>(null);
  const rowsWidth = useElementSize(rowsElement).width;
  const cardStep = cardWidth * (1 - DISCARD_OVERLAP_PER_WIDTH);
  function getCardStep(cards: number): number {
    // Before the rows are measured, their width is 0.
    return rowsWidth === 0 || cards <= 1
      ? cardStep
      : Math.min(cardStep, (rowsWidth - cardWidth) / (cards - 1));
  }

  return (
    <section
      aria-label="Discards"
      className="tw:relative tw:box-border tw:flex tw:flex-col tw:gap-3 tw:rounded-game-panel tw:px-4.5 tw:py-4"
      // A right-click beside the cards points the arrow at the pile (see "arrowAnchor.ts").
      data-discard-pile
      ref={tooltipRefHtml(
        getDiscardPileTooltipHtml(zoneState, showNoDiscard, showDoubleDiscard),
      )}
    >
      {/* While the player drags a card, the well of the pile fades out, so that the pile is part of
          the dark box of the discard column behind it (see "DropZones.tsx"). */}
      <div
        aria-hidden="true"
        className={`tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] ${WELL_CLASS} ${
          reducedMotion ? "" : "tw:transition-opacity tw:ease-out"
        } ${zoneState === "idle" ? "" : "tw:opacity-0"}`}
        style={{ transitionDuration: `${DROP_ZONE_FADE_MILLISECONDS}ms` }}
      />
      {/* A faint trash can behind the cards names the pile without a heading. At max clues, a
          sign in the color of clues takes its place, to show that no one can discard. */}
      {showNoDiscard ? (
        <NoDiscardSign reducedMotion={reducedMotion} size={cardWidth * 1.5} />
      ) : (
        <i
          aria-hidden="true"
          className={`fas fa-trash-alt tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:text-game-text ${
            isRefusing(zoneState) ? "tw:opacity-10" : "tw:opacity-20"
          }`}
          data-discard-pile-icon
          style={{ fontSize: cardWidth * 1.125 }}
        />
      )}
      <div
        className={`tw:relative tw:flex tw:flex-col ${
          isRefusing(zoneState) ? "tw:opacity-60" : ""
        }`}
        ref={setRowsElement}
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
                  marginLeft: i === 0 ? 0 : getCardStep(row.length) - cardWidth,
                }}
              >
                <button
                  aria-label={`${describeCard(variant, card.suitIndex, card.rank)}. Show the turn it was discarded`}
                  className="tw:relative tw:block tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:transition-transform tw:hover:z-10 tw:hover:-translate-y-1.5 tw:focus-visible:z-10 tw:focus-visible:-translate-y-1.5"
                  data-card-order={card.order}
                  data-card-place={`${DISCARD_PLACE_PREFIX}${rowIndex}-${i}`}
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
      {/* At max clues, a dashed border in the color of clues shows that no one can discard,
          before anyone picks up a card and while they drag one. It has the color of the clue
          count, which is the reason. It is last, so that the well does not darken it. "Real life
          mode" leaves it out. */}
      {showNoDiscard && <NoDiscardOutline reducedMotion={reducedMotion} />}
      {/* In a "Double Discard" situation, a yellow border warns the next player before they
          discard. */}
      {showDoubleDiscard && (
        <div
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:outline-2 tw:-outline-offset-2 tw:outline-game-caution/80 tw:outline-solid"
          data-double-discard
        />
      )}
    </section>
  );
}

/**
 * The tooltip of the discard pile, in HTML. It has none while the player drags a card. A second
 * line explains why no one can discard or warns of a Double Discard, like the tooltip of the clue
 * tokens.
 */
function getDiscardPileTooltipHtml(
  zoneState: ZoneState,
  noDiscard: boolean,
  doubleDiscard: boolean,
): string | undefined {
  if (zoneState !== "idle") {
    return undefined;
  }
  const lines = ["Discard pile"];
  if (noDiscard) {
    lines.push(
      `The team has all ${MAX_CLUES} clue tokens, so no one can discard.`,
    );
  } else if (doubleDiscard) {
    lines.push(
      "Double Discard: the card just discarded is still needed, so the chop of the player whose turn it is could be its last copy.",
    );
  }
  return `<span class="small-tooltip-text">${lines.join("<br>")}</span>`;
}

/** How long the discard pile pulses when the team gets to max clues, in milliseconds. */
const NO_DISCARD_PULSE_MILLISECONDS = 900;

/**
 * The border and tint of the discard pile at max clues. When it shows, it pulses once in the color
 * of clues, so that the players notice that no one can discard. "Reduced motion" leaves out the
 * pulse.
 */
function NoDiscardOutline({
  reducedMotion,
}: {
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outline = ref.current;
    if (outline === null || reducedMotion) {
      return undefined;
    }

    const animation = outline.animate(
      [
        { boxShadow: "inset 0 0 0 12px var(--clue-border)" },
        { boxShadow: "inset 0 0 0 0 transparent" },
      ],
      {
        duration: NO_DISCARD_PULSE_MILLISECONDS,
        easing: "ease-out",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:bg-clue/8 tw:outline-2 tw:-outline-offset-2 tw:outline-clue tw:outline-dashed"
      data-no-discard
      ref={ref}
    />
  );
}

/**
 * The faint sign behind the cards of the discard pile at max clues. It is the sign that shows over
 * the pile when a player tries to discard then. When it shows, it pops in, except with "Reduced
 * motion".
 */
function NoDiscardSign({
  size,
  reducedMotion,
}: {
  readonly size: number;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const sign = ref.current;
    if (sign === null || reducedMotion) {
      return undefined;
    }

    const animation = sign.animate(
      [
        {
          opacity: 0,
          scale: 0.6,
        },
        {
          opacity: 1,
          scale: 1.12,
          offset: 0.6,
        },
        {
          opacity: 1,
          scale: 1,
        },
      ],
      {
        duration: NO_DISCARD_PULSE_MILLISECONDS / 2,
        easing: "ease-out",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:opacity-40"
      data-discard-pile-icon
      style={{
        width: size,
        height: size,
      }}
    >
      <NoEntrySvg className="tw:size-full tw:text-clue" ref={ref} />
    </div>
  );
}

/** A circle with a slash. */
function NoEntrySvg({
  className,
  ref,
}: {
  readonly className: string;
  readonly ref?: React.Ref<SVGSVGElement>;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      ref={ref}
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
  );
}

/**
 * The sign over the discard pile while the player holds a card over it and the team cannot discard.
 * It is a circle with a slash, not an X, because an X on this screen is a strike. It is in the
 * color of clues, because the team has too many clues to discard. It is larger than the held card,
 * so that the card does not cover it. It is in the middle of the pile, around the label.
 */
function NoEntrySign(): React.JSX.Element {
  return (
    <div className="tw:pointer-events-none tw:absolute tw:inset-3 tw:z-10">
      <NoEntrySvg className="tw:size-full tw:text-clue tw:drop-shadow-[0_2px_6px_rgb(0_0_0/60%)]" />
    </div>
  );
}

/**
 * The box of the clue tokens and the strikes. Under the deck, the clue count is above the strikes,
 * so that the column stays narrow and short. When the columns stack, they are side by side.
 */
const TOKENS_BOX_CLASS = `tw:relative tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-[8px] tw:rounded-game-panel tw:px-1.5 tw:py-[8px] ${WELL_CLASS}`;

/**
 * The height of the tokens under the deck, with the gap above them. It is the sum of the box's
 * classes, which are in pixels, not "rem", so that this sum stays right: 8 pixels of padding above
 * and below, the clue count (34 pixels), a gap of 8 pixels, and the strike boxes (28 pixels).
 */
export const TABLE_TOKENS_HEIGHT = PLAY_AREA_GAP + 8 + 34 + 8 + 28 + 8;

/**
 * The color of the clue count: it stands out only at the limits, and with one clue left, as on the
 * classic screen. "Real life mode" leaves the colors out.
 */
function getClueCountClass(
  atMaxClues: boolean,
  outOfClues: boolean,
  oneClueLeft: boolean,
  realLifeMode: boolean,
): string {
  if (realLifeMode) {
    return "tw:text-game-text";
  }
  if (atMaxClues) {
    return "tw:text-clue";
  }
  if (outOfClues) {
    return "tw:text-game-muted";
  }
  if (oneClueLeft) {
    return "tw:text-game-caution";
  }
  return "tw:text-game-text";
}

/**
 * The tooltip of the clue tokens, in HTML. It gives the count out of the maximum. Under it, a
 * second line explains the color of the count. The count is in the tokens that the players see, not
 * in the half tokens of "Clue Starved" variants, so its maximum is the same in every variant.
 */
function getClueTokensTooltipHtml(
  clues: number,
  atMaxClues: boolean,
  outOfClues: boolean,
  oneClueLeft: boolean,
  realLifeMode: boolean,
): string {
  const lines = [`Clue tokens: ${clues} / ${MAX_CLUES}`];
  if (!realLifeMode) {
    if (outOfClues) {
      lines.push("No one can give a clue.");
    } else if (oneClueLeft) {
      lines.push("The team has one clue left.");
    } else if (atMaxClues) {
      lines.push("No one can discard.");
    }
  }
  return `<span class="small-tooltip-text">${lines.join("<br>")}</span>`;
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
      className={`tw:size-[21px] tw:phone:size-[22px] ${upcoming ? "tw:text-game-muted tw:opacity-35" : "tw:text-critical"}`}
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
 * The clue tokens and the strikes, below the deck, or beside the discard pile in the phone layout.
 * They are real tokens in the physical game, so they sit on the table instead of with the numbers
 * along the bottom.
 */
export function TableTokens({
  clues,
  atMaxClues,
  outOfClues,
  oneClueLeft,
  realLifeMode,
  strikes,
  strikesHidden,
  strikeSegments,
  onShowStrike,
  placementClass,
}: {
  readonly clues: number;

  /** Whether the team has every clue token, so that no one can discard. */
  readonly atMaxClues: boolean;

  /** Whether the team has too few clue tokens to give a clue. */
  readonly outOfClues: boolean;

  /** Whether the team has the clue tokens for exactly one clue. */
  readonly oneClueLeft: boolean;

  /**
   * Whether the "Real life mode" setting is on, which leaves out the warnings of the clue count.
   */
  readonly realLifeMode: boolean;
  readonly strikes: number;

  /**
   * Whether the viewer cannot see the strikes, as in "Throw It in a Hole" variants. Each box then
   * shows a question mark.
   */
  readonly strikesHidden: boolean;

  /**
   * For each strike box, the segment of the strike that it stands for, or `undefined` when it does
   * not stand for one that the viewer may see. Clicking a box with a strike shows its turn.
   */
  readonly strikeSegments: ReadonlyArray<number | undefined>;
  readonly onShowStrike: (segment: number) => void;

  /** Where the box sits in its column or row. */
  readonly placementClass: string;
}): React.JSX.Element {
  return (
    <div className={`tw:shrink-0 ${placementClass} ${TOKENS_BOX_CLASS}`}>
      <section
        aria-label="Clue tokens"
        className="tw:flex tw:h-[34px] tw:items-center tw:gap-1.5"
        ref={tooltipRefHtml(
          getClueTokensTooltipHtml(
            clues,
            atMaxClues,
            outOfClues,
            oneClueLeft,
            realLifeMode,
          ),
        )}
      >
        {/* One large number: the count that players check most. It stands out only at the
            limits, where the rules change what the team can do: in the color of clues at the
            maximum, when someone must clue, and gray with none, when no one can. It is yellow
            with one clue left, as a warning before the limit. */}
        <ClueTokenIcon className="tw:size-[24px]" />
        <span
          className={`tw:text-[34px] tw:leading-none tw:font-extrabold ${getClueCountClass(atMaxClues, outOfClues, oneClueLeft, realLifeMode)}`}
          // A spark flies to the count when a completed stack gives a clue back (see
          // "scoreMotion.ts").
          data-clue-count
        >
          {clues}
        </span>
      </section>
      <section aria-label="Strikes">
        <div
          aria-label={
            strikesHidden
              ? "The strikes are hidden"
              : `${strikes} of ${MAX_STRIKES} strikes`
          }
          className="tw:group tw:relative tw:isolate tw:flex tw:h-[28px] tw:items-center tw:gap-1.5"
          ref={tooltipRefHtml(
            `<span class="small-tooltip-text">${
              strikesHidden
                ? "Strikes<br>In this variant, the players cannot see them."
                : `Strikes: ${strikes} / ${MAX_STRIKES}<br>The game ends at ${MAX_STRIKES} strikes.`
            }</span>`,
          )}
          role="group"
        >
          {/* The row has one tooltip. While it is open, a frame around the whole row shows what
              it explains. A box with a strike to show has its own tooltip, which shows instead. */}
          <span
            aria-hidden="true"
            className="tw:pointer-events-none tw:absolute tw:-inset-[4px] tw:-z-1 tw:rounded-game-control tw:bg-game-text/8 tw:opacity-0 tw:outline-2 tw:outline-game-line tw:outline-solid tw:group-data-tooltip-open:opacity-100"
          />
          {[...eRange(MAX_STRIKES)].map((i) => {
            const segment = strikeSegments[i];
            const struck = !strikesHidden && i < strikes;
            // In a replay, a strike that happens later in the game shows faded, as on the classic
            // screen. Clicking it goes to its turn.
            const upcoming = !struck && segment !== undefined;
            const className = `tw:box-border tw:flex tw:size-[28px] tw:items-center tw:justify-center tw:rounded-game-control tw:border-2 tw:border-solid tw:p-0 ${
              struck
                ? "tw:border-critical tw:bg-critical/15"
                : "tw:border-game-line tw:bg-transparent"
            }`;
            let mark: React.ReactNode;
            if (strikesHidden) {
              mark = (
                <span className="tw:text-[17px] tw:leading-none tw:font-bold tw:text-game-muted">
                  ?
                </span>
              );
            } else if (struck) {
              mark = <StrikeMark />;
            } else if (upcoming) {
              mark = <StrikeMark upcoming />;
            }
            return segment === undefined ? (
              <span className={className} data-strike-box={i} key={i}>
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
      {/* With no clues, a white dashed border around the box shows that no one can give a clue, as
          the discard pile has one at the maximum to show that no one can discard. It is last, so
          that the well does not darken it. "Real life mode" leaves it out. */}
      {outOfClues && !realLifeMode && (
        <div
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:outline-2 tw:-outline-offset-2 tw:outline-game-text tw:outline-dashed"
        />
      )}
    </div>
  );
}
