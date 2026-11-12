import type { CardOrder, Rank, SuitIndex, Variant } from "@hanabi-live/game";
import { MAX_STRIKES } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { forwardRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { CARD_HEIGHT_PER_WIDTH, CardFace, describeCard } from "./Card.tsx";
import { Pip } from "./Pip.tsx";
import { OutOf } from "./StatusStrip.tsx";

/** How far each discarded card covers the one before it in its row, as a fraction of its width. */
const DISCARD_OVERLAP_PER_WIDTH = 0.4;

/** How far each row of the discard pile covers the row above, as a fraction of a card's height. */
const DISCARD_ROW_OVERLAP_PER_HEIGHT = 0.42;

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
          <h2 className="tw:m-0 tw:text-[15px] tw:font-medium tw:text-game-muted">
            Play stacks
          </h2>
          <div className="tw:flex tw:flex-col tw:gap-2 tw:narrow-980:flex-row tw:narrow-980:flex-wrap">
            {stacks.map((stack) => {
              const suit = variant.suits[stack.suitIndex];
              const name = suit?.displayName ?? "";

              // What lies under the top card: the card below it, or else the empty stack. It stays
              // in place while a newly played card moves on top of it.
              const below =
                stack.belowRank === undefined ? (
                  <div
                    className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-[10px] tw:border-2 tw:border-dashed tw:border-game-line tw:opacity-60"
                    style={{ width: cardWidth, height }}
                  >
                    {suit !== undefined && (
                      <Pip
                        size={cardWidth * 0.45}
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
        <div
          aria-label={`${cardsInDeck} cards in the deck`}
          className="tw:flex tw:flex-col tw:items-center tw:gap-1.5"
          role="img"
        >
          <div
            className="tw:flex tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-game-raised tw:ring-1 tw:ring-game-line"
            data-deck
            style={{ width: cardWidth, height }}
          >
            <span
              className="tw:font-extrabold tw:text-game-text"
              style={{ fontSize: cardWidth * 0.5 }}
            >
              {cardsInDeck}
            </span>
          </div>
          <span className="tw:text-[13px] tw:text-game-muted">In deck</span>
        </div>
      </div>
    );
  },
);

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
        <div className="tw:flex tw:items-baseline tw:justify-between tw:gap-2">
          <h2 className="tw:m-0 tw:text-[15px] tw:font-medium tw:text-game-muted">
            Discards
          </h2>
          {atMaxClues && zoneState === "idle" && (
            <span className="tw:text-[13px] tw:font-medium tw:text-clue">
              No discards at max clues
            </span>
          )}
        </div>
        <div className="tw:flex tw:flex-col" style={{ height: rowsHeight }}>
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
                  className="tw:shrink-0 tw:cursor-pointer tw:rounded-[9px] tw:border-0 tw:bg-transparent tw:p-0 tw:transition-transform tw:hover:z-10 tw:hover:-translate-y-1.5 tw:focus-visible:z-10 tw:focus-visible:-translate-y-1.5 tw:motion-reduce:transition-none"
                  data-card-order={card.order}
                  data-card-place={`discard-${rowIndex}-${i}`}
                  key={card.order}
                  onClick={() => {
                    onShowDiscard(card.order);
                  }}
                  ref={tooltipRef("Show the turn this card was discarded")}
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
 * A bubble for the clue tokens or the strikes: a label, and its value below it, centered. The two
 * bubbles have the same layout, so that their labels and values line up.
 */
const TOKEN_BUBBLE_CLASS =
  "tw:relative tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-1 tw:rounded-[18px] tw:bg-game-zone tw:px-3 tw:py-5";

/** The row of a value, as tall as the strike boxes, so that the two values line up. */
const TOKEN_VALUE_CLASS = "tw:flex tw:h-[32px] tw:items-center";

/**
 * The clue tokens and the strikes, below the discard pile. They are real tokens in the physical
 * game, so they sit on the table instead of with the numbers along the bottom.
 */
export function TableTokens({
  clues,
  maxClues,
  atMaxClues,
  strikes,
  strikeSegments,
  onShowStrike,
}: {
  readonly clues: number;
  readonly maxClues: number;

  /** Whether the team has every clue token, so that no one can discard. */
  readonly atMaxClues: boolean;
  readonly strikes: number;

  /**
   * For each strike box, the segment of the strike that it stands for, or `undefined` when it does
   * not stand for one that the viewer may see. Clicking a box with a strike shows its turn.
   */
  readonly strikeSegments: ReadonlyArray<number | undefined>;
  readonly onShowStrike: (segment: number) => void;
}): React.JSX.Element {
  return (
    // Two bubbles side by side. They share their height, so that their labels and values line up.
    <div className="tw:flex tw:shrink-0 tw:gap-3">
      <section aria-label="Clue tokens" className={TOKEN_BUBBLE_CLASS}>
        <span className="tw:text-[13px] tw:text-game-muted">Clues</span>
        {/* At max clues, the count takes the color of clues, since the team must give one. */}
        <span
          className={`${TOKEN_VALUE_CLASS} tw:text-[22px] tw:font-bold ${
            atMaxClues ? "tw:text-clue" : "tw:text-game-text"
          }`}
        >
          {atMaxClues ? (
            <>
              {clues}
              <span className="tw:font-medium">&nbsp;/ {maxClues}</span>
            </>
          ) : (
            <OutOf max={maxClues} value={clues} />
          )}
        </span>
        {atMaxClues && (
          // A badge on the bottom edge of the bubble, so that the count stays centered.
          <span className="tw:absolute tw:bottom-0 tw:left-1/2 tw:-translate-x-1/2 tw:translate-y-1/2 tw:rounded-lg tw:bg-clue tw:px-2.5 tw:py-1 tw:text-[13px] tw:leading-none tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:shadow-md tw:ring-2 tw:ring-card-ink">
            No discards
          </span>
        )}
      </section>
      <section aria-label="Strikes" className={TOKEN_BUBBLE_CLASS}>
        <span className="tw:text-[13px] tw:text-game-muted">Strikes</span>
        <div
          aria-label={`${strikes} of ${MAX_STRIKES} strikes`}
          className={`${TOKEN_VALUE_CLASS} tw:gap-1.5`}
          role="group"
        >
          {[...eRange(MAX_STRIKES)].map((i) => {
            const segment = strikeSegments[i];
            const className = `tw:box-border tw:size-[32px] tw:rounded-lg tw:border-2 tw:border-solid tw:p-0 ${
              i < strikes
                ? "tw:border-critical tw:bg-critical"
                : "tw:border-game-line tw:bg-transparent"
            }`;
            return segment === undefined ? (
              <span className={className} data-strike-box={i} key={i} />
            ) : (
              <button
                aria-label={`Show the turn of strike ${i + 1}`}
                className={`${className} tw:cursor-pointer tw:hover:brightness-125`}
                data-strike-box={i}
                key={i}
                onClick={() => {
                  onShowStrike(segment);
                }}
                ref={tooltipRef("Show the turn of this strike")}
                type="button"
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
