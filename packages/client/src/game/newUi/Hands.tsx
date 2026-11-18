import type { CardOrder, PlayerIndex, Variant } from "@hanabi-live/game";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { PauseAction } from "../pause.ts";
import type { CardClueMarker, ClueMarkerView } from "./Card.tsx";
import {
  CARD_CORNER_PER_WIDTH,
  CARD_HEIGHT_PER_WIDTH,
  CardFace,
  CLUE_TOKEN_REACH_PER_WIDTH,
  CLUED_BORDER_WIDTH,
  CLUED_RAISE_PER_WIDTH,
  ClueToken,
  describeCard,
  getClueTokenSize,
} from "./Card.tsx";
import { isMouseClick } from "./cardClicks.ts";
import { HAND_PLACE_PREFIX } from "./cardMotion.ts";
import type { CardNotes } from "./CardNote.tsx";
import { CardNote } from "./CardNote.tsx";
import { CLUE_DRAWER_HAND_CLASS } from "./ClueMenu.tsx";
import { ClueTokenIcon } from "./ClueTokenIcon.tsx";
import { FitText } from "./FitText.tsx";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { Menu } from "./Menu.tsx";
import { measure } from "./screenScale.ts";
import { SendingMark } from "./SendingMark.tsx";
import {
  KEY_CLASS,
  MENU_ICON_CLASS,
  MENU_ICON_ITEM_CLASS,
} from "./surfaces.ts";
import type { CardView, TurnWarning } from "./tableView.ts";

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

  /**
   * The time on the player's clock, if the clocks show. In a timed game, it is the time left. In an
   * untimed game, it is the time taken.
   */
  readonly clock: string | undefined;

  /**
   * Whether the player's time goes now. The clock stands out by this, not by the turn on screen,
   * since the clocks show the game as it stands, even during the in-game replay.
   */
  readonly clockRunning: boolean;

  /** The clock's tooltip, if it has one. */
  readonly clockTooltip: string | undefined;

  /** Whether the player left the game, so that the others wait for them to come back. */
  readonly disconnected: boolean;

  /** Whether the clock runs and is almost out of time, in a timed game. */
  readonly lowTime: boolean;

  /**
   * Whether the screen shows the H-Group warnings. Then the hand always keeps room for one, so that
   * the hands do not move when a warning comes or goes.
   */
  readonly turnWarnings: boolean;

  /** A warning for the current player, from the H-Group conventions. */
  readonly turnWarning: TurnWarning | undefined;
}

interface HandsProps {
  readonly seats: readonly Seat[];

  /**
   * Whether the hands are hidden, such as under the panel of a paused game. They keep their place,
   * so that nothing else moves.
   */
  readonly hidden?: boolean;

  /** Whether the screen has the phone layout, where the columns stack. */
  readonly stacked: boolean;

  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly cardWidth: number;

  /**
   * The width of the column with each player's name, in CSS pixels. On a window too narrow for the
   * names beside the cards, the names sit above the cards instead, and this is `undefined`.
   */
  readonly nameColumnWidth: number | undefined;

  /**
   * Whether the viewer can give a clue. Then, clicking another player's name opens the clues that
   * they can get (`clueMenu`) on their hand, instead of the list of their actions.
   */
  readonly canChooseClueTarget: boolean;

  /**
   * Whether the viewer could give a clue but the team has no clue tokens. Then the other players'
   * names look like keys that are turned off.
   */
  readonly outOfClues: boolean;

  /** The player whose clue menu is open, if any. Their hand stands out. */
  readonly clueTarget: PlayerIndex | undefined;
  readonly onChooseClueTarget: (playerIndex: PlayerIndex | undefined) => void;
  readonly clueMenu: React.ReactNode;

  /** The cards that the clue being chosen would touch. */
  readonly touchedCards: ReadonlySet<CardOrder>;

  /** The cards that the clue on the turn that shows touched, with the clue to mark them with. */
  readonly clueMarkers: ReadonlyMap<CardOrder, CardClueMarker>;

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
  /** The cards in the acting player's hand now, which are the only ones that can move. */
  readonly movableCards: ReadonlySet<CardOrder>;
  readonly draggedCard: CardOrder | undefined;

  /**
   * The card that the viewer queued to play or discard on their turn. It shows over the play stacks
   * or the discard pile instead (see "QueuedMove.tsx"), so its slot is empty.
   */
  readonly queuedCard: CardOrder | undefined;

  /** The card that the viewer played or discarded, while the move waits for the server. */
  readonly sendingCard?: CardOrder;

  /** The player who gets the viewer's clue, while the clue waits for the server. */
  readonly sendingClueTarget?: PlayerIndex;

  /**
   * Whether clicks on cards make moves at once, as in speedruns (see "cardClicks.ts"). Then holding
   * the pointer down on a hand does not show its player's view.
   */
  readonly speedrunClicks: boolean;

  /**
   * Starts to drag one of the viewer's cards with the mouse, to play or discard it. A touch opens
   * the card's menu instead (see `MovableCard`).
   */
  readonly onCardPointerDown: (
    event: React.PointerEvent,
    order: CardOrder,
  ) => void;

  /**
   * The card whose menu shows: "Play" and "Discard" on a card that the viewer can move (see
   * `MovableCard`).
   */
  readonly menuCard: CardOrder | undefined;
  readonly onCardTap: (order: CardOrder) => void;
  readonly onCloseCardMenu: () => void;
  readonly canDiscard: boolean;
  readonly onPlay: (order: CardOrder) => void;
  readonly onDiscard: (order: CardOrder) => void;

  readonly notes: CardNotes;

  /** In a hypothetical, while the viewer edits cards, clicking a card changes it into another. */
  readonly onEditCard: ((order: CardOrder) => void) | undefined;

  /** Clicking a name lists the player's actions, as on the classic screen. */
  readonly onShowPlayerLog: (playerIndex: PlayerIndex) => void;

  /**
   * The hands that show their player's view of them ("empathy"): only what the clues have told the
   * player. A hand shows it while the viewer holds the mouse button down on it, or while its brain
   * button is on. The brain buttons show on a touch screen and in the phone layout
   * (`onToggleEmpathy`), since a touch on a card opens its menu instead.
   */
  readonly empathyToggled: ReadonlySet<PlayerIndex>;
  readonly onToggleEmpathy: ((playerIndex: PlayerIndex) => void) | undefined;
  readonly onHoldEmpathy: (playerIndex: PlayerIndex | undefined) => void;

  /**
   * Whether the cards show their bubble of possible cards on hover, instead of their notes: while
   * the viewer holds the pointer down on a hand or holds Space.
   */
  readonly showPossibleCards: boolean;

  /** What the pause button beside the viewer's clock does, if it shows (see "../pause.ts"). */
  readonly pauseAction: PauseAction | undefined;
  readonly onPause: () => void;
  readonly reducedMotion: boolean;
}

/**
 * How far the rail that joins a clue's giver and receiver runs to the left of the hands, in CSS
 * pixels, when the play stacks are not beside the hands (on a narrow window, where the columns
 * stack). Otherwise, the rail runs halfway between the play stacks and the hands.
 */
const CLUE_RAIL_OFFSET = 16;

/** The corner radius of a hand's box, in CSS pixels, as `tw:rounded-game-panel` draws it. */
const HAND_BOX_RADIUS = 8;

/**
 * The least space between the rail and the left edge of the window. On a narrow window, where the
 * hands reach almost to that edge, the rail moves closer to the hands to keep it.
 */
const CLUE_RAIL_WINDOW_MARGIN = 6;

/**
 * The most width of the clue token on the rail, in CSS pixels. Large cards on a narrow window have
 * large tokens, but the rail has little room beside the hands.
 */
const CLUE_RAIL_TOKEN_MAX_SIZE = 40;

/**
 * The most width of the clue token on the rail in the phone layout, in CSS pixels. There, the room
 * left of the hands is taken from the cards, so it is kept small.
 */
const CLUE_RAIL_PHONE_TOKEN_MAX_SIZE = 28;

/**
 * The room from the left edge of the window to the hands in the phone layout, in CSS pixels. It
 * holds the rail at its usual distance from the hands, with the token centered on it.
 */
export const PHONE_CLUE_RAIL_SPACE =
  CLUE_RAIL_WINDOW_MARGIN
  + CLUE_RAIL_PHONE_TOKEN_MAX_SIZE / 2
  + CLUE_RAIL_OFFSET;

/** The radius of the rail's corners, in CSS pixels. */
const CLUE_RAIL_CORNER = 6;

/** The width of the rail's white line, and of the ring around the giver's name. */
const CLUE_RAIL_WIDTH = 4;
const CLUE_RING_WIDTH = 3;

/** The width of the edge around the rail and around the ring, which keeps them visible. */
const CLUE_EDGE_WIDTH = 2;

/** The color of the rail and of the ring around the giver's name, and of the edge around them. */
const CLUE_RAIL_COLOR = "white";
const CLUE_EDGE_COLOR = "black";
const CLUE_EDGE_CLASS = "tw:stroke-[black]";

/**
 * The rail's arrowhead, in CSS pixels: a broad head with a notch in its back, so that it reads as
 * an arrow at a glance.
 */
const CLUE_RAIL_HEAD = {
  length: 30,
  halfHeight: 20,
  notch: 8,
} as const;

/**
 * A rail to the left of the hands, from the name of the player who gave the clue on the turn that
 * shows to the name of the player who got it, with an arrowhead at the receiver. At a crowded
 * table, it shows who clued whom at a glance. A clue token in the middle of the rail shows which
 * clue it was. It draws itself from the giver when the clue is given (see "cardMotion.ts").
 */
function ClueRail({
  giver,
  target,
  marker,
  tokenSize,
}: {
  readonly giver: PlayerIndex;
  readonly target: PlayerIndex;
  readonly marker: ClueMarkerView;
  readonly tokenSize: number;
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const tokenRef = useRef<HTMLSpanElement>(null);

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
          : // The token stays centered on the rail, so the rail leaves room for half of it.
            -Math.min(
              CLUE_RAIL_OFFSET,
              box.left - CLUE_RAIL_WINDOW_MARGIN - tokenSize / 2,
            );
      const corner = Math.min(CLUE_RAIL_CORNER, Math.abs(toY - fromY) / 2);
      const down = toY > fromY ? 1 : -1;
      // On a narrow window, the head shrinks to fit between the rail's corner and the name.
      const headScale = Math.min(
        1,
        Math.max(0, toX - railX - corner) / CLUE_RAIL_HEAD.length,
      );
      const length = CLUE_RAIL_HEAD.length * headScale;
      const halfHeight = CLUE_RAIL_HEAD.halfHeight * headScale;
      const notch = CLUE_RAIL_HEAD.notch * headScale;
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

      // The token's disc is centered on the middle of the rail's vertical part. Near the left edge
      // of the window, it moves right to stay in view.
      const token = tokenRef.current;
      if (token === null) {
        return;
      }
      const tokenX = Math.max(
        railX - tokenSize / 2,
        CLUE_RAIL_WINDOW_MARGIN - box.left,
      );
      token.style.left = `${tokenX}px`;
      token.style.top = `${(fromY + toY) / 2 - tokenSize / 2}px`;
    }

    place();
    const observer = new ResizeObserver(place);
    observer.observe(hands);
    return () => {
      observer.disconnect();
    };
  });

  const rail = (
    <svg
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-10 tw:size-full tw:overflow-visible"
      ref={ref}
    >
      {/* The rail is white for every clue, since its token shows the clue. The dark edge keeps it
          visible on the table. */}
      <path
        className={CLUE_EDGE_CLASS}
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
        stroke={CLUE_RAIL_COLOR}
        strokeDasharray={1}
        strokeWidth={CLUE_RAIL_WIDTH}
      />
      {/* The arrowhead grows from its own center when it pops in. */}
      <polygon
        className={`${CLUE_EDGE_CLASS} tw:origin-center tw:[transform-box:fill-box]`}
        data-clue-rail-head
        fill={CLUE_RAIL_COLOR}
        strokeLinejoin="round"
        strokeWidth={CLUE_EDGE_WIDTH}
      />
    </svg>
  );

  return (
    <>
      {rail}
      <span
        aria-hidden="true"
        className="tw:pointer-events-none tw:absolute tw:z-10"
        data-clue-rail-token
        ref={tokenRef}
        style={{
          width: tokenSize,
          height: tokenSize,
        }}
      >
        <ClueToken marker={marker} size={tokenSize} />
      </span>
    </>
  );
}

/** The width that the brain button takes beside a name, with its gap, in CSS pixels. */
export const EMPATHY_TOGGLE_SPACE = 34;

/** A brain seen from the side, in a 32 by 32 box: its outline, and the folds on it. */
const BRAIN_OUTLINE =
  "M8.5 23.5C5 23.5 2.5 21 2.5 18C2.5 16 3.5 14.5 4.5 13.8C4 10.5 6.5 7.8 9.5 8C10.5 5.5 13.5 4.2 16 5.2C18 3.5 21.5 3.8 23 6C26 6 28.5 8.5 28.3 11.5C30 12.8 30.5 15.5 29.3 17.5C29.8 20.5 27.5 23 24.5 22.8C23.5 25 20.5 25.8 18.5 24.5L17.5 28.5H14.5L15 24C13 25 10 24.8 8.5 23.5Z";
const BRAIN_FOLDS =
  "M9.5 8C10 10 12 11 13.5 10.5M16 5.2C16 7.5 18 9 20 8.5M23 6C22.5 8 23.5 10 25.5 10.5M4.5 13.8C6.5 14.5 8.5 13.5 9 12M28.3 11.5C26.5 12.5 25.5 14.5 26.5 16.5M11 14.5C12.5 13 15.5 13 16.5 15C17.5 17 20 17.5 22 16M7 19C8.5 17.5 10.5 18 11.5 19.5M14 19C15 21 17.5 21.5 19 20.5M24.5 22.8C24.5 21 23 19.5 21.5 19.5";
const BRAIN_FILL = "#f7a1bd";
const BRAIN_FOLD_COLOR = "#9c2f55";

/** The brain on the buttons that show a player's view of their hand: pink, with a dark outline. */
function BrainIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="tw:size-6" viewBox="0 0 32 32">
      <path
        d={BRAIN_OUTLINE}
        fill={BRAIN_FILL}
        stroke="black"
        strokeLinejoin="round"
        strokeWidth={1.6}
      />
      <path
        d={BRAIN_FOLDS}
        fill="none"
        stroke={BRAIN_FOLD_COLOR}
        strokeLinecap="round"
        strokeWidth={1.3}
      />
    </svg>
  );
}

/**
 * The cursor over another player's cards, where holding the mouse button down shows their view of
 * them: the same brain, which shows on any card. It points with its center.
 */
const EMPATHY_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='${BRAIN_OUTLINE}' fill='${BRAIN_FILL}' stroke='black' stroke-width='1.6' stroke-linejoin='round'/><path d='${BRAIN_FOLDS}' fill='none' stroke='${BRAIN_FOLD_COLOR}' stroke-width='1.3' stroke-linecap='round'/></svg>`,
)}") 16 16, pointer`;

/**
 * The cursor over a card while editing cards, where a click changes the card: a white pencil with a
 * dark outline. It points with its tip.
 */
const EDIT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M2 22 3.4 16.3 18.3 1.5 22.5 5.7 7.7 20.6z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/><path d='M3.4 16.3 7.7 20.6M14.7 5 19 9.3' fill='none' stroke='black' stroke-width='1.5'/></svg>",
)}") 2 22, pointer`;

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
 * is as wide as the widest name. A longer name is drawn smaller. The wide layout uses the larger
 * limit, unless the hands need the room (see "getWideLayoutRoom"). The phone layout uses the
 * smaller one.
 */
export const NAME_COLUMN_MAX_WIDTH = {
  MIN: 110,
  MAX: 150,
} as const;

/**
 * How a name that is not the current player's looks. Off the viewer's turn, it is a label: a small
 * well, like the other readouts on the table. On the viewer's turn, it is a key in the color of
 * clues, which opens the player's clues. With no clue tokens, it is empty with a dashed border,
 * like the clue tokens.
 */
type NameChipLook = "label" | "key" | "chosen" | "noClues";

const NAME_CHIP_LOOK_CLASS = {
  label:
    "tw:bg-game-well tw:font-medium tw:text-game-text tw:inset-shadow-[0_2px_4px_rgb(0_0_0/45%)]",
  // The key's light top edge is on the name, not on the button under it, which the name covers.
  key: "tw:bg-clue tw:font-semibold tw:text-card-ink tw:inset-shadow-[0_1px_0_rgb(255_255_255/35%)] tw:group-hover:brightness-110",
  chosen: "tw:bg-game-text tw:font-semibold tw:text-card-ink",
  noClues:
    "tw:bg-transparent tw:font-medium tw:text-game-muted tw:outline-2 tw:-outline-offset-2 tw:outline-game-muted tw:outline-dashed",
} as const satisfies Record<NameChipLook, string>;

function NameChip({
  seat,
  look,
}: {
  readonly seat: Seat;
  readonly look: NameChipLook;
}): React.JSX.Element {
  // A player who left has a red ring and a broken link on their name, as the classic screen draws
  // their name in red. The badge sits on the ring, so that it does not change the chip's width.
  const disconnectedClass = seat.disconnected
    ? "tw:ring-2 tw:ring-game-error"
    : "";
  const disconnectedBadge = seat.disconnected ? (
    <span
      aria-label={`${seat.name} is disconnected`}
      className="tw:absolute tw:-top-2.5 tw:-right-2.5 tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded-full tw:bg-game-error tw:text-xs tw:text-card-ink tw:shadow-[0_1px_3px_rgb(0_0_0/50%)]"
      data-disconnected
      ref={tooltipRef(
        `${seat.name} is disconnected. The game waits for them to come back.`,
      )}
      role="img"
    >
      <i aria-hidden="true" className="fas fa-unlink" />
    </span>
  ) : undefined;

  if (seat.active) {
    return (
      <span
        className={`tw:relative tw:inline-flex tw:max-w-full tw:items-center tw:gap-2 tw:rounded-full tw:bg-game-text tw:px-3.5 tw:py-1.5 tw:font-bold tw:text-card-ink ${disconnectedClass}`}
      >
        <FitText text={seat.name} />
        {disconnectedBadge}
      </span>
    );
  }

  let tooltip: string | undefined;
  if (look === "key") {
    tooltip = `Give ${seat.name} a clue`;
  } else if (look === "noClues") {
    tooltip = "The team has no clues to give.";
  }

  // The key has a clue token before the name, so that it shows what the key does. The chosen key
  // keeps it, so that the name does not move.
  const hasToken = look === "key" || look === "chosen";

  return (
    <span
      className={`tw:relative tw:inline-flex tw:max-w-full tw:items-center tw:gap-1.5 tw:rounded-full tw:py-1.5 tw:pr-3.5 ${
        hasToken ? "tw:pl-2" : "tw:pl-3.5"
      } ${NAME_CHIP_LOOK_CLASS[look]} ${disconnectedClass}`}
      ref={tooltipRef(tooltip)}
    >
      {hasToken && <ClueTokenIcon className="tw:size-5" />}
      <FitText text={seat.name} />
      {disconnectedBadge}
    </span>
  );
}

/**
 * The time under a player's name. The current player's clock is the one that runs, so it is
 * brighter.
 */
function PlayerClock({
  seat,
  underName,
  pauseAction,
  onPause,
  reducedMotion,
}: {
  readonly seat: Seat;

  /** Whether the clock is under the name, where it lines up with the name's text. */
  readonly underName: boolean;

  /** What the pause button beside the clock does. Only the viewer's own clock has one. */
  readonly pauseAction: PauseAction | undefined;
  readonly onPause: () => void;
  readonly reducedMotion: boolean;
}): React.JSX.Element | undefined {
  if (seat.clock === undefined) {
    return undefined;
  }

  let clockClass = seat.clockRunning
    ? "tw:font-bold tw:text-game-text"
    : "tw:font-medium tw:text-game-muted";
  if (seat.lowTime) {
    clockClass = "tw:font-bold tw:text-card-ink";
  }

  return (
    <span
      className={`tw:flex tw:items-center tw:gap-2 ${underName ? "tw:pl-3.5" : ""}`}
    >
      <span
        // The player can also right-click their own clock to pause, as on the classic screen.
        className={`tw:relative tw:text-sm tw:tabular-nums ${clockClass}`}
        onContextMenu={
          pauseAction === undefined
            ? undefined
            : (event) => {
                event.preventDefault();
                onPause();
              }
        }
        ref={tooltipRef(seat.clockTooltip)}
      >
        {seat.lowTime && <LowTimeFlash reducedMotion={reducedMotion} />}
        <span className="tw:relative">{seat.clock}</span>
      </span>
      {pauseAction !== undefined && (
        <PauseButton action={pauseAction} onPause={onPause} />
      )}
    </span>
  );
}

/** How long one flash of a clock that is almost out of time takes, in milliseconds. */
const LOW_TIME_FLASH_MILLISECONDS = 1000;

/**
 * The red behind a clock that is almost out of time. It flashes once a second, with the warning
 * sound, as the classic screen's timer does. With "Reduced motion", it stays lit, so that the
 * player still sees the warning.
 */
function LowTimeFlash({
  reducedMotion,
}: {
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const flash = ref.current;
    if (flash === null || reducedMotion) {
      return undefined;
    }

    const animation = flash.animate([{ opacity: 1 }, { opacity: 0.35 }], {
      duration: LOW_TIME_FLASH_MILLISECONDS,
      easing: "ease-in",
      iterations: Infinity,
    });
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  return (
    <span
      aria-hidden="true"
      className="tw:absolute tw:-inset-x-1.5 tw:-inset-y-0.5 tw:rounded-game-control tw:bg-game-error"
      data-low-time
      ref={ref}
    />
  );
}

const PAUSE_BUTTON_TOOLTIP = {
  pause: "Pause the game.",
  queue:
    "Queue a pause: the game pauses when your turn starts. You can also right-click your clock.",
  unqueue:
    "Your pause is queued: the game pauses when your turn starts. Click to cancel it.",
} as const satisfies Record<PauseAction, string>;

/**
 * The button beside the viewer's clock in a timed game. On their turn, it pauses the game. On
 * another player's turn, it queues a pause, and stays lit in the color of the turn until the pause
 * happens or the player cancels it.
 */
function PauseButton({
  action,
  onPause,
}: {
  readonly action: PauseAction;
  readonly onPause: () => void;
}): React.JSX.Element {
  const queued = action === "unqueue";
  return (
    <button
      aria-label={queued ? "Cancel the queued pause" : "Pause the game"}
      aria-pressed={action === "pause" ? undefined : queued}
      className={`tw:flex tw:size-6 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:text-[10px] ${KEY_CLASS} ${
        queued
          ? "tw:bg-game-turn tw:text-card-ink tw:hover:brightness-110"
          : "tw:bg-white/15 tw:text-game-text tw:hover:bg-white/25"
      }`}
      data-pause-button
      onClick={onPause}
      ref={tooltipRef(PAUSE_BUTTON_TOOLTIP[action])}
      type="button"
    >
      <i aria-hidden="true" className="fas fa-pause" />
    </button>
  );
}

const TURN_WARNING = {
  locked: {
    label: "Locked",
    icon: "fa-lock",
    colorClass: "tw:text-game-text",
    tooltip:
      "Every card in this hand is clued, so the player may not be able to discard.",
  },
  doubleDiscard: {
    label: "Double Discard",
    icon: "fa-exclamation-triangle",
    colorClass: "tw:text-game-turn",
    tooltip:
      'The last player discarded a card that may be the other copy of a card in this hand: a "Double Discard" situation.',
  },
} as const satisfies Record<
  TurnWarning,
  {
    readonly label: string;
    readonly icon: string;
    readonly colorClass: string;
    readonly tooltip: string;
  }
>;

/** Every H-Group warning, so that a hand can keep room for the widest. */
const TURN_WARNINGS = Object.keys(TURN_WARNING) as readonly TurnWarning[];

/**
 * The H-Group warning for the current player, under their clock. The player sets "Use H-Group
 * conventions" to see it. Every hand keeps room for the widest warning, with all of the warnings
 * drawn in one cell and only the current one visible. A warning that comes or goes then does not
 * change the size of the hand, which would move the cards.
 */
function TurnWarningTag({
  warning,
  underName,
}: {
  readonly warning: TurnWarning | undefined;
  readonly underName: boolean;
}): React.JSX.Element {
  return (
    <span
      className={`tw:grid tw:text-[13px] tw:leading-tight tw:font-semibold ${underName ? "tw:pl-3.5" : ""}`}
    >
      {TURN_WARNINGS.map((key) => {
        const { label, icon, colorClass, tooltip } = TURN_WARNING[key];
        const shown = key === warning;
        return (
          <span
            aria-hidden={shown ? undefined : true}
            // When the label wraps in a narrow name column, the icon stays beside its first line.
            className={`tw:col-start-1 tw:row-start-1 tw:flex tw:items-baseline tw:gap-1.5 ${colorClass} ${shown ? "" : "tw:invisible"}`}
            data-turn-warning={shown ? key : undefined}
            key={key}
            ref={shown ? tooltipRef(tooltip) : undefined}
          >
            <i aria-hidden="true" className={`fas ${icon}`} />
            {label}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Measures the width that the name column needs. It draws every player's name, hidden, in both of
 * its styles: bold for the current player, and plain for the others. The column fits the widest, so
 * it does not change size as the turn moves from player to player.
 */
export function NameColumnSizer({
  seats,
  onSizeChange,
}: {
  readonly seats: readonly Seat[];

  /** Gets the width of the widest name, and the height of a name. */
  readonly onSizeChange: (width: number, height: number) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    // Round up, so that the widest name is not cut short by a fraction of a pixel. Every name is as
    // tall as the first one.
    const observer = new ResizeObserver(() => {
      const first = element.firstElementChild;
      onSizeChange(
        Math.ceil(measure(element).width),
        first === null ? 0 : Math.ceil(measure(first).height),
      );
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onSizeChange]);

  return (
    <div
      aria-hidden="true"
      className="tw:invisible tw:absolute tw:top-0 tw:left-0 tw:flex tw:w-max tw:flex-col tw:items-start"
      ref={ref}
    >
      {seats.flatMap((seat) => [
        <NameChip
          key={`${seat.playerIndex}-active`}
          look="label"
          seat={{
            ...seat,
            active: true,
          }}
        />,
        // A key's name is semibold, which is wider than a label's.
        <NameChip
          key={`${seat.playerIndex}-waiting`}
          look="key"
          seat={{
            ...seat,
            active: false,
          }}
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
  const queued = props.queuedCard === card.order;

  // A queued card moves from where it shows, not from its slot.
  if (queued) {
    return (
      <div
        aria-label={`Slot ${slot}: queued`}
        className="tw:box-border tw:shrink-0 tw:border-2 tw:border-dashed tw:border-clue/70"
        data-card-place={place}
        role="img"
        style={{
          width: cardWidth,
          height,
          borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
        }}
      />
    );
  }

  if (dragged) {
    return (
      <div
        className="tw:box-border tw:shrink-0 tw:border-2 tw:border-dashed tw:border-game-line"
        data-card-order={card.order}
        data-card-place={place}
        style={{
          width: cardWidth,
          height,
          borderRadius: cardWidth * CARD_CORNER_PER_WIDTH,
        }}
      />
    );
  }

  const face = (
    <CardFace
      blank={card.blank}
      clued={card.clued}
      clueMarker={props.clueMarkers.get(card.order)}
      colorblindMode={colorblindMode}
      critical={card.critical}
      doubleDiscard={card.doubleDiscard}
      identityFromNote={card.identityFromNote}
      note={props.notes.notesHtml.has(card.order)}
      noteBorder={card.noteBorder}
      noteMarks={card.noteMarks}
      noteUnread={props.notes.unreadNotes.has(card.order)}
      pips={card.pips}
      raiseClued
      rank={card.rank}
      showPossibleCards={props.showPossibleCards}
      stackDirection={card.stackDirection}
      suitIndex={card.suitIndex}
      trash={card.trash}
      trashIcon={card.trashIcon}
      variant={variant}
      width={cardWidth}
    />
  );
  const label = `Slot ${slot}: ${describeCard(variant, card.suitIndex, card.rank)}`;

  const sendingMark = props.sendingCard === card.order && (
    <SendingMark
      label="Sending your move"
      labelEdge="bottom"
      radius={cardWidth * CARD_CORNER_PER_WIDTH}
      reducedMotion={props.reducedMotion}
    />
  );

  if (!movable) {
    return (
      <div
        className="tw:relative"
        data-card-order={card.order}
        data-card-place={place}
      >
        <div aria-label={label} role="img">
          {face}
        </div>
        {sendingMark}
      </div>
    );
  }

  return (
    <MovableCard
      face={face}
      label={label}
      order={card.order}
      place={place}
      props={props}
    >
      {sendingMark}
    </MovableCard>
  );
}

/**
 * A card that the viewer can play or discard. With the mouse, the viewer drags it to the play
 * stacks or the discard pile. A tap (or a key) opens a menu that plays or discards it instead,
 * since on a touch screen or in the phone layout, the play stacks and the discard pile can be off
 * the screen. A touch on the card can still scroll the page.
 */
function MovableCard({
  order,
  place,
  label,
  face,
  props,
  children,
}: {
  readonly order: CardOrder;
  readonly place: string;
  readonly label: string;
  readonly face: React.JSX.Element;
  readonly props: HandsProps;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const menuOpen = props.menuCard === order;

  // A tap anywhere else closes the menu. A tap on another card then opens that card's menu.
  const containerRef = useRef<HTMLDivElement>(null);
  const { onCloseCardMenu } = props;
  const setOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        onCloseCardMenu();
      }
    },
    [onCloseCardMenu],
  );
  useCloseOnOutsideClick(menuOpen, containerRef, setOpen);

  return (
    <div
      className="tw:relative"
      data-card-order={order}
      data-card-place={place}
      ref={containerRef}
    >
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`${label}. Drag it to the play stacks or the discard pile, or tap it to play or discard it`}
        // Under the mouse, a card that the player can drag rises a little, to invite them to pick
        // it up. Pressed, it is picked up (see "HeldCardGhost.tsx"). The shadow is a filter, so
        // that it follows a clued card, which is drawn raised.
        className="tw:block tw:cursor-grab tw:border-0 tw:bg-transparent tw:p-0 tw:transition-[translate,filter] tw:duration-[120ms] tw:ease-out tw:hover:-translate-y-0.5 tw:hover:drop-shadow-[0_4px_5px_rgb(0_0_0/35%)]"
        onClick={(event) => {
          if (!isMouseClick(event)) {
            props.onCardTap(order);
          }
        }}
        onPointerDown={(event) => {
          props.onCardPointerDown(event, order);
        }}
        style={{ borderRadius: props.cardWidth * CARD_CORNER_PER_WIDTH }}
        type="button"
      >
        {face}
      </button>
      {children}
      {menuOpen && (
        <Menu align="center" className="tw:min-w-40" side="below">
          <button
            className={MENU_ICON_ITEM_CLASS}
            onClick={() => {
              props.onPlay(order);
            }}
            role="menuitem"
            type="button"
          >
            <i aria-hidden="true" className={`${MENU_ICON_CLASS} fa-play`} />
            Play
          </button>
          <button
            className={MENU_ICON_ITEM_CLASS}
            disabled={!props.canDiscard}
            onClick={() => {
              props.onDiscard(order);
            }}
            ref={tooltipRef(
              props.canDiscard
                ? undefined
                : "The team cannot discard at the maximum number of clues.",
            )}
            role="menuitem"
            type="button"
          >
            <i aria-hidden="true" className={`${MENU_ICON_CLASS} fa-trash`} />
            Discard
          </button>
        </Menu>
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
      // It is a block, so that it does not sit on a line of text, which would make the hand taller.
      className="tw:block tw:border-0 tw:bg-transparent tw:p-0"
      data-card-order={card.order}
      data-card-place={place}
      onClick={() => {
        props.onEditCard?.(card.order);
      }}
      style={{
        borderRadius: props.cardWidth * CARD_CORNER_PER_WIDTH,
        cursor: EDIT_CURSOR,
      }}
      type="button"
    >
      <CardFace
        blank={card.blank}
        clued={card.clued}
        clueMarker={props.clueMarkers.get(card.order)}
        colorblindMode={props.colorblindMode}
        critical={card.critical}
        doubleDiscard={card.doubleDiscard}
        identityFromNote={card.identityFromNote}
        note={props.notes.notesHtml.has(card.order)}
        noteBorder={card.noteBorder}
        noteMarks={card.noteMarks}
        noteUnread={props.notes.unreadNotes.has(card.order)}
        pips={card.pips}
        raiseClued
        rank={card.rank}
        showPossibleCards={props.showPossibleCards}
        stackDirection={card.stackDirection}
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
  const place = `${HAND_PLACE_PREFIX}${seat.playerIndex}-${slot - 1}`;
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

        movable={
          props.canMoveCards
          && seat.acting
          && props.movableCards.has(card.order)
        }
        place={place}
        props={props}
        slot={slot}
      />
    );
  }

  const label = describeCard(props.variant, card.suitIndex, card.rank);
  const face = (
    <CardFace
      blank={card.blank}
      clued={card.clued}
      clueMarker={props.clueMarkers.get(card.order)}
      colorblindMode={props.colorblindMode}
      critical={card.critical}
      doubleDiscard={card.doubleDiscard}
      highlighted={props.touchedCards.has(card.order)}
      identityFromNote={card.identityFromNote}
      note={props.notes.notesHtml.has(card.order)}
      noteBorder={card.noteBorder}
      noteMarks={card.noteMarks}
      noteUnread={props.notes.unreadNotes.has(card.order)}
      pips={card.pips}
      raiseClued
      rank={card.rank}
      showPossibleCards={props.showPossibleCards}
      stackDirection={card.stackDirection}
      suitIndex={card.suitIndex}
      trash={card.trash}
      trashIcon={card.trashIcon}
      variant={props.variant}
      width={props.cardWidth}
    />
  );
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

function Hand({
  seat,
  props,
}: {
  readonly seat: Seat;
  readonly props: HandsProps;
}): React.JSX.Element {
  const editing = props.onEditCard !== undefined;
  const canClueSeat = props.canChooseClueTarget && !seat.acting && !editing;
  const chosen = canClueSeat && props.clueTarget === seat.playerIndex;
  const noClueSeat = props.outOfClues && !seat.acting && !editing;

  let boxClass =
    "tw:bg-black/12 tw:inset-ring-1 tw:inset-ring-game-raised tw:inset-shadow-[0_2px_6px_rgb(0_0_0/35%)]";
  if (seat.active) {
    boxClass = "tw:bg-game-turn/10 tw:inset-ring-3 tw:inset-ring-game-turn";
  } else if (chosen) {
    boxClass = CLUE_DRAWER_HAND_CLASS;
  } else if (seat.you) {
    boxClass = "tw:bg-game-zone tw:inset-ring-1 tw:inset-ring-game-line";
  }

  let look: NameChipLook = "label";
  if (chosen) {
    look = "chosen";
  } else if (canClueSeat) {
    look = "key";
  } else if (noClueSeat) {
    look = "noClues";
  }
  const chip = <NameChip look={look} seat={seat} />;

  // Holding the pointer down on a player's cards shows their view of them until it lifts, as on the
  // classic screen. On the viewer's own hand, it shows the hand without the viewer's notes. While
  // editing cards, a press picks the card to change instead. Only the mouse does it: a touch on a
  // card opens its menu, so the brain buttons show the view instead.
  const empathyHold = !editing && !props.speedrunClicks;
  const heldRef = useRef(false);
  function endHold() {
    if (!heldRef.current) {
      return;
    }

    heldRef.current = false;
    props.onHoldEmpathy(undefined);
  }
  const isClueGiver = props.shownClue?.giver === seat.playerIndex;

  return (
    <div
      aria-label={`${seat.name}'s hand`}
      className={`tw:relative tw:flex tw:rounded-game-panel tw:px-4 ${
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
      {/* Beside the cards, the clock goes under the name, so that it does not take width from the
          name. Above the cards, it goes after the name, so that it does not take height from the
          cards. */}
      <div
        className={`tw:flex tw:max-w-full tw:shrink-0 ${
          props.nameColumnWidth === undefined
            ? "tw:items-center tw:gap-3"
            : "tw:flex-col tw:items-start tw:gap-1"
        }`}
        style={{ width: props.nameColumnWidth }}
      >
        <div className="tw:flex tw:max-w-full">
          {/* The name of the player who gave the clue on the turn that shows keeps a ring, where the
            clue rail starts. While the viewer can clue a player, the player's name is a key, like
            every other button on the screen, and opens the clues. */}
          <button
            aria-expanded={canClueSeat ? chosen : undefined}
            aria-haspopup="dialog"
            className={`tw:relative tw:inline-flex tw:max-w-full tw:min-w-0 tw:cursor-pointer tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-[length:inherit] tw:text-inherit ${
              canClueSeat ? `tw:group ${KEY_CLASS}` : "tw:hover:brightness-110"
            }`}
            data-name-chip={seat.playerIndex}
            onClick={() => {
              if (canClueSeat) {
                props.onChooseClueTarget(chosen ? undefined : seat.playerIndex);
              } else {
                props.onShowPlayerLog(seat.playerIndex);
              }
            }}
            style={
              isClueGiver
                ? {
                    boxShadow: `0 0 0 ${CLUE_RING_WIDTH}px ${CLUE_RAIL_COLOR}, 0 0 0 ${
                      CLUE_RING_WIDTH + CLUE_EDGE_WIDTH
                    }px ${CLUE_EDGE_COLOR}`,
                  }
                : undefined
            }
            type="button"
          >
            {chip}
          </button>
          {!seat.you && props.onToggleEmpathy !== undefined && (
            <button
              aria-label={`Show ${seat.name}'s view of their hand`}
              aria-pressed={props.empathyToggled.has(seat.playerIndex)}
              className={`tw:ml-1.5 tw:flex tw:size-7 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:self-center tw:rounded-full tw:border-0 ${
                props.empathyToggled.has(seat.playerIndex)
                  ? "tw:bg-game-text tw:text-card-ink"
                  : "tw:bg-transparent tw:hover:bg-white/10"
              }`}
              onClick={() => {
                props.onToggleEmpathy?.(seat.playerIndex);
              }}
              ref={tooltipRef(`Show ${seat.name}'s hand as they see it.`)}
              type="button"
            >
              <BrainIcon />
            </button>
          )}
        </div>
        <PlayerClock
          onPause={props.onPause}
          pauseAction={seat.you ? props.pauseAction : undefined}
          reducedMotion={props.reducedMotion}
          seat={seat}
          underName={props.nameColumnWidth !== undefined}
        />
        {seat.turnWarnings && (
          <TurnWarningTag
            underName={props.nameColumnWidth !== undefined}
            warning={seat.turnWarning}
          />
        )}
      </div>
      <div
        className="tw:flex"
        onContextMenu={(event) => {
          if (empathyHold) {
            event.preventDefault();
          }
        }}
        onPointerCancel={endHold}
        onPointerDown={(event) => {
          // A click with Shift, Alt, or Meta does something else, such as Alt + click going to the
          // turn on which the card was drawn, so it does not show the view, as on the classic
          // screen.
          if (
            !empathyHold
            || event.pointerType !== "mouse"
            || event.button !== 0
            || event.shiftKey
            || event.altKey
            || event.metaKey
          ) {
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
            key={card.order}
            notes={props.notes}
            order={card.order}
            possibleCards={
              props.showPossibleCards && card.pips?.bubble !== undefined
            }
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
          className="tw:absolute tw:top-0 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-game-control tw:bg-clue tw:px-2.5 tw:py-1 tw:text-sm tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:shadow-md tw:ring-2 tw:ring-card-ink"
          data-clue-empty
        >
          The clue touched no cards
        </span>
      )}
      {props.sendingClueTarget === seat.playerIndex && (
        <SendingMark
          label="Sending your clue"
          labelEdge="top"
          radius={HAND_BOX_RADIUS}
          reducedMotion={props.reducedMotion}
        />
      )}
      {chosen && props.clueMenu}
    </div>
  );
}

/**
 * Every hand, one row each: the viewer's own first, then the others in the order that they play.
 * Every row is as wide as the widest, so that their right edges line up when the hands have
 * different numbers of cards, such as after the deck runs out.
 */
export function Hands(props: HandsProps): React.JSX.Element {
  return (
    <section
      aria-hidden={props.hidden === true ? true : undefined}
      aria-label="Hands"
      className={`tw:relative tw:flex tw:flex-col tw:items-stretch tw:justify-center tw:self-center ${props.hidden === true ? "tw:invisible" : ""}`}
    >
      {props.seats.map((seat) => (
        <Hand key={seat.playerIndex} props={props} seat={seat} />
      ))}
      {props.shownClue !== undefined && (
        <ClueRail
          giver={props.shownClue.giver}
          marker={props.shownClue.marker}
          target={props.shownClue.target}
          tokenSize={Math.min(
            getClueTokenSize(props.cardWidth),
            props.stacked
              ? CLUE_RAIL_PHONE_TOKEN_MAX_SIZE
              : CLUE_RAIL_TOKEN_MAX_SIZE,
          )}
        />
      )}
    </section>
  );
}
