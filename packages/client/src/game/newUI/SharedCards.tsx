import type { CardOrder, Rank, SuitIndex, Variant } from "@hanabi-live/game";
import { MAX_STRIKES } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { forwardRef } from "react";
import { CARD_HEIGHT_PER_WIDTH, CardFace, describeCard } from "./Card";
import { Pip } from "./Pip";
import { OutOf } from "./StatusStrip";

/** How far each discarded card covers the one before it in its row, as a fraction of its width. */
const DISCARD_OVERLAP_PER_WIDTH = 0.4;

/** How far each row of the discard pile covers the row above, as a fraction of a card's height. */
const DISCARD_ROW_OVERLAP_PER_HEIGHT = 0.35;

export interface StackView {
  readonly suitIndex: SuitIndex;

  /** The rank on top of the stack, or `undefined` before the stack starts. */
  readonly topRank: Rank | undefined;
}

export interface DiscardView {
  readonly order: CardOrder;
  readonly suitIndex: SuitIndex | undefined;
  readonly rank: Rank | undefined;
}

/** The look of a drop target, which changes while the player drags a card. */
export type ZoneState = "idle" | "available" | "hovered" | "unavailable";

const zoneClasses: Record<ZoneState, string> = {
  idle: "tw:bg-table-zone",
  available: "tw:bg-table-zone tw:inset-ring-2 tw:inset-ring-table-faint",
  hovered: "tw:bg-clue/15 tw:inset-ring-3 tw:inset-ring-clue",
  unavailable: "tw:bg-table-zone tw:opacity-60",
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
          ? "tw:bg-clue tw:text-table-ink"
          : "tw:bg-table-text tw:text-table-ink"
      }`}
    >
      {state === "unavailable" ? unavailableText : text}
    </span>
  );
}

/**
 * The play stacks, where the player drops a card to play it. Below them are the deck, the clue
 * tokens, and the strikes, which are all things on the table in the physical game.
 */
export const PlayArea = forwardRef<
  HTMLElement,
  {
    readonly stacks: readonly StackView[];
    readonly variant: Variant;
    readonly colorblindMode: boolean;
    readonly cardWidth: number;
    readonly cardsInDeck: number;
    readonly clues: number;
    readonly maxClues: number;
    readonly strikes: number;
    readonly zoneState: ZoneState;
  }
>(
  (
    {
      stacks,
      variant,
      colorblindMode,
      cardWidth,
      cardsInDeck,
      clues,
      maxClues,
      strikes,
      zoneState,
    },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;

    return (
      <div className="tw:flex tw:shrink-0 tw:flex-col tw:items-center tw:gap-3">
        <section
          aria-label="Play stacks"
          className={`tw:relative tw:flex tw:flex-1 tw:flex-col tw:items-center tw:gap-3 tw:rounded-[18px] tw:px-4.5 tw:py-4 ${zoneClasses[zoneState]}`}
          ref={ref}
        >
          <h2 className="tw:m-0 tw:text-[15px] tw:font-medium tw:text-table-muted">
            Play stacks
          </h2>
          <div className="tw:flex tw:flex-col tw:gap-2">
            {stacks.map((stack) => {
              const suit = variant.suits[stack.suitIndex];
              if (stack.topRank === undefined) {
                return (
                  <div
                    aria-label={`${suit?.displayName ?? ""}: nothing played`}
                    className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-[10px] tw:border-2 tw:border-dashed tw:border-table-line tw:opacity-60"
                    key={stack.suitIndex}
                    role="img"
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
                );
              }

              return (
                <div
                  aria-label={describeCard(
                    variant,
                    stack.suitIndex,
                    stack.topRank,
                  )}
                  key={stack.suitIndex}
                  role="img"
                >
                  <CardFace
                    colorblindMode={colorblindMode}
                    rank={stack.topRank}
                    suitIndex={stack.suitIndex}
                    variant={variant}
                    width={cardWidth}
                  />
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
            className="tw:flex tw:items-center tw:justify-center tw:rounded-[10px] tw:bg-table-raised tw:ring-1 tw:ring-table-line"
            style={{ width: cardWidth, height }}
          >
            <span
              className="tw:font-extrabold tw:text-table-text"
              style={{ fontSize: cardWidth * 0.5 }}
            >
              {cardsInDeck}
            </span>
          </div>
          <span className="tw:text-[13px] tw:text-table-muted">In deck</span>
        </div>
        <div className="tw:flex tw:flex-col tw:items-center tw:gap-0.5">
          <span className="tw:text-[13px] tw:text-table-muted">Clues</span>
          <span className="tw:text-[22px] tw:font-bold tw:text-table-text">
            <OutOf max={maxClues} value={clues} />
          </span>
        </div>
        <div className="tw:flex tw:flex-col tw:items-center tw:gap-1.5">
          <span className="tw:text-[13px] tw:text-table-muted">Strikes</span>
          <div
            aria-label={`${strikes} of ${MAX_STRIKES} strikes`}
            className="tw:flex tw:gap-1.5"
            role="img"
          >
            {[...eRange(MAX_STRIKES)].map((i) => (
              <span
                className={`tw:box-border tw:size-[24px] tw:rounded-md tw:border-2 ${
                  i < strikes
                    ? "tw:border-critical tw:bg-critical"
                    : "tw:border-table-line"
                }`}
                key={i}
              />
            ))}
          </div>
        </div>
      </div>
    );
  },
);

/**
 * The discarded cards, one row for each suit, where the player drops a card to discard it. Each
 * card is a button that shows the turn on which it was discarded.
 */
export const DiscardPile = forwardRef<
  HTMLElement,
  {
    readonly rows: ReadonlyArray<readonly DiscardView[]>;
    readonly variant: Variant;
    readonly colorblindMode: boolean;
    readonly cardWidth: number;
    readonly zoneState: ZoneState;
    readonly onShowDiscard: (order: CardOrder) => void;
  }
>(
  (
    { rows, variant, colorblindMode, cardWidth, zoneState, onShowDiscard },
    ref,
  ): React.JSX.Element => {
    const height = cardWidth * CARD_HEIGHT_PER_WIDTH;

    return (
      <section
        aria-label="Discards"
        className={`tw:relative tw:box-border tw:flex tw:w-[214px] tw:shrink-0 tw:flex-col tw:gap-3 tw:rounded-[18px] tw:px-4.5 tw:py-4 ${zoneClasses[zoneState]}`}
        ref={ref}
      >
        <h2 className="tw:m-0 tw:text-[15px] tw:font-medium tw:text-table-muted">
          Discards
        </h2>
        <div className="tw:flex tw:flex-col">
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
                  key={card.order}
                  onClick={() => {
                    onShowDiscard(card.order);
                  }}
                  style={{
                    marginLeft:
                      i === 0 ? 0 : -cardWidth * DISCARD_OVERLAP_PER_WIDTH,
                  }}
                  title="Show the turn this card was discarded"
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
