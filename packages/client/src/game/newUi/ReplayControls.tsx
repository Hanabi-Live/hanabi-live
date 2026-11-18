// The controls in the bar along the bottom while the screen shows a replay: the in-game replay, a
// finished game, or a hypothetical. They call the same functions as the classic screen's replay
// controls.

// They are in the middle of the bar, between the numbers about the game and its buttons, so that
// the hands keep most of the height of the screen. The bar takes the colors of the screen's mode
// (see "screenMode.ts"). The buttons and the timeline are large, because a player clicks them many
// times in a row.

import { clamp } from "complete-common";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import {
  canToggleDrawnCards,
  controlsHypothetical,
  getDrawnCardsLockTurn,
} from "../controlsHypothetical.ts";
import * as hypothetical from "../hypothetical.ts";
import type { State } from "../types/State.ts";
import * as replay from "../ui/replay.ts";
import { ChainIcon } from "./ChainIcon.tsx";
import { LeaderMenu } from "./LeaderMenu.tsx";
import { KEY_CLASS } from "./surfaces.ts";

/** How long the knob of the timeline takes to slide to the leader's turn, in milliseconds. */
const TIMELINE_SLIDE_MILLISECONDS = 300;

/** A fast start and a soft stop, so that a slide reads as a move to a place. */
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const ICON_BUTTON_CLASS = `tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-white/8 tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8 ${KEY_CLASS}`;

/** The height of a step to the next or the previous turn, which is the height of the controls. */
const STEP_HEIGHT_CLASS =
  "tw:h-11 tw:text-[20px] tw:group-data-panel/strip:text-[16px]";

/**
 * The sizes of an icon button. Spacing is in "em", so a larger font also makes a larger button. A
 * step to the next or the previous turn is the largest, because a player clicks it many times in a
 * row. The other buttons are as tall as a text button, such as the leader's menu. A normal button's
 * icon is larger than the button's own font. A jump to the first or the last turn is quieter, so
 * that it is not mistaken for a step.
 */
const ICON_BUTTON_SIZE_CLASS = {
  normal: "tw:size-11 tw:text-[15px] tw:text-game-text tw:*:text-[17px]",
  step: `tw:w-11 ${STEP_HEIGHT_CLASS} tw:text-game-text`,
  jump: "tw:size-11 tw:text-[15px] tw:text-game-muted tw:hover:text-game-text",
} as const;

/**
 * The group that holds the controls of a mode. Every mode has the same parts: the leader's controls
 * on the left, its main controls in the middle, and its other buttons on the right. Each part is as
 * tall as a step. The timeline has a smallest width, and the hint takes only the room that is left,
 * so that the bar knows the room that the controls need (see "StatusStrip.tsx"). On a narrow
 * window, the middle has a row of its own, under the others, when there are leader's controls. The
 * panel has a fixed width, so there the group can be narrower than its content. Then a long
 * leader's name makes the leader's menu smaller, and it does not push the buttons out of the panel.
 */
function Controls({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="tw:group/controls tw:flex tw:grow tw:flex-nowrap tw:group-data-panel/strip:min-w-0 tw:items-center tw:gap-x-4 tw:gap-y-2 tw:phone:flex-wrap tw:narrow-410:gap-x-3 tw:group-data-panel/strip:gap-x-1.5"
      role="status"
    >
      {children}
      {/* In a wide panel, the leader's controls share their row with the buttons on the right, and
          the rest of the controls start a new row. A narrow panel has no room for that. */}
      <span
        aria-hidden="true"
        className="tw:hidden tw:h-0 tw:basis-full tw:group-data-panel/strip:@min-[22rem]/panel:group-has-[[data-leader-controls]:not(:empty)]/controls:block tw:group-data-panel/strip:@min-[22rem]/panel:order-[-1]"
      />
    </div>
  );
}

/**
 * The middle of the controls. On a narrow window, it has the last row of the controls to itself
 * when there are leader's controls. Otherwise, it shares its row with the right of the controls, as
 * on a wide window, so that the buttons on the right do not take a row of their own. It starts from
 * no width there, so that the timeline gets shorter before the buttons wrap. On the narrowest
 * screens, the gaps get smaller too, so that the buttons on the right still fit. In the panel of
 * the wide layout (see "StatusStrip.tsx"), the middle's parts wrap with the rest of the controls,
 * so that the buttons on the right share their row (see `AFTER_TIMELINE_CLASS`).
 */
const MIDDLE_CLASS = `tw:flex tw:grow tw:items-center tw:gap-2 tw:narrow-410:gap-1.5 tw:phone:basis-0 tw:phone:group-has-[[data-leader-controls]:not(:empty)]/controls:order-last tw:phone:group-has-[[data-leader-controls]:not(:empty)]/controls:basis-full ${STEP_HEIGHT_CLASS} tw:group-data-panel/strip:contents`;

/**
 * The steps forward. In the panel (see "StatusStrip.tsx"), they come after the timeline, so that it
 * is between the steps back and the steps forward, as on a media player. A narrow panel has no room
 * for the timeline there, so it has the next row, with the buttons on the right.
 */
const AFTER_TIMELINE_CLASS = "tw:group-data-panel/strip:order-1";

/**
 * The right of the controls. On a narrow window and in a wide panel, it shares the first row with
 * the leader's controls, if there are any.
 */
const RIGHT_CLASS =
  "tw:ml-auto tw:flex tw:items-center tw:gap-2 tw:empty:hidden tw:group-data-panel/strip:order-2 tw:group-data-panel/strip:@min-[22rem]/panel:group-has-[[data-leader-controls]:not(:empty)]/controls:order-[-2]";

/**
 * The mode's icon and name. The turn on screen is in the bar, with the other numbers about the
 * game.
 */
function Heading({
  icon,
  label,
}: {
  readonly icon: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <span
      className={
        "tw:mr-1 tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:text-[15px] tw:font-semibold tw:whitespace-nowrap tw:text-game-mode"
      }
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
      {label}
    </span>
  );
}

/**
 * How far the knob's center stays from each end of the timeline. It is half the knob, with its
 * ring, when the pointer is over it, so that the knob stays inside the timeline.
 */
const KNOB_INSET_PX = 16;

/**
 * A line from the first turn to the last, with a knob on the turn on screen. Clicking it, dragging
 * along it, or turning the mouse wheel over it shows another turn. On a phone, it gets shorter, so
 * that its row fits beside the four buttons that step through the turns. In a narrow panel, it is
 * on the next row, and it fills that row except for the button on its right. Otherwise, the
 * timeline fits beside the buttons, and only the button on its right wraps.
 */
function Timeline({
  segment,
  lastSegment,
  leader,
  slide,
}: {
  readonly segment: number;
  readonly lastSegment: number;

  /**
   * The shared replay leader and the turn that they show, while we look at other turns on our own.
   * A mark shows that turn, as the classic screen's white shuttle does, and clicking it follows the
   * leader again.
   */
  readonly leader:
    | {
        readonly name: string;
        readonly amLeader: boolean;
        readonly segment: number;

        /** The number of the turn that the leader shows, as players count it, if it is known. */
        readonly turn: number | undefined;
      }
    | undefined;

  /** Whether the knob slides to a new turn instead of moving at once, for a leader's moves. */
  readonly slide: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const knobLeft = timelineLeft(segment, lastSegment);

  function showTurnAt(clientX: number) {
    const track = ref.current;
    if (track === null) {
      return;
    }

    const box = track.getBoundingClientRect();
    const travel = box.width - 2 * KNOB_INSET_PX;
    const at =
      travel <= 0
        ? 1
        : clamp((clientX - box.left - KNOB_INSET_PX) / travel, 0, 1);
    const target = Math.round(at * lastSegment);

    // As on the classic screen, the timeline only moves the knob. Asking for the last turn while it
    // is on screen would exit the in-game replay.
    if (target !== segment) {
      replay.goToSegment(target, true);
    }
  }

  return (
    <div
      aria-label="Turn"
      aria-valuemax={lastSegment + 1}
      aria-valuemin={1}
      aria-valuenow={segment + 1}
      className={`tw:group tw:relative tw:min-w-36 tw:flex-1 tw:group-data-panel/strip:min-w-[96px] tw:group-data-panel/strip:@max-[22rem]/panel:order-1 tw:group-data-panel/strip:@max-[22rem]/panel:min-w-[calc(100%-2.75rem-0.375rem)] tw:narrow-530:min-w-20 tw:narrow-410:min-w-12 tw:cursor-pointer tw:touch-none ${STEP_HEIGHT_CLASS}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        showTurnAt(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          showTurnAt(event.clientX);
        }
      }}
      // As on the classic screen, the mouse wheel steps through the turns: down is forward.
      onWheel={(event) => {
        if (event.deltaY > 0) {
          replay.forward();
        } else if (event.deltaY < 0) {
          replay.back();
        }
      }}
      ref={ref}
      role="slider"
      tabIndex={-1}
    >
      <span className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:h-2.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-white/12" />
      <span
        className="tw:absolute tw:top-1/2 tw:left-0 tw:h-2.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-mode"
        style={{
          width: knobLeft,
          transition: slide
            ? `width ${TIMELINE_SLIDE_MILLISECONDS}ms ${EASE_OUT}`
            : undefined,
        }}
      />
      {leader !== undefined && (
        // Under our knob, so that our own turn stays in front. It is a bar that is taller than our
        // knob, so that its ends show even when it is one turn away from ours. The button is wider
        // than the bar, so that it is easy to click.
        <button
          aria-label={
            leader.amLeader ? "Everyone's turn" : `${leader.name}'s turn`
          }
          className="tw:group/leader tw:absolute tw:-inset-y-1.5 tw:flex tw:w-5 tw:-translate-x-1/2 tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:bg-transparent tw:p-0"
          onClick={() => {
            // The leader goes back to the turn that everyone sees, and takes them along again.
            if (leader.amLeader) {
              replay.goToSegment(leader.segment);
            }
            replay.toggleSharedSegments();
          }}
          onPointerDown={(event) => {
            // The timeline would show the turn under the pointer instead.
            event.stopPropagation();
          }}
          ref={tooltipRef(leaderMarkTooltip(leader))}
          style={{ left: timelineLeft(leader.segment, lastSegment) }}
          tabIndex={-1}
          type="button"
        >
          <span className="tw:h-full tw:w-3 tw:rounded-full tw:border-2 tw:border-solid tw:border-card-ink tw:bg-game-text tw:transition-transform tw:group-hover/leader:scale-115" />
        </button>
      )}
      <span
        className="tw:absolute tw:top-1/2 tw:size-5 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-text tw:shadow-[0_0_0_4px_var(--game-screen-mode)] tw:transition-transform tw:group-hover:scale-115"
        style={{
          left: knobLeft,
          transition: slide
            ? `left ${TIMELINE_SLIDE_MILLISECONDS}ms ${EASE_OUT}, transform 150ms`
            : undefined,
        }}
      />
    </div>
  );
}

function leaderMarkTooltip(leader: {
  readonly name: string;
  readonly amLeader: boolean;
  readonly turn: number | undefined;
}): string {
  const turn = leader.turn === undefined ? "this turn" : `turn ${leader.turn}`;
  return leader.amLeader
    ? `Everyone else sees ${turn}. Go back to it, and take everyone along again.`
    : `Follow ${leader.name} again, from ${turn}.`;
}

/** Where a turn is along the timeline, as a CSS length from its left end. */
function timelineLeft(segment: number, lastSegment: number): string {
  // A leader on the classic screen can show a segment after the last one here.
  const fraction = lastSegment === 0 ? 1 : Math.min(segment / lastSegment, 1);
  return `calc(${KNOB_INSET_PX}px + (100% - ${2 * KNOB_INSET_PX}px) * ${fraction})`;
}

function IconButton({
  label,
  icon,
  size = "normal",
  disabled = false,
  tooltip = label,
  iconClassName = "",
  className = "",
  onClick,
}: {
  readonly label: string;
  readonly icon: string;
  readonly size?: keyof typeof ICON_BUTTON_SIZE_CLASS;
  readonly disabled?: boolean;
  /** What the button does, in the site's tooltip, when its label does not say enough. */
  readonly tooltip?: string;
  /** Classes for the icon, such as its color. */
  readonly iconClassName?: string;
  /** Classes for the button's place among the controls. */
  readonly className?: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className={`${ICON_BUTTON_CLASS} ${ICON_BUTTON_SIZE_CLASS[size]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      <i aria-hidden="true" className={`fas ${icon} ${iconClassName}`} />
    </button>
  );
}

/**
 * A check box for a button that stays pressed while its setting is on. The site only bundles the
 * solid icons, so the box is drawn instead of using an icon.
 */
export function Checkbox({
  checked,
}: {
  readonly checked: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:box-border tw:flex tw:size-4 tw:items-center tw:justify-center tw:rounded tw:border-2 tw:border-solid ${
        checked
          ? "tw:border-game-text tw:bg-game-text tw:text-card-ink"
          : "tw:border-game-muted"
      }`}
    >
      {checked && <i className="fas fa-check tw:text-[9px]" />}
    </span>
  );
}

/** The shape of the switch to follow the leader: an icon button that sets no color. */
const FOLLOW_BUTTON_SHAPE_CLASS = `tw:flex tw:size-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 ${KEY_CLASS}`;

/**
 * A spectator's switch to follow the shared replay leader, or to move through the turns on their
 * own. A step through the turns also stops them from following. It is lit while they follow. It is
 * beside the leader's menu in every mode, so that it stays in one place when it is switched on and
 * off, and when the leader starts or ends a hypothetical. The leader has a switch to share their
 * turns in its place. Its chain is linked while they follow, and apart while they do not.
 */
function FollowToggle({
  state,
}: {
  readonly state: State;
}): React.JSX.Element | undefined {
  const { states, shared } = state.replay;
  if (shared === undefined) {
    return undefined;
  }

  if (shared.amLeader) {
    return state.replay.hypothetical === undefined ? (
      <ShareTurnsToggle state={state} />
    ) : undefined;
  }

  const following = shared.useSharedSegments;

  // The states are indexed by segment, and their turn numbers start at 0.
  const turnNum = states[shared.segment]?.turn.turnNum;
  let tooltip = `Follow ${shared.leader} again.`;
  if (following) {
    tooltip = `You follow ${shared.leader}. Stop following them, and move through the turns on your own.`;
  } else if (shared.hypothetical !== undefined) {
    tooltip = `Join ${shared.leader}'s hypothetical, and follow them again.`;
  } else if (turnNum !== undefined) {
    tooltip = `Go to turn ${turnNum + 1} with ${shared.leader}, and follow them again.`;
  }

  return (
    <button
      aria-label={`Follow ${shared.leader}`}
      aria-pressed={following}
      className={`${FOLLOW_BUTTON_SHAPE_CLASS} ${
        following
          ? "tw:bg-game-text tw:text-card-ink tw:hover:bg-white"
          : "tw:bg-white/8 tw:text-game-mode tw:hover:bg-white/15"
      }`}
      onClick={replay.toggleSharedSegments}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      <ChainIcon linked={following} />
    </button>
  );
}

/**
 * The leader's switch to take everyone along through the turns, or to look at turns on their own.
 * It is in the place of a spectator's switch to follow the leader, and it is lit while everyone
 * sees the leader's turns. Up and Down also switch it.
 */
function ShareTurnsToggle({
  state,
}: {
  readonly state: State;
}): React.JSX.Element | undefined {
  const { states, shared } = state.replay;
  if (shared === undefined) {
    return undefined;
  }

  const sharing = shared.useSharedSegments;

  // The states are indexed by segment, and their turn numbers start at 0.
  const sharedTurnNum = states[shared.segment]?.turn.turnNum;
  const ourTurnNum =
    state.replay.segment === undefined
      ? undefined
      : states[state.replay.segment]?.turn.turnNum;
  let tooltip =
    "Everyone sees the turns that you show. Stop this to look at turns on your own.";
  if (!sharing) {
    const others =
      sharedTurnNum === undefined
        ? "You look at turns on your own."
        : `You look at turns on your own, and everyone else stays on turn ${sharedTurnNum + 1}.`;
    const take =
      ourTurnNum === undefined
        ? "Take everyone to the turn that you show."
        : `Take everyone to turn ${ourTurnNum + 1}.`;
    tooltip = `${others} ${take}`;
  }

  return (
    <button
      aria-label="Share your turns"
      aria-pressed={sharing}
      className={`${FOLLOW_BUTTON_SHAPE_CLASS} ${
        sharing
          ? "tw:bg-game-text tw:text-card-ink tw:hover:bg-white"
          : "tw:bg-white/8 tw:text-game-mode tw:hover:bg-white/15"
      }`}
      onClick={replay.toggleSharedSegments}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      <ChainIcon linked={sharing} />
    </button>
  );
}

/**
 * A spectator's controls while the leader tries other moves. The leader's menu and the switch to
 * follow the leader are where the controls of the turns have them, so that they do not move when
 * the mode changes. The menu names who leads, so the heading does not.
 */
function SpectatorHypotheticalControls({
  state,
}: {
  readonly state: State;
}): React.JSX.Element {
  return (
    <Controls>
      <LeaderControls state={state} />
      <div className={MIDDLE_CLASS}>
        <Heading icon="fa-flask" label="Shared hypothetical" />
      </div>
    </Controls>
  );
}

/** A button of the controls of a hypothetical. It is the size of the button that enters one. */
const HYPOTHETICAL_BUTTON_SHAPE_CLASS = `tw:flex tw:size-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:text-[15px] tw:*:text-[17px] tw:disabled:cursor-default tw:disabled:opacity-40 ${KEY_CLASS}`;

const HYPOTHETICAL_BUTTON_CLASS = `${HYPOTHETICAL_BUTTON_SHAPE_CLASS} tw:bg-white/8 tw:text-game-text tw:hover:bg-white/15 tw:disabled:hover:bg-white/8`;

/** A button that stays pressed while its setting is on. It is lit while pressed. */
function IconToggle({
  label,
  icon,
  pressed,
  disabled = false,
  tooltip,
  onClick,
}: {
  readonly label: string;
  readonly icon: string;
  readonly pressed: boolean;
  readonly disabled?: boolean;
  /** What the button does, in the site's tooltip. */
  readonly tooltip: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={
        pressed
          ? `${HYPOTHETICAL_BUTTON_SHAPE_CLASS} tw:bg-game-text tw:text-card-ink tw:hover:bg-white`
          : HYPOTHETICAL_BUTTON_CLASS
      }
      disabled={disabled}
      onClick={onClick}
      ref={tooltipRef(`${label}: ${tooltip}`)}
      type="button"
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
    </button>
  );
}

/**
 * What to do next in a hypothetical. It takes only the room that is left, so that it never pushes
 * the other controls onto a row of their own. A hint that does not fit is cut off, and only then
 * does its tooltip show all of it. On a narrow window, it wraps onto a second line in smaller text
 * instead. The text is only as wide as it needs, so that its tooltip is centered on it.
 */
function HypotheticalHint({
  hint,
}: {
  readonly hint: string;
}): React.JSX.Element {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (text === null) {
      return undefined;
    }

    function check() {
      if (text !== null) {
        setTruncated(
          text.scrollWidth > text.clientWidth
            || text.scrollHeight > text.clientHeight,
        );
      }
    }

    check();
    const observer = new ResizeObserver(check);
    observer.observe(text);
    return () => {
      observer.disconnect();
    };
  }, [hint]);

  const tooltip = tooltipRef(truncated ? hint : undefined);

  return (
    <div className="tw:ml-2 tw:flex tw:w-0 tw:grow">
      <p
        className="tw:m-0 tw:min-w-0 tw:truncate tw:text-[15px] tw:text-game-muted tw:phone:line-clamp-2 tw:phone:text-[13px] tw:phone:leading-tight tw:phone:whitespace-normal"
        // The bar has room for one row only when the whole hint fits (see "StatusStrip.tsx").
        data-full-width
        ref={(element) => {
          textRef.current = element;
          return tooltip(element);
        }}
      >
        {hint}
      </p>
    </div>
  );
}

/**
 * The controls of a hypothetical that we control. Going back a turn and passing are where the steps
 * through the turns are, and what to do next is where the timeline is. The other buttons are on the
 * right. The last one is lit in the color of the mode, and leaves the hypothetical. It is the size
 * of the button that entered it, and in its place.
 */
function OwnHypotheticalControls({
  state,
  editingCards,
  onToggleEditCards,
  hint,
}: {
  readonly state: State;
  readonly editingCards: boolean;
  readonly onToggleEditCards: () => void;
  readonly hint: string;
}): React.JSX.Element {
  const hypo = state.replay.hypothetical;
  const lockTurn = getDrawnCardsLockTurn(state);

  // A hypothetical in a shared replay is the leader's, like the replay around it, and here we lead.
  const name =
    state.replay.shared !== undefined
    && state.replay.ownHypothetical === undefined
      ? "the shared hypothetical, which you lead"
      : "the hypothetical";

  return (
    <Controls>
      <LeaderControls state={state} />
      <div className={MIDDLE_CLASS}>
        <button
          aria-label="Back a turn in the hypothetical"
          className={HYPOTHETICAL_BUTTON_CLASS}
          disabled={hypo === undefined || hypo.states.length <= 1}
          onClick={hypothetical.sendHypotheticalBack}
          ref={tooltipRef("Go back a turn in the hypothetical.")}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-undo" />
        </button>
        <button
          aria-label="Pass"
          className={HYPOTHETICAL_BUTTON_CLASS}
          disabled={!hypothetical.canPassTurnInHypothetical(state)}
          onClick={hypothetical.sendHypotheticalPassTurn}
          ref={tooltipRef(
            "Pass: spend a clue to pass the turn to the next player without giving a clue.",
          )}
          type="button"
        >
          {/* A hand that points to the next player. An arrow would look like a step through the
              replay's turns, and the flat hand is the icon of the "Real life mode" setting. */}
          <i aria-hidden="true" className="fas fa-hand-point-right" />
        </button>
        <HypotheticalHint hint={hint} />
      </div>
      <div className={RIGHT_CLASS}>
        <IconToggle
          disabled={!canToggleDrawnCards(state)}
          icon="fa-magic"
          label="Show drawn cards"
          onClick={hypothetical.toggleRevealed}
          pressed={hypo?.showDrawnCards === true}
          tooltip={
            lockTurn === undefined
              ? "Show the faces of the cards drawn during the hypothetical."
              : `Locked, because a card drawn during the hypothetical was played, discarded, or clued. Go back to before turn ${lockTurn} to unlock it.`
          }
        />
        <IconToggle
          icon="fa-pen"
          label="Edit cards"
          onClick={onToggleEditCards}
          pressed={editingCards}
          tooltip="While this is on, click a card in a hand to change it into another card."
        />
        <button
          aria-label="Exit hypothetical"
          className={`${HYPOTHETICAL_BUTTON_SHAPE_CLASS} tw:bg-game-mode/30 tw:text-game-mode tw:inset-ring-1 tw:inset-ring-game-mode tw:hover:bg-game-mode/45`}
          onClick={hypothetical.endHypothetical}
          ref={tooltipRef(`Exit ${name}.`)}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-flask" />
        </button>
      </div>
    </Controls>
  );
}

/**
 * Whether the screen shows a replay, and so the replay controls. In a finished game, they always
 * show.
 */
export function hasReplayControls(state: State): boolean {
  return (
    state.visibleState !== undefined
    && (state.finished || state.replay.segment !== undefined)
  );
}

/** The controls of the replay that the screen shows. */
export function ReplayControls({
  state,
  editingCards,
  onToggleEditCards,
  hypotheticalHint,
}: {
  readonly state: State;

  /** Whether the viewer edits cards in a hypothetical that they control. */
  readonly editingCards: boolean;
  readonly onToggleEditCards: () => void;

  /** What the viewer can do next in a hypothetical that they control. */
  readonly hypotheticalHint: string;
}): React.JSX.Element {
  if (state.replay.hypothetical !== undefined) {
    return controlsHypothetical(state) ? (
      <OwnHypotheticalControls
        editingCards={editingCards}
        hint={hypotheticalHint}
        onToggleEditCards={onToggleEditCards}
        state={state}
      />
    ) : (
      <SpectatorHypotheticalControls state={state} />
    );
  }

  return <TurnsControls state={state} />;
}

/**
 * The shared replay's leader menu and the switch to follow the leader, on the left of the controls.
 * A long name makes the menu's text smaller, so that the menu does not push the other controls
 * aside. They do not shrink in the bar's row, so that the bar sees when it has no room for them. On
 * a narrow window, they share a row with the buttons on the right, and the menu can shrink. There,
 * they start with no width and take the room that the buttons leave. Otherwise, more buttons on the
 * right, as in a hypothetical, would wrap onto a row of their own, and the bar would grow.
 */
function LeaderControls({
  state,
}: {
  readonly state: State;
}): React.JSX.Element {
  const { shared } = state.replay;
  return (
    <div
      className="tw:flex tw:shrink-0 tw:gap-2 tw:empty:hidden tw:phone:min-w-0 tw:phone:shrink tw:phone:grow tw:phone:basis-0 tw:group-data-panel/strip:@max-[22rem]/panel:basis-full tw:group-data-panel/strip:@min-[22rem]/panel:order-[-3]"
      data-leader-controls
    >
      {shared !== undefined && (
        // The menu takes the width of its full text (up to its largest width), so that the bar
        // knows the room that it needs.
        <div className="tw:flex tw:w-max tw:max-w-56 tw:min-w-0 tw:phone:w-auto">
          <LeaderMenu
            amLeader={shared.amLeader}
            leader={shared.leader}
            spectators={state.spectators}
          />
        </div>
      )}
      <FollowToggle state={state} />
    </div>
  );
}

/** The controls of a replay that is not a hypothetical, which move through its turns. */
function TurnsControls({
  state,
}: {
  readonly state: State;
}): React.JSX.Element {
  const { visibleState, replay: replayState } = state;
  if (visibleState === undefined) {
    throw new Error("The replay controls need a turn on screen.");
  }
  const { shared } = replayState;
  const spoilerFree = shared?.spoilerFree === true;
  const segment = visibleState.turn.segment ?? 0;
  const lastSegment = replay.getLastSegment(state, true);
  // The buttons and the timeline step through segments, as the classic screen's do.
  const atStart = segment === 0;
  const atEnd = segment >= lastSegment;
  const afterGameEnd = hypothetical.isAfterGameEnd(state);

  // While we follow someone else's lead, the turn moves without us, so the timeline slides.
  const following =
    shared !== undefined && shared.useSharedSegments && !shared.amLeader;

  // The states are indexed by segment, and their turn numbers start at 0.
  const sharedTurnNum =
    shared === undefined
      ? undefined
      : replayState.states[shared.segment]?.turn.turnNum;
  const sharedTurn =
    sharedTurnNum === undefined ? undefined : sharedTurnNum + 1;

  // Once we look at other turns on our own, the timeline marks the turn that the leader shows. For
  // the leader, it marks the turn that everyone else sees.
  const leaderMark =
    shared === undefined || shared.useSharedSegments
      ? undefined
      : {
          name: shared.leader,
          amLeader: shared.amLeader,
          segment: shared.segment,
          turn: sharedTurn,
        };

  // The buttons that step through the turns are together, so that a player can click back and forth
  // without moving the mouse far. The leader's menu, which names who leads, and the switch to
  // follow them are on their left, so the controls need no heading. The timeline fills the room
  // that is left, so that it is wide enough to pick a turn with the mouse. The button that enters a
  // hypothetical is at the right end. The way back to the game is with the bar's other buttons,
  // where the way into the replay is.
  return (
    <Controls>
      <LeaderControls state={state} />
      <div className={MIDDLE_CLASS}>
        <IconButton
          disabled={atStart}
          icon="fa-step-backward"
          label="First turn"
          onClick={replay.backFull}
          size="jump"
        />
        <IconButton
          disabled={atStart}
          icon="fa-chevron-left"
          label="Previous turn"
          onClick={() => {
            replay.back();
          }}
          size="step"
        />
        <IconButton
          className={AFTER_TIMELINE_CLASS}
          disabled={atEnd}
          icon="fa-chevron-right"
          label="Next turn"
          onClick={replay.forward}
          size="step"
        />
        {!spoilerFree && (
          <IconButton
            className={AFTER_TIMELINE_CLASS}
            disabled={atEnd}
            icon="fa-step-forward"
            label="Last turn"
            onClick={replay.forwardFull}
            size="jump"
          />
        )}
        {!spoilerFree && (
          <Timeline
            lastSegment={lastSegment}
            leader={leaderMark}
            segment={segment}
            slide={following}
          />
        )}
      </div>
      <div className={RIGHT_CLASS}>
        {/* On a turn after the game ended, the button is disabled instead of hidden, so that the
            timeline does not change its width on the last turn. */}
        <IconButton
          disabled={afterGameEnd}
          icon="fa-flask"
          iconClassName="tw:text-game-hypothetical"
          label="Enter hypothetical"
          onClick={hypothetical.startHypothetical}
          tooltip={enterHypotheticalTooltip(
            following ? shared.leader : undefined,
            afterGameEnd,
          )}
        />
      </div>
    </Controls>
  );
}

/**
 * @param followedLeader The shared replay leader, if we follow them.
 * @param afterGameEnd Whether the turn on screen is after the game ended.
 */
function enterHypotheticalTooltip(
  followedLeader: string | undefined,
  afterGameEnd: boolean,
): string {
  if (afterGameEnd) {
    return "The game is over on this turn. Go back a turn to enter a hypothetical.";
  }
  return followedLeader === undefined
    ? "Enter hypothetical: try out other moves from this turn."
    : `Enter hypothetical: stop following ${followedLeader}, and try out other moves from this turn.`;
}
