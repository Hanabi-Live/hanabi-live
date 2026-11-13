import type { CardOrder, PlayerIndex, Variant } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { ClueMarkerView } from "./Card.tsx";
import {
  CARD_HEIGHT_PER_WIDTH,
  CardFace,
  CLUE_TOKEN_REACH_PER_WIDTH,
  CLUED_BORDER_WIDTH,
  CLUED_RAISE_PER_WIDTH,
  describeCard,
  getClueMarkerColor,
} from "./Card.tsx";
import { CardNote } from "./CardNote.tsx";
import { measure } from "./screenScale.ts";
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
   * The width of the column with each player's name, in CSS pixels. On a window too narrow for the
   * names beside the cards, the names sit above the cards instead, and this is `undefined`.
   */
  readonly nameColumnWidth: number | undefined;

  /**
   * Whether the viewer can give a clue, so that the hand of the player picked in the clue panel
   * stands out.
   */
  readonly canChooseClueTarget: boolean;
  readonly clueTarget: PlayerIndex | undefined;

  /** The cards that the clue being chosen would touch. */
  readonly touchedCards: ReadonlySet<CardOrder>;

  /** The cards that the clue on the turn that shows touched, with the clue to mark them with. */
  readonly clueMarkers: ReadonlyMap<CardOrder, ClueMarkerView>;

  /** The player who got the clue on the turn that shows, when it touched no cards. */
  readonly emptyClueTarget: PlayerIndex | undefined;

  /** The clue on the turn that shows: who gave it to whom, and how it is marked. */
  readonly shownClue:
    | {
        readonly giver: PlayerIndex;
        readonly target: PlayerIndex;
        readonly marker: ClueMarkerView;
      }
    | undefined;

  /** Whether the viewer can play or discard their own cards now. */
  readonly canMoveCards: boolean;
  readonly draggedCard: CardOrder | undefined;

  /** Starts to drag one of the viewer's cards, to play or discard it. */
  readonly onCardPointerDown: (
    event: React.PointerEvent,
    order: CardOrder,
  ) => void;

  /**
   * Whether the viewer plays and discards by tapping a card and then "Play" or "Discard", instead
   * of by dragging it. On a touch screen or a narrow window, the play stacks and the discard pile
   * can be off the screen, so there is nowhere to drag a card to. Only one of the two ways works at
   * a time.
   */
  readonly tapToMove: boolean;

  /** The card whose "Play" and "Discard" buttons show, when the viewer taps cards to move them. */
  readonly menuCard: CardOrder | undefined;
  readonly onCardTap: (order: CardOrder) => void;
  readonly canDiscard: boolean;
  readonly onPlay: (order: CardOrder) => void;
  readonly onDiscard: (order: CardOrder) => void;

  /** The notes that each card's tooltip shows, as HTML. Cards without notes are not in it. */
  readonly notesHtml: ReadonlyMap<CardOrder, string>;

  /** The card whose note the viewer is typing. */
  readonly noteCard: CardOrder | undefined;

  /** Handles a right-click on a card, or is `undefined` when the viewer cannot write notes. */
  readonly onRightClickCard:
    ((event: React.MouseEvent, order: CardOrder) => void) | undefined;

  readonly onCloseNote: () => void;

  /** In a hypothetical, while the viewer edits cards, clicking a card changes it into another. */
  readonly onEditCard: ((order: CardOrder) => void) | undefined;

  /**
   * Views the game from a player's seat, when the viewer does not play in it. Right-clicking a name
   * does this, as on the classic screen.
   */
  readonly onViewAs: ((playerIndex: PlayerIndex) => void) | undefined;

  /**
   * The hands that show their player's view of them ("empathy"): only what the clues have told the
   * player. A hand shows it while the viewer holds the pointer down on it, or while its eye button
   * is on. Only touch screens, which have no cursor to show the eye over the cards, get eye buttons
   * (`onToggleEmpathy`).
   */
  readonly empathyToggled: ReadonlySet<PlayerIndex>;
  readonly onToggleEmpathy: ((playerIndex: PlayerIndex) => void) | undefined;
  readonly onHoldEmpathy: (playerIndex: PlayerIndex | undefined) => void;

  /** The mouse button went down on a card in a hand (the clue log then shows its clues). */
  readonly onPressCard: (order: CardOrder) => void;
}

/**
 * How far the rail that joins a clue's giver and receiver runs to the left of the hands, in CSS
 * pixels, when the play stacks are not beside the hands (on a narrow window, where the columns
 * stack). Otherwise, the rail runs halfway between the play stacks and the hands.
 */
const CLUE_RAIL_OFFSET = 16;

/**
 * The least space between the rail and the left edge of the window. On a narrow window, where the
 * hands reach almost to that edge, the rail moves closer to the hands to keep it.
 */
const CLUE_RAIL_WINDOW_MARGIN = 6;

/** The radius of the rail's corners, in CSS pixels. */
const CLUE_RAIL_CORNER = 6;

/** The width of the rail's colored line, and of the ring around the giver's name. */
const CLUE_RAIL_WIDTH = 4;
const CLUE_RING_WIDTH = 3;

/** The width of the edge around the rail and around the ring, which keeps them visible. */
const CLUE_EDGE_WIDTH = 2;

/**
 * The rail's arrowhead, in CSS pixels: a broad head with a notch in its back, so that it reads as
 * an arrow at a glance.
 */
const CLUE_RAIL_HEAD = { length: 15, halfHeight: 10, notch: 4 } as const;

/**
 * A rail to the left of the hands, from the name of the player who gave the clue on the turn that
 * shows to the name of the player who got it, with an arrowhead at the receiver. At a crowded
 * table, it shows who clued whom at a glance. It draws itself from the giver when the clue is given
 * (see "cardMotion.ts").
 */
function ClueRail({
  giver,
  target,
  color,
}: {
  readonly giver: PlayerIndex;
  readonly target: PlayerIndex;
  readonly color: string;
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const edgeClass = color === "white" ? "tw:stroke-[black]" : "tw:stroke-white";

  // The rail follows the names, which move when the window or the cards change size. The shapes are
  // set here instead of through state, so that they are in place before the screen's own layout
  // effect animates them.
  useLayoutEffect(() => {
    const rail = ref.current;
    const hands = rail?.parentElement;
    if (rail === null || hands === null || hands === undefined) {
      return undefined;
    }

    function place() {
      if (rail === null || hands === null || hands === undefined) {
        return;
      }

      const box = measure(hands);
      const fromChip = hands.querySelector(
        `[data-name-chip="${CSS.escape(giver.toString())}"]`,
      );
      const toChip = hands.querySelector(
        `[data-name-chip="${CSS.escape(target.toString())}"]`,
      );
      if (fromChip === null || toChip === null) {
        return;
      }
      const from = measure(fromChip);
      const to = measure(toChip);

      // The line starts on the ring around the giver's name, so that the two join into one shape:
      // the colored line meets the ring's color, and the line's edge meets the ring's edge.
      const chipX = from.left - box.left;
      const coreStartX = chipX - CLUE_RING_WIDTH + 1;
      const edgeStartX = chipX - CLUE_RING_WIDTH - CLUE_EDGE_WIDTH + 1;
      const fromY = from.top - box.top + from.height / 2;
      const toX = to.left - box.left - 3;
      const toY = to.top - box.top + to.height / 2;
      const stacksElement = document.querySelector("[data-play-stacks]");
      const stacks =
        stacksElement === null ? undefined : measure(stacksElement);
      const railX =
        stacks !== undefined && stacks.right < box.left
          ? -(box.left - stacks.right) / 2
          : -Math.min(CLUE_RAIL_OFFSET, box.left - CLUE_RAIL_WINDOW_MARGIN);
      const corner = Math.min(CLUE_RAIL_CORNER, Math.abs(toY - fromY) / 2);
      const down = toY > fromY ? 1 : -1;
      const { length, halfHeight, notch } = CLUE_RAIL_HEAD;
      const backX = toX - length;
      const route = [
        `H ${railX + corner}`,
        `Q ${railX} ${fromY} ${railX} ${fromY + down * corner}`,
        `V ${toY - down * corner}`,
        `Q ${railX} ${toY} ${railX + corner} ${toY}`,
        `H ${backX + notch + 1}`,
      ].join(" ");
      rail
        .querySelector("[data-clue-rail-edge]")
        ?.setAttribute("d", `M ${edgeStartX} ${fromY} ${route}`);
      rail
        .querySelector("[data-clue-rail-core]")
        ?.setAttribute("d", `M ${coreStartX} ${fromY} ${route}`);
      rail
        .querySelector("[data-clue-rail-head]")
        ?.setAttribute(
          "points",
          [
            `${backX},${toY - halfHeight}`,
            `${toX},${toY}`,
            `${backX},${toY + halfHeight}`,
            `${backX + notch},${toY}`,
          ].join(" "),
        );
    }

    place();
    const observer = new ResizeObserver(place);
    observer.observe(hands);
    return () => {
      observer.disconnect();
    };
  });

  return (
    <svg
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-10 tw:size-full tw:overflow-visible"
      ref={ref}
    >
      {/* The edge keeps the rail visible on the table: white, or dark around a white rail. */}
      <path
        className={edgeClass}
        data-clue-rail-edge
        data-clue-rail-line
        fill="none"
        pathLength={1}
        strokeDasharray={1}
        strokeWidth={CLUE_RAIL_WIDTH + 2 * CLUE_EDGE_WIDTH}
      />
      <path
        data-clue-rail-core
        data-clue-rail-line
        fill="none"
        pathLength={1}
        stroke={color}
        strokeDasharray={1}
        strokeWidth={CLUE_RAIL_WIDTH}
      />
      {/* The arrowhead grows from its own center when it pops in. */}
      <polygon
        className={`${edgeClass} tw:origin-center tw:[transform-box:fill-box]`}
        data-clue-rail-head
        fill={color}
        strokeLinejoin="round"
        strokeWidth={CLUE_EDGE_WIDTH}
      />
    </svg>
  );
}

/** The width that the eye button takes beside a name, with its gap, in CSS pixels. */
export const EMPATHY_TOGGLE_SPACE = 34;

/**
 * The cursor over another player's cards, where holding the mouse button down shows their view of
 * them: a white eye with a dark outline, which shows on any card. It points with its center.
 */
const EMPATHY_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M1.5 12C4.5 6.5 8 4.5 12 4.5s7.5 2 10.5 7.5c-3 5.5-6.5 7.5-10.5 7.5S4.5 17.5 1.5 12z' fill='white' stroke='black' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='black'/><circle cx='13.5' cy='10.5' r='1.25' fill='white'/></svg>",
)}") 12 12, pointer`;

/** The space between cards in a hand, in CSS pixels. */
export const CARD_GAP = 10;

/**
 * The space in a hand's box above a raised clued card: its border, and a little more so that the
 * border does not touch the box.
 */
export const HAND_BOX_TOP_SPACE = CLUED_BORDER_WIDTH + 2;

/**
 * The space in a hand's box above its cards, for a clued card, which is raised. It is no more than
 * that, because with many players, the height limits the size of the cards.
 */
function getHandBoxTopPadding(cardWidth: number): number {
  return cardWidth * CLUED_RAISE_PER_WIDTH + HAND_BOX_TOP_SPACE;
}

/**
 * The space in a hand's box below its cards, for the outline around a card that a chosen clue would
 * touch.
 */
export const HAND_BOX_BOTTOM_PADDING = 8;

/** The space between a player's name and their cards, when the name is beside them. */
export const NAME_GAP = 16;

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
      // The clock's own pill sits close to the right edge, so the padding there is smaller.
      <span
        className={`tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-game-text tw:py-1.5 tw:pl-3.5 tw:font-bold tw:text-card-ink ${
          seat.clock === undefined ? "tw:pr-3.5" : "tw:pr-2"
        }`}
      >
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
      onWidthChange(Math.ceil(measure(element).width));
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
  const menuOpen = props.tapToMove && props.menuCard === card.order;

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
      clueMarker={props.clueMarkers.get(card.order)}
      colorblindMode={colorblindMode}
      critical={card.critical}
      hasNote={props.notesHtml.has(card.order)}
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
        aria-expanded={props.tapToMove ? menuOpen : undefined}
        aria-label={
          props.tapToMove
            ? `${label}. Play or discard`
            : `${label}. Drag it to the play stacks or the discard pile`
        }
        // Pressed, the card lifts and its shadow deepens, as if picked up, as on the classic
        // screen. It settles back when released. The shadow is a filter, so that it follows a clued
        // card, which is drawn raised. A card that is tapped to move it can still scroll the page.
        className={`tw:block tw:rounded-[10px] tw:border-0 tw:bg-transparent tw:p-0 tw:transition-[translate,filter] tw:duration-[80ms] tw:ease-out tw:active:-translate-y-1 tw:active:drop-shadow-[0_8px_8px_rgb(0_0_0/45%)] ${
          props.tapToMove ? "tw:cursor-pointer" : "tw:cursor-grab tw:touch-none"
        }`}
        onClick={
          props.tapToMove
            ? () => {
                props.onCardTap(card.order);
              }
            : undefined
        }
        onPointerDown={
          props.tapToMove
            ? undefined
            : (event) => {
                props.onCardPointerDown(event, card.order);
              }
        }
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
            ref={tooltipRef(
              props.canDiscard
                ? undefined
                : "The team cannot discard at the maximum number of clues.",
            )}
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
        clueMarker={props.clueMarkers.get(card.order)}
        colorblindMode={props.colorblindMode}
        critical={card.critical}
        hasNote={props.notesHtml.has(card.order)}
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

/** A card in a hand, as its seat and the screen's mode show it. */
function HandCard({
  card,
  slot,
  seat,
  editing,
  props,
}: {
  readonly card: CardView;
  /** The card's slot, counted from 1 on the left. */
  readonly slot: number;
  readonly seat: Seat;
  readonly editing: boolean;
  readonly props: HandsProps;
}): React.JSX.Element {
  const place = `hand-${seat.playerIndex}-${slot - 1}`;
  if (editing) {
    return (
      <EditableCard
        card={card}

        place={place}
        props={props}
      />
    );
  }

  if (seat.you || seat.acting) {
    return (
      <OwnCard
        card={card}

        movable={props.canMoveCards && seat.acting}
        place={place}
        props={props}
        slot={slot}
      />
    );
  }

  return (
    <div
      aria-label={describeCard(props.variant, card.suitIndex, card.rank)}
      data-card-order={card.order}
      data-card-place={place}

      role="img"
    >
      <CardFace
        clued={card.clued}
        clueMarker={props.clueMarkers.get(card.order)}
        colorblindMode={props.colorblindMode}
        critical={card.critical}
        hasNote={props.notesHtml.has(card.order)}
        highlighted={props.touchedCards.has(card.order)}
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
  const editing = props.onEditCard !== undefined;
  const chosen =
    props.canChooseClueTarget
    && !seat.acting
    && !editing
    && props.clueTarget === seat.playerIndex;

  let boxClass = "tw:ring-1 tw:ring-game-raised";
  if (seat.active) {
    boxClass = "tw:bg-game-turn/10 tw:ring-3 tw:ring-game-turn";
  } else if (chosen) {
    boxClass = "tw:bg-clue/10 tw:ring-2 tw:ring-clue";
  } else if (seat.you) {
    boxClass = "tw:bg-game-zone tw:ring-1 tw:ring-game-line";
  }

  const chip = <NameChip seat={seat} />;

  // Holding the pointer down on another player's cards shows their view of them until it lifts, as
  // on the classic screen. While editing cards, a press picks the card to change instead.
  const empathyHold = !seat.you && !editing;
  const heldRef = useRef(false);
  function endHold() {
    if (heldRef.current) {
      heldRef.current = false;
      props.onHoldEmpathy(undefined);
    }
  }
  const giverColor =
    props.shownClue?.giver === seat.playerIndex
      ? getClueMarkerColor(props.shownClue.marker)
      : undefined;

  return (
    <div
      aria-label={`${seat.name}'s hand`}
      className={`tw:relative tw:flex tw:rounded-2xl tw:px-4 ${
        props.nameColumnWidth === undefined
          ? "tw:flex-col tw:items-start"
          : "tw:items-center"
      } ${boxClass}`}
      data-hand={seat.playerIndex}
      role="group"
      // With the name above the cards, the gap leaves room for the clue tokens, so that they do not
      // cover the name.
      style={{
        paddingTop: getHandBoxTopPadding(props.cardWidth),
        paddingBottom: HAND_BOX_BOTTOM_PADDING,
        gap:
          props.nameColumnWidth === undefined
            ? props.cardWidth * CLUE_TOKEN_REACH_PER_WIDTH
            : NAME_GAP,
      }}
    >
      <div
        className="tw:flex tw:max-w-full tw:shrink-0"
        style={{ width: props.nameColumnWidth }}
      >
        {/* The name of the player who gave the clue on the turn that shows keeps a ring in the
            clue's color. */}
        <span
          className="tw:relative tw:inline-flex tw:max-w-full tw:min-w-0 tw:rounded-full"
          data-name-chip={seat.playerIndex}
          // Right-clicking a name views the game from that seat, as on the classic screen.
          onContextMenu={(event) => {
            event.preventDefault();
            props.onViewAs?.(seat.playerIndex);
          }}
          style={
            giverColor === undefined
              ? undefined
              : {
                  boxShadow: `0 0 0 ${CLUE_RING_WIDTH}px ${giverColor}, 0 0 0 ${
                    CLUE_RING_WIDTH + CLUE_EDGE_WIDTH
                  }px ${giverColor === "white" ? "black" : "white"}`,
                }
          }
        >
          {chip}
        </span>
        {!seat.you && props.onToggleEmpathy !== undefined && (
          <button
            aria-label={`Show ${seat.name}'s view of their hand`}
            aria-pressed={props.empathyToggled.has(seat.playerIndex)}
            className={`tw:ml-1.5 tw:flex tw:size-7 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:self-center tw:rounded-full tw:border-0 tw:text-[13px] ${
              props.empathyToggled.has(seat.playerIndex)
                ? "tw:bg-game-text tw:text-card-ink"
                : "tw:bg-transparent tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            }`}
            onClick={() => {
              props.onToggleEmpathy?.(seat.playerIndex);
            }}
            ref={tooltipRef(
              `Show ${seat.name}'s hand as they see it. You can also hold your finger on their cards.`,
            )}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-eye" />
          </button>
        )}
      </div>
      <div
        // A long press on a touch screen shows the player's view instead of selecting text or
        // opening the browser's menu.
        className={`tw:flex ${empathyHold ? "tw:select-none tw:[-webkit-touch-callout:none]" : ""}`}
        onContextMenu={(event) => {
          if (empathyHold) {
            event.preventDefault();
          }
        }}
        onPointerCancel={endHold}
        onPointerDown={(event) => {
          if (!empathyHold || event.button !== 0) {
            return;
          }
          heldRef.current = true;
          props.onHoldEmpathy(seat.playerIndex);
        }}
        onPointerLeave={endHold}
        onPointerUp={endHold}
        style={{
          gap: CARD_GAP,
          cursor: empathyHold ? EMPATHY_CURSOR : undefined,
        }}
      >
        {seat.cards.map((card, i) => (
          <CardNote
            editing={props.noteCard === card.order}
            key={card.order}
            noteHtml={props.notesHtml.get(card.order) ?? ""}
            onCloseEditor={props.onCloseNote}
            onRightClick={
              props.onRightClickCard === undefined
                ? undefined
                : (event) => {
                    props.onRightClickCard?.(event, card.order);
                  }
            }
            order={card.order}
          >
            <HandCard
              card={card}
              editing={editing}
              props={props}
              seat={seat}
              slot={i + 1}
            />
          </CardNote>
        ))}
      </div>
      {props.emptyClueTarget === seat.playerIndex && (
        // A badge on the top edge of the hand, where the markers would be.
        <span
          className="tw:absolute tw:top-0 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-lg tw:bg-clue tw:px-2.5 tw:py-1 tw:text-sm tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:shadow-md tw:ring-2 tw:ring-card-ink"
          data-clue-empty
        >
          The clue touched no cards
        </span>
      )}
    </div>
  );
}

/**
 * Every hand, one row each: the viewer's own first, then the others in the order that they play.
 * Each row is only as wide as its cards, so that a row of small cards does not end in empty space.
 */
export function Hands(props: HandsProps): React.JSX.Element {
  return (
    <section
      aria-label="Hands"
      className="tw:relative tw:flex tw:flex-col tw:items-start tw:justify-center tw:gap-1.5"
      onPointerDown={(event) => {
        const order = getCardOrderAt(event.target);
        if (event.button === 0 && order !== undefined) {
          props.onPressCard(order);
        }
      }}
    >
      {props.seats.map((seat) => (
        <Hand key={seat.playerIndex} props={props} seat={seat} />
      ))}
      {props.shownClue !== undefined && (
        <ClueRail
          color={getClueMarkerColor(props.shownClue.marker)}
          giver={props.shownClue.giver}
          target={props.shownClue.target}
        />
      )}
    </section>
  );
}

/** The card that an element is part of, if any. */
function getCardOrderAt(target: EventTarget): CardOrder | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }
  const order =
    target.closest<HTMLElement>("[data-card-order]")?.dataset["cardOrder"];
  return order === undefined ? undefined : (Number(order) as CardOrder);
}
