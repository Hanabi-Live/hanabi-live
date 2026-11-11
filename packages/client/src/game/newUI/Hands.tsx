import type { CardOrder, PlayerIndex, Variant } from "@hanabi-live/game";
import { useEffect, useRef } from "react";
import { CARD_HEIGHT_PER_WIDTH, CardFace, describeCard } from "./Card.tsx";
import type { CardView } from "./tableView.ts";

export interface Seat {
  readonly playerIndex: PlayerIndex;
  readonly name: string;

  /** Whether it is this player's turn. */
  readonly active: boolean;

  /** Whether this is the viewer's own seat. */
  readonly you: boolean;

  /**
   * Whether the viewer plays and clues as this player: their own seat in a game, or the current
   * player in a hypothetical that they control.
   */
  readonly acting: boolean;

  readonly cards: readonly CardView[];

  /** The time on the current player's clock, if the clocks show. */
  readonly clock: string | undefined;
}

interface HandsProps {
  readonly seats: readonly Seat[];
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly cardWidth: number;

  /**
   * The width of the column with each player's name, in CSS pixels. On narrow screens, the name
   * sits above the cards instead, and this is `undefined`.
   */
  readonly nameColumnWidth: number | undefined;

  /** Whether the viewer can pick a player to clue. */
  readonly canChooseClueTarget: boolean;
  readonly clueTarget: PlayerIndex | undefined;
  readonly onChooseClueTarget: (playerIndex: PlayerIndex) => void;

  /** The cards that the clue being chosen would touch. */
  readonly touchedCards: ReadonlySet<CardOrder>;

  /** Whether the viewer can play or discard their own cards now. */
  readonly canMoveCards: boolean;
  readonly canDiscard: boolean;
  readonly draggedCard: CardOrder | undefined;
  readonly menuCard: CardOrder | undefined;
  readonly onCardPointerDown: (
    event: React.PointerEvent,
    order: CardOrder,
  ) => void;
  readonly onCardClick: (order: CardOrder) => void;
  readonly onPlay: (order: CardOrder) => void;
  readonly onDiscard: (order: CardOrder) => void;

  /** In a hypothetical, while the viewer edits cards, clicking a card changes it into another. */
  readonly onEditCard: ((order: CardOrder) => void) | undefined;
}

/** The space between cards in a hand, in CSS pixels. */
export const CARD_GAP = 10;

/**
 * The most width that the column with each player's name takes, in CSS pixels. Below it, the column
 * is as wide as the widest name. A longer name is cut short.
 */
export const NAME_COLUMN_MAX_WIDTH = {
  WIDE: 150,

  /** For windows up to the 1440 px breakpoint, where the side columns are narrower too. */
  MEDIUM: 110,
} as const;

function NameChip({ seat }: { readonly seat: Seat }): React.JSX.Element {
  const youIcon = seat.you ? (
    <i aria-label="You" className="fas fa-user tw:text-[0.85em]" role="img" />
  ) : undefined;

  if (seat.active) {
    return (
      <span className="tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-game-text tw:py-1.5 tw:pr-2 tw:pl-3.5 tw:font-bold tw:text-card-ink">
        {youIcon}
        <span className="tw:truncate">{seat.name}</span>
        {seat.clock !== undefined && (
          <span className="tw:rounded-full tw:bg-card-ink tw:px-2.5 tw:py-0.5 tw:text-sm tw:font-medium tw:text-game-text">
            {seat.clock}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-game-raised tw:px-3.5 tw:py-1.5 tw:font-medium tw:text-game-text">
      {youIcon}
      <span className="tw:truncate">{seat.name}</span>
    </span>
  );
}

/** The widest text that a clock usually shows, which the name column leaves room for. */
const CLOCK_PLACEHOLDER = "00:00";

/**
 * Measures the width that the name column needs. It draws every player's name, hidden, in both of
 * its styles: bold for the current player (with a clock when the clocks show), and plain for the
 * others. The column fits the widest, so it does not change size as the turn moves from player to
 * player.
 */
export function NameColumnSizer({
  seats,
  showClock,
  onWidthChange,
}: {
  readonly seats: readonly Seat[];
  readonly showClock: boolean;
  readonly onWidthChange: (width: number) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    // Round up, so that the widest name is not cut short by a fraction of a pixel.
    const observer = new ResizeObserver(() => {
      onWidthChange(Math.ceil(element.getBoundingClientRect().width));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onWidthChange]);

  return (
    <div
      aria-hidden="true"
      className="tw:invisible tw:absolute tw:top-0 tw:left-0 tw:flex tw:w-max tw:flex-col tw:items-start"
      ref={ref}
    >
      {seats.flatMap((seat) => [
        <NameChip
          key={`${seat.playerIndex}-active`}
          seat={{
            ...seat,
            active: true,
            clock: showClock ? CLOCK_PLACEHOLDER : undefined,
          }}
        />,
        <NameChip
          key={`${seat.playerIndex}-waiting`}
          seat={{ ...seat, active: false }}
        />,
      ])}
    </div>
  );
}

function OwnCard({
  card,
  slot,
  place,
  movable,
  props,
}: {
  readonly card: CardView;
  readonly slot: number;

  /** Where the card is, so that it moves only when this changes (see "cardMotion.ts"). */
  readonly place: string;

  /** Whether the viewer can play or discard the card now. */
  readonly movable: boolean;
  readonly props: HandsProps;
}): React.JSX.Element {
  const { variant, colorblindMode, cardWidth } = props;
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const dragged = props.draggedCard === card.order;
  const menuOpen = props.menuCard === card.order;

  if (dragged) {
    return (
      <div
        className="tw:box-border tw:shrink-0 tw:rounded-[10px] tw:border-2 tw:border-dashed tw:border-game-line"
        data-card-order={card.order}
        data-card-place={place}
        style={{ width: cardWidth, height }}
      />
    );
  }

  const face = (
    <CardFace
      clued={card.clued}
      colorblindMode={colorblindMode}
      critical={card.critical}
      possibleRanks={card.possibleRanks}
      possibleSuitIndexes={card.possibleSuitIndexes}
      raiseClued
      rank={card.rank}
      suitIndex={card.suitIndex}
      trash={card.trash}
      trashIcon={card.trashIcon}
      variant={variant}
      width={cardWidth}
    />
  );
  const label = `Slot ${slot}: ${describeCard(variant, card.suitIndex, card.rank)}`;

  if (!movable) {
    return (
      <div
        aria-label={label}
        data-card-order={card.order}
        data-card-place={place}
        role="img"
      >
        {face}
      </div>
    );
  }

  return (
    <div
      className="tw:relative"
      data-card-order={card.order}
      data-card-place={place}
    >
      <button
        aria-expanded={menuOpen}
        aria-label={`${label}. Play or discard`}
        className="tw:block tw:cursor-grab tw:touch-none tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:p-0"
        onClick={() => {
          props.onCardClick(card.order);
        }}
        onPointerDown={(event) => {
          props.onCardPointerDown(event, card.order);
        }}
        type="button"
      >
        {face}
      </button>
      {menuOpen && (
        <div className="tw:absolute tw:top-full tw:left-1/2 tw:z-10 tw:mt-2 tw:flex tw:-translate-x-1/2 tw:gap-1.5 tw:rounded-[10px] tw:bg-game-text tw:p-1.5 tw:shadow-lg">
          <button
            className="tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-card-ink tw:px-3 tw:py-1.5 tw:font-bold tw:text-game-text"
            onClick={() => {
              props.onPlay(card.order);
            }}
            type="button"
          >
            Play
          </button>
          <button
            className="tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-clue tw:px-3 tw:py-1.5 tw:font-bold tw:text-card-ink tw:disabled:cursor-default tw:disabled:opacity-50"
            disabled={!props.canDiscard}
            onClick={() => {
              props.onDiscard(card.order);
            }}
            title={
              props.canDiscard
                ? undefined
                : "The team cannot discard at the maximum number of clues."
            }
            type="button"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

/** A card in a hypothetical, while the viewer edits cards: clicking it changes it into another. */
function EditableCard({
  card,
  place,
  props,
}: {
  readonly card: CardView;
  readonly place: string;
  readonly props: HandsProps;
}): React.JSX.Element {
  return (
    <button
      aria-label={`${describeCard(props.variant, card.suitIndex, card.rank)}. Change it into another card`}
      className="tw:cursor-pointer tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:p-0"
      data-card-order={card.order}
      data-card-place={place}
      onClick={() => {
        props.onEditCard?.(card.order);
      }}
      type="button"
    >
      <CardFace
        clued={card.clued}
        colorblindMode={props.colorblindMode}
        critical={card.critical}
        possibleRanks={card.possibleRanks}
        possibleSuitIndexes={card.possibleSuitIndexes}
        raiseClued
        rank={card.rank}
        suitIndex={card.suitIndex}
        trash={card.trash}
        trashIcon={card.trashIcon}
        variant={props.variant}
        width={props.cardWidth}
      />
    </button>
  );
}

function Hand({
  seat,
  props,
}: {
  readonly seat: Seat;
  readonly props: HandsProps;
}): React.JSX.Element {
  const editing = props.onEditCard !== undefined;
  const canPick = props.canChooseClueTarget && !seat.acting && !editing;
  const chosen = canPick && props.clueTarget === seat.playerIndex;

  let boxClass = "tw:ring-1 tw:ring-game-raised";
  if (seat.active) {
    boxClass = "tw:bg-white/5 tw:ring-2 tw:ring-game-text";
  } else if (chosen) {
    boxClass = "tw:bg-clue/10 tw:ring-2 tw:ring-clue";
  } else if (seat.you) {
    boxClass = "tw:bg-game-zone tw:ring-1 tw:ring-game-line";
  }

  const chip = <NameChip seat={seat} />;

  return (
    <div
      aria-label={`${seat.name}'s hand`}
      className={`tw:flex tw:rounded-2xl tw:px-4 tw:pt-4 tw:pb-2 ${
        props.nameColumnWidth === undefined
          ? "tw:flex-col tw:items-start tw:gap-2"
          : "tw:items-center tw:gap-4"
      } ${boxClass}`}
      role="group"
    >
      <div
        className="tw:flex tw:max-w-full tw:shrink-0"
        style={{ width: props.nameColumnWidth }}
      >
        {canPick ? (
          <button
            aria-pressed={chosen}
            className="tw:max-w-full tw:cursor-pointer tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-left"
            onClick={() => {
              props.onChooseClueTarget(seat.playerIndex);
            }}
            title={`Give ${seat.name} a clue`}
            type="button"
          >
            {chip}
          </button>
        ) : (
          chip
        )}
      </div>
      {/* Clicking another player's cards also picks them for a clue. The name button does the
          same for the keyboard. */}
      <div
        className={`tw:flex ${canPick ? "tw:cursor-pointer" : ""}`}
        onClick={
          canPick
            ? () => {
                props.onChooseClueTarget(seat.playerIndex);
              }
            : undefined
        }
        style={{ gap: CARD_GAP }}
      >
        {seat.cards.map((card, i) => {
          const place = `hand-${seat.playerIndex}-${i}`;
          if (editing) {
            return (
              <EditableCard
                card={card}
                key={card.order}
                place={place}
                props={props}
              />
            );
          }

          if (seat.you || seat.acting) {
            return (
              <OwnCard
                card={card}
                key={card.order}
                movable={props.canMoveCards && seat.acting}
                place={place}
                props={props}
                slot={i + 1}
              />
            );
          }

          return (
            <div
              aria-label={describeCard(
                props.variant,
                card.suitIndex,
                card.rank,
              )}
              data-card-order={card.order}
              data-card-place={place}
              key={card.order}
              role="img"
            >
              <CardFace
                clued={card.clued}
                colorblindMode={props.colorblindMode}
                critical={card.critical}
                highlighted={props.touchedCards.has(card.order)}
                raiseClued
                rank={card.rank}
                suitIndex={card.suitIndex}
                trash={card.trash}
                trashIcon={card.trashIcon}
                variant={props.variant}
                width={props.cardWidth}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Every hand, one row each: the viewer's own first, then the others in the order that they play.
 */
export function Hands(props: HandsProps): React.JSX.Element {
  return (
    <section
      aria-label="Hands"
      className="tw:flex tw:flex-col tw:justify-center tw:gap-2"
    >
      {props.seats.map((seat) => (
        <Hand key={seat.playerIndex} props={props} seat={seat} />
      ))}
    </section>
  );
}
