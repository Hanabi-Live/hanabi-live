import type { CardOrder, PlayerIndex, Variant } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef } from "react";
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
import { HAND_PLACE_PREFIX } from "./cardMotion.ts";
import type { CardNotes } from "./CardNote.tsx";
import { CardNote } from "./CardNote.tsx";
import { CLUE_DRAWER_HAND_CLASS } from "./ClueMenu.tsx";
import { ClueTokenIcon } from "./ClueTokenIcon.tsx";
import { FitText } from "./FitText.tsx";
import { measure } from "./screenScale.ts";
import { SendingMark } from "./SendingMark.tsx";
import { KEY_CLASS } from "./surfaces.ts";
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

  readonly notes: CardNotes;

  /** In a hypothetical, while the viewer edits cards, clicking a card changes it into another. */
  readonly onEditCard: ((order: CardOrder) => void) | undefined;

  /** Clicking a name lists the player's actions, as on the classic screen. */
  readonly onShowPlayerLog: (playerIndex: PlayerIndex) => void;

  /**
   * The hands that show their player's view of them ("empathy"): only what the clues have told the
   * player. A hand shows it while the viewer holds the pointer down on it, or while its eye button
   * is on. Only touch screens, which have no cursor to show the eye over the cards, get eye buttons
   * (`onToggleEmpathy`).
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
          : -Math.min(CLUE_RAIL_OFFSET, box.left - CLUE_RAIL_WINDOW_MARGIN);
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

/** The width that the eye button takes beside a name, with its gap, in CSS pixels. */
export const EMPATHY_TOGGLE_SPACE = 34;

/**
 * The cursor over another player's cards, where holding the mouse button down shows their view of
 * them: a white eye with a dark outline, which shows on any card. It points with its center.
 */
const EMPATHY_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M1.5 12C4.5 6.5 8 4.5 12 4.5s7.5 2 10.5 7.5c-3 5.5-6.5 7.5-10.5 7.5S4.5 17.5 1.5 12z' fill='white' stroke='black' stroke-width='1.5'/><circle cx='12' cy='12' r='4' fill='black'/><circle cx='13.5' cy='10.5' r='1.25' fill='white'/></svg>",
)}") 12 12, pointer`;

/**
 * The cursor over a card while editing cards, where a click changes the card: a white pencil with a
 * dark outline, like the eye. It points with its tip.
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
 * is as wide as the widest name. A longer name is drawn smaller.
 */
export const NAME_COLUMN_MAX_WIDTH = {
  WIDE: 150,

  /** For windows up to the 1440 px breakpoint, where the side columns are narrower too. */
  MEDIUM: 110,
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

/**
 * The H-Group warning for the current player, under their clock. The player sets "Use H-Group
 * conventions" to see it.
 */
function TurnWarningTag({
  warning,
  underName,
}: {
  readonly warning: TurnWarning | undefined;
  readonly underName: boolean;
}): React.JSX.Element | undefined {
  if (warning === undefined) {
    return undefined;
  }

  const { label, icon, colorClass, tooltip } = TURN_WARNING[warning];
  return (
    <span
      className={`tw:flex tw:items-center tw:gap-1.5 tw:text-[13px] tw:font-semibold ${colorClass} ${underName ? "tw:pl-3.5" : ""}`}
      data-turn-warning={warning}
      ref={tooltipRef(tooltip)}
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
      {label}
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
  onWidthChange,
}: {
  readonly seats: readonly Seat[];
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

  const menuOpen = props.tapToMove && props.menuCard === card.order;
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
        {props.sendingCard === card.order && (
          <SendingMark
            label="Sending your move"
            labelEdge="bottom"
            radius={cardWidth * CARD_CORNER_PER_WIDTH}
            reducedMotion={props.reducedMotion}
          />
        )}
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
        // Under the pointer, a card that the player can drag rises a little, to invite them to pick
        // it up. Pressed, it is picked up (see "HeldCardGhost.tsx"). The shadow is a filter, so
        // that it follows a clued card, which is drawn raised. A card that is tapped to move it can
        // still scroll the page.
        className={`tw:block tw:border-0 tw:bg-transparent tw:p-0 tw:transition-[translate,filter] tw:duration-[120ms] tw:ease-out ${
          props.tapToMove
            ? "tw:cursor-pointer"
            : "tw:cursor-grab tw:touch-none tw:hover:-translate-y-0.5 tw:hover:drop-shadow-[0_4px_5px_rgb(0_0_0/35%)]"
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
        style={{ borderRadius: cardWidth * CARD_CORNER_PER_WIDTH }}
        type="button"
      >
        {face}
      </button>
      {menuOpen && (
        <div className="tw:absolute tw:top-full tw:left-1/2 tw:z-10 tw:mt-2 tw:flex tw:-translate-x-1/2 tw:gap-1.5 tw:rounded-game-panel tw:bg-game-text tw:p-1.5 tw:shadow-lg">
          <button
            className="tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-card-ink tw:px-3 tw:py-1.5 tw:font-bold tw:text-game-text"
            onClick={() => {
              props.onPlay(card.order);
            }}
            type="button"
          >
            Play
          </button>
          <button
            className="tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-3 tw:py-1.5 tw:font-bold tw:text-card-ink tw:disabled:cursor-default tw:disabled:opacity-50"
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
  // editing cards, a press picks the card to change instead.
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
        <PlayerClock
          onPause={props.onPause}
          pauseAction={seat.you ? props.pauseAction : undefined}
          reducedMotion={props.reducedMotion}
          seat={seat}
          underName={props.nameColumnWidth !== undefined}
        />
        <TurnWarningTag
          underName={props.nameColumnWidth !== undefined}
          warning={seat.turnWarning}
        />
      </div>
      <div
        // A long press on a touch screen shows the player's view instead of opening the browser's
        // menu.
        className={`tw:flex ${empathyHold ? "tw:[-webkit-touch-callout:none]" : ""}`}
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
            CLUE_RAIL_TOKEN_MAX_SIZE,
          )}
        />
      )}
    </section>
  );
}
