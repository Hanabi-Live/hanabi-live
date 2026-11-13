import type {
  CardOrder,
  Rank,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import { MAX_STRIKES } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { forwardRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { PACE_HIGH_RISK_COLOR } from "../ui/paceRiskColor.ts";
import { CARD_HEIGHT_PER_WIDTH, CardFace, describeCard } from "./Card.tsx";
import { Pip } from "./Pip.tsx";

/** How far each discarded card covers the one before it in its row, as a fraction of its width. */
const DISCARD_OVERLAP_PER_WIDTH = 0.4;

/** How far each row of the discard pile covers the row above, as a fraction of a card's height. */
const DISCARD_ROW_OVERLAP_PER_HEIGHT = 0.42;

/** How much of the suit's color tints an empty play stack, in percent. */
const EMPTY_STACK_TINT_PERCENT = 45;

/**
 * The look of an empty play stack: a soft fill and an edge in its suit's color, as on the classic
 * screen, so that the fireworks are in color before anyone plays them.
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

/** The look of a drop target, which changes while the player drags a card. */
export type ZoneState = "idle" | "available" | "hovered" | "unavailable";

const zoneClasses: Record<ZoneState, string> = {
  idle: "tw:bg-game-zone",
  available: "tw:bg-game-zone tw:inset-ring-2 tw:inset-ring-game-line",
  hovered: "tw:bg-clue/15 tw:inset-ring-3 tw:inset-ring-clue",
  unavailable: "tw:bg-game-zone tw:opacity-60",
};

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
      className={`tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:rounded-full tw:px-3.5 tw:py-1.5 tw:text-center tw:font-bold tw:whitespace-nowrap tw:shadow-lg ${
        state === "hovered"
          ? "tw:bg-clue tw:text-card-ink"
          : "tw:bg-game-text tw:text-card-ink"
      }`}
    >
      {state === "unavailable" ? unavailableText : text}
    </span>
  );
}

/** The play stacks, where the player drops a card to play it, with the deck below them. */
export const PlayArea = forwardRef<
  HTMLElement,
  {
    readonly stacks: readonly StackView[];
    readonly variant: Variant;
    readonly colorblindMode: boolean;
    readonly cardWidth: number;
    readonly cardsInDeck: number;
    readonly zoneState: ZoneState;
  }
>(
  (
    { stacks, variant, colorblindMode, cardWidth, cardsInDeck, zoneState },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;

    return (
      <div className="tw:flex tw:shrink-0 tw:flex-col tw:items-center tw:gap-3 tw:narrow-980:flex-row tw:narrow-980:items-start">
        <section
          aria-label="Play stacks"
          className={`tw:relative tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-[18px] tw:px-4.5 tw:py-4 ${zoneClasses[zoneState]}`}
          // The clue rail runs halfway between this box and the hands (see "Hands.tsx").
          data-play-stacks
          ref={ref}
        >
          <div className="tw:flex tw:flex-col tw:gap-2 tw:narrow-980:flex-row tw:narrow-980:flex-wrap">
            {stacks.map((stack) => {
              const suit = variant.suits[stack.suitIndex];
              const name = suit?.displayName ?? "";

              // What lies under the top card: the card below it, or else the empty stack. It stays
              // in place while a newly played card moves on top of it.
              const below =
                stack.belowRank === undefined ? (
                  <div
                    className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-[10px] tw:border-2 tw:border-solid tw:border-game-line"
                    style={{
                      width: cardWidth,
                      height,
                      ...(suit !== undefined
                        && getEmptyStackStyle(suit, colorblindMode)),
                    }}
                  >
                    {suit !== undefined && (
                      <Pip
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

              return (
                <div
                  aria-label={
                    stack.topRank === undefined
                      ? `${name}: nothing played`
                      : describeCard(variant, stack.suitIndex, stack.topRank)
                  }
                  className="tw:relative"
                  // A misplayed card launches over its stack (see "playMotion.ts").
                  data-stack-slot={stack.suitIndex}
                  key={stack.suitIndex}
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
                      <CardFace
                        colorblindMode={colorblindMode}
                        rank={stack.topRank}
                        suitIndex={stack.suitIndex}
                        variant={variant}
                        width={cardWidth}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ZoneLabel state={zoneState} text="Play" unavailableText="Play" />
        </section>
        <Deck cardsInDeck={cardsInDeck} cardWidth={cardWidth} />
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
  { minCards: 20, edges: 3 },
  { minCards: 8, edges: 2 },
  { minCards: 2, edges: 1 },
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

/**
 * The deck: a pile of face-down cards with the number left on top, which gets thinner as it runs
 * low. Once it is empty, it is an empty slot, like an empty play stack. New cards are drawn from it
 * (see "cardMotion.ts").
 */
function Deck({
  cardsInDeck,
  cardWidth,
}: {
  readonly cardsInDeck: number;
  readonly cardWidth: number;
}): React.JSX.Element {
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const edges = getDeckEdges(cardsInDeck);
  const empty = cardsInDeck === 0;
  // Whoever draws the last card starts the final round, so it stands out, and its label says so.
  // Otherwise the pile has no label: the count on its top card is enough.
  const lastCard = cardsInDeck === 1;
  let label: string | undefined;
  if (lastCard) {
    label = "Last card";
  } else if (empty) {
    label = "Final round";
  }

  return (
    <div
      aria-label={`${cardsInDeck} cards in the deck`}
      className="tw:flex tw:flex-col tw:items-center tw:gap-1.5"
      ref={tooltipRef("Cards left in the deck")}
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
              className="tw:absolute tw:rounded-[10px] tw:ring-1 tw:ring-game-text/80"
              // The cards under the top one only show their edges, so they keep their order.
              key={offset}
              style={{
                ...CARD_BACK_STYLE,
                width: cardWidth,
                height,
                left: offset,
                top: offset,
              }}
            />
          );
        })}
        <div
          className={`tw:absolute tw:top-0 tw:left-0 tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-[10px] ${
            empty
              ? "tw:border-2 tw:border-dashed tw:border-game-line tw:opacity-60"
              : "tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%)] tw:ring-1 tw:ring-game-text/80"
          }`}
          data-deck
          style={{
            ...(!empty && CARD_BACK_STYLE),
            width: cardWidth,
            height,
          }}
        >
          <span
            className={`tw:font-extrabold ${empty ? "tw:text-game-muted" : "tw:text-white"}`}
            style={{
              fontSize: cardWidth * 0.5,
              color: lastCard ? PACE_HIGH_RISK_COLOR : undefined,
            }}
          >
            {cardsInDeck}
          </span>
        </div>
      </div>
      {label !== undefined && (
        <span
          className={`tw:text-[13px] tw:whitespace-nowrap ${lastCard ? "tw:font-bold" : "tw:text-game-muted"}`}
          style={{ color: lastCard ? PACE_HIGH_RISK_COLOR : undefined }}
        >
          {label}
        </span>
      )}
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
    },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
    const rowsHeight =
      height
      + (variant.suits.length - 1)
        * height
        * (1 - DISCARD_ROW_OVERLAP_PER_HEIGHT);

    return (
      <section
        aria-label="Discards"
        className={`tw:relative tw:box-border tw:flex tw:flex-col tw:gap-3 tw:rounded-[18px] tw:px-4.5 tw:py-4 ${zoneClasses[zoneState]} ${
          // At max clues, a quiet dashed border in the clue color shows that no one can discard,
          // before anyone picks up a card.
          atMaxClues && zoneState === "idle"
            ? "tw:outline-2 tw:-outline-offset-2 tw:outline-clue/60 tw:outline-dashed"
            : ""
        }`}
        ref={ref}
      >
        {/* A faint trash can behind the cards names the pile without a heading. */}
        <i
          aria-hidden="true"
          className="fas fa-trash-alt tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:text-game-text tw:opacity-20"
          style={{ fontSize: cardWidth * 1.125 }}
        />
        <div
          className="tw:relative tw:flex tw:flex-col"
          style={{ height: rowsHeight }}
        >
          {rows.map((row, rowIndex) => (
            <div
              className="tw:flex"
              key={row[0]?.order}
              style={{
                marginTop:
                  rowIndex === 0 ? 0 : -height * DISCARD_ROW_OVERLAP_PER_HEIGHT,
              }}
            >
              {row.map((card, i) => (
                <button
                  aria-label={`${describeCard(variant, card.suitIndex, card.rank)}. Show the turn it was discarded`}
                  className="tw:relative tw:shrink-0 tw:cursor-pointer tw:rounded-[9px] tw:border-0 tw:bg-transparent tw:p-0 tw:transition-transform tw:hover:z-10 tw:hover:-translate-y-1.5 tw:focus-visible:z-10 tw:focus-visible:-translate-y-1.5"
                  data-card-order={card.order}
                  data-card-place={`discard-${rowIndex}-${i}`}
                  key={card.order}
                  onClick={() => {
                    onShowDiscard(card.order);
                  }}
                  ref={tooltipRef(
                    "Click to go to the turn this card was discarded.",
                  )}
                  style={{
                    marginLeft:
                      i === 0 ? 0 : -cardWidth * DISCARD_OVERLAP_PER_WIDTH,
                  }}
                  type="button"
                >
                  <CardFace
                    colorblindMode={colorblindMode}
                    rank={card.rank}
                    suitIndex={card.suitIndex}
                    variant={variant}
                    width={cardWidth}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
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
 * A bubble for the clue tokens or the strikes: its value, centered. The two bubbles have the same
 * layout, so that their values line up.
 */
const TOKEN_BUBBLE_CLASS =
  "tw:relative tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:rounded-[18px] tw:bg-game-zone tw:px-3 tw:py-5";

/** The row of a value, as tall as the strike boxes, so that the two values line up. */
const TOKEN_VALUE_CLASS = "tw:flex tw:h-[32px] tw:items-center";

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

/** The color of the body of the bomb icon: blue, like the bombs in "The Legend of Zelda". */
const BOMB_BODY_COLOR = "#3d6fe0";

/** The color of the lit spark on the fuse of the bomb icon. */
const BOMB_SPARK_COLOR = "#ffd43b";

/**
 * A bomb, the usual name for a strike: a round blue body with a shine, a gray cap, and a lit fuse.
 */
function BombIcon(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="tw:mr-0.5 tw:size-[26px] tw:text-game-muted"
      viewBox="0 0 24 24"
    >
      <path
        d="M17.2 6.8Q18.4 3.2 21.2 3.4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={1.6}
      />
      <rect
        fill="currentColor"
        height={3.6}
        rx={1}
        transform="rotate(45 16 8)"
        width={5}
        x={13.5}
        y={6.2}
      />
      <circle cx={10.5} cy={14} fill={BOMB_BODY_COLOR} r={8} />
      <ellipse
        cx={7.6}
        cy={10.8}
        fill="white"
        fillOpacity={0.5}
        rx={2.4}
        ry={1.4}
        transform="rotate(-40 7.6 10.8)"
      />
      <path
        d="M21.4 0.6 22.2 2.6 24 3.4 22.2 4.2 21.4 6.2 20.6 4.2 18.8 3.4 20.6 2.6Z"
        fill={BOMB_SPARK_COLOR}
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
      className={`tw:size-[22px] ${upcoming ? "tw:text-game-muted tw:opacity-35" : "tw:text-critical"}`}
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

/** The tint of the strikes bubble: none without strikes, and strongest one strike from losing. */
function getStrikeBubbleClass(strikes: number): string {
  if (strikes >= MAX_STRIKES - 1) {
    return "tw:bg-critical/20 tw:ring-2 tw:ring-critical/70";
  }
  if (strikes > 0) {
    return "tw:bg-critical/10 tw:ring-1 tw:ring-critical/40";
  }
  return "";
}

/**
 * The clue tokens and the strikes, below the discard pile. They are real tokens in the physical
 * game, so they sit on the table instead of with the numbers along the bottom.
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
    // Two bubbles side by side. They share their height, so that their values line up.
    <div className="tw:flex tw:shrink-0 tw:gap-3">
      <section
        aria-label="Clue tokens"
        className={TOKEN_BUBBLE_CLASS}
        ref={tooltipRef("Clue tokens")}
      >
        {/* One large number: the count that players check most. It stands out only at the
            limits, where the rules change what the team can do: in the color of clues at the
            maximum, when someone must clue, and gray with none, when no one can. */}
        <div className={`${TOKEN_VALUE_CLASS} tw:gap-2`}>
          <ClueTokenIcon />
          <span
            className={`tw:text-[34px] tw:leading-none tw:font-extrabold ${getClueCountClass(atMaxClues, outOfClues)}`}
            // A spark flies to the count when a completed stack gives a clue back (see
            // "scoreMotion.ts").
            data-clue-count
          >
            {clues}
          </span>
        </div>
        {(atMaxClues || outOfClues) && (
          // A badge on the bottom edge of the bubble, so that the count stays centered.
          <span
            className={`tw:absolute tw:bottom-0 tw:left-1/2 tw:-translate-x-1/2 tw:translate-y-1/2 tw:rounded-lg tw:px-2.5 tw:py-1 tw:text-[13px] tw:leading-none tw:font-bold tw:whitespace-nowrap tw:shadow-md tw:ring-2 tw:ring-card-ink ${
              atMaxClues
                ? "tw:bg-clue tw:text-card-ink"
                : "tw:bg-game-raised tw:text-game-text"
            }`}
          >
            {atMaxClues ? "No discards" : "No clues"}
          </span>
        )}
      </section>
      {/* Strikes are danger: the bubble turns red as they add up, and stays quiet without them. */}
      <section
        aria-label="Strikes"
        className={`${TOKEN_BUBBLE_CLASS} ${getStrikeBubbleClass(strikes)}`}
      >
        <div
          aria-label={`${strikes} of ${MAX_STRIKES} strikes`}
          className={`${TOKEN_VALUE_CLASS} tw:gap-1.5`}
          role="group"
        >
          <BombIcon />
          {[...eRange(MAX_STRIKES)].map((i) => {
            const segment = strikeSegments[i];
            const struck = i < strikes;
            // In a replay, a strike that happens later in the game shows faded, as on the classic
            // screen. Clicking it goes to its turn.
            const upcoming = !struck && segment !== undefined;
            const className = `tw:box-border tw:flex tw:size-[32px] tw:items-center tw:justify-center tw:rounded-lg tw:border-2 tw:border-solid tw:p-0 ${
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
                  upcoming
                    ? "A strike happens later in the game. Click to go to its turn."
                    : "Click to go to the turn of this strike.",
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
