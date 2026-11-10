import type { CardOrder, PlayerIndex, Variant } from "@hanabi-live/game";
import { CARD_HEIGHT_PER_WIDTH, CardFace, describeCard } from "./Card";
import type { CardView } from "./tableView";

export interface Seat {
  readonly playerIndex: PlayerIndex;
  readonly name: string;

  /** Whether it is this player's turn. */
  readonly active: boolean;

  /** Whether this is the viewer's own seat. */
  readonly you: boolean;

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
}

/** The space between cards in a hand, in CSS pixels. */
export const CARD_GAP = 10;

/** The width of the column with each player's name, in CSS pixels. */
export const NAME_COLUMN_WIDTH = {
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
      <span className="tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-text-strong tw:py-1.5 tw:pr-2 tw:pl-3.5 tw:font-bold tw:text-surface">
        {youIcon}
        <span className="tw:truncate">{seat.name}</span>
        {seat.clock !== undefined && (
          <span className="tw:rounded-full tw:bg-surface tw:px-2.5 tw:py-0.5 tw:text-sm tw:font-medium tw:text-text-strong">
            {seat.clock}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-border tw:px-3.5 tw:py-1.5 tw:font-medium tw:text-text-strong">
      {youIcon}
      <span className="tw:truncate">{seat.name}</span>
    </span>
  );
}

function OwnCard({
  card,
  slot,
  props,
}: {
  readonly card: CardView;
  readonly slot: number;
  readonly props: HandsProps;
}): React.JSX.Element {
  const { variant, colorblindMode, cardWidth, canMoveCards } = props;
  const height = cardWidth * CARD_HEIGHT_PER_WIDTH;
  const dragged = props.draggedCard === card.order;
  const menuOpen = props.menuCard === card.order;

  if (dragged) {
    return (
      <div
        className="tw:box-border tw:shrink-0 tw:rounded-[10px] tw:border-2 tw:border-dashed tw:border-text-label"
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

  if (!canMoveCards) {
    return (
      <div aria-label={label} role="img">
        {face}
      </div>
    );
  }

  return (
    <div className="tw:relative">
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
        <div className="tw:absolute tw:top-full tw:left-1/2 tw:z-10 tw:mt-2 tw:flex tw:-translate-x-1/2 tw:gap-1.5 tw:rounded-[10px] tw:bg-text-strong tw:p-1.5 tw:shadow-lg">
          <button
            className="tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-surface tw:px-3 tw:py-1.5 tw:font-bold tw:text-text-strong"
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

function Hand({
  seat,
  props,
}: {
  readonly seat: Seat;
  readonly props: HandsProps;
}): React.JSX.Element {
  const canPick = props.canChooseClueTarget && !seat.you;
  const chosen = canPick && props.clueTarget === seat.playerIndex;

  let boxClass = "tw:ring-1 tw:ring-border";
  if (seat.active) {
    boxClass = "tw:bg-white/5 tw:ring-2 tw:ring-text-strong";
  } else if (chosen) {
    boxClass = "tw:bg-clue/10 tw:ring-2 tw:ring-clue";
  } else if (seat.you) {
    boxClass = "tw:bg-surface tw:ring-1 tw:ring-text-label";
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
        {seat.cards.map((card, i) =>
          seat.you ? (
            <OwnCard card={card} key={card.order} props={props} slot={i + 1} />
          ) : (
            <div
              aria-label={describeCard(
                props.variant,
                card.suitIndex,
                card.rank,
              )}
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
          ),
        )}
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
