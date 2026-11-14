// The controls below the hands while the screen shows a replay: the in-game replay, a finished
// game, or a hypothetical. They call the same functions as the classic screen's replay controls.

// The bar is a dark felt panel like the other boxes on the table. The color of its heading names
// the mode: blue to look back at the game, violet to try other moves. The buttons and the timeline
// are large, because a player clicks them many times in a row.

import { clamp } from "complete-common";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import {
  canToggleDrawnCards,
  controlsHypothetical,
} from "../controlsHypothetical.ts";
import * as hypothetical from "../hypothetical.ts";
import type { State } from "../types/State.ts";
import * as replay from "../ui/replay.ts";
import { CONTROL_PANEL_CLASS } from "./CluePanel.tsx";
import { LeaderMenu } from "./LeaderMenu.tsx";
import { KEY_CLASS } from "./surfaces.ts";

type Mode = "replay" | "hypothetical";

const ACCENT_TEXT_CLASS = {
  replay: "tw:text-game-replay",
  hypothetical: "tw:text-game-hypothetical",
} as const satisfies Record<Mode, string>;

/** A quiet button for the actions that are not the main one. */
const BUTTON_CLASS = `tw:flex tw:h-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:bg-white/8 tw:px-4 tw:text-[15px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8 ${KEY_CLASS}`;

/** The bar's main action: the way back out of the mode. */
const PRIMARY_BUTTON_CLASS = `tw:flex tw:h-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-game-text tw:px-4 tw:text-[15px] tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:hover:bg-white ${KEY_CLASS}`;

/** How long the knob of the timeline takes to slide to the leader's turn, in milliseconds. */
const TIMELINE_SLIDE_MILLISECONDS = 300;

/** A fast start and a soft stop, so that a slide reads as a move to a place. */
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const ICON_BUTTON_CLASS = `tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-white/8 tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8 ${KEY_CLASS}`;

/**
 * The sizes of an icon button. Spacing is in "em", so a larger icon also makes a larger button. A
 * step to the next or the previous turn is the largest, because a player clicks it many times in a
 * row. A jump to the first or the last turn is as tall as a text button and quieter, so that it is
 * not mistaken for a step.
 */
const ICON_BUTTON_SIZE_CLASS = {
  normal: "tw:size-11 tw:text-[17px] tw:text-game-text",
  step: "tw:size-11 tw:text-[20px] tw:text-game-text",
  jump: "tw:size-11 tw:text-[15px] tw:text-game-muted tw:hover:text-game-text",
} as const;

/**
 * The bar's buttons, kept together on the right. On a narrow window, they take a row of their own.
 */
const ACTIONS_CLASS =
  "tw:ml-auto tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2 tw:narrow-980:w-full tw:narrow-980:*:flex-1";

/**
 * The panel that holds a bar. On a narrow window, the page scrolls, so the bar goes above the
 * hands, where it is in view.
 */
function Bar({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={`tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-x-2.5 tw:gap-y-2 tw:rounded-game-panel tw:py-3 tw:pr-3 tw:pl-4 tw:ring-1 tw:ring-game-line ${CONTROL_PANEL_CLASS}`}
      role="status"
    >
      {children}
    </div>
  );
}

/**
 * The mode's icon and name. The turn on screen is in the bar along the bottom, with the other
 * numbers about the game.
 */
function Heading({
  mode,
  icon,
  label,
}: {
  readonly mode: Mode;
  readonly icon: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <span
      className={`tw:mr-1 tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:text-[15px] tw:font-semibold ${ACCENT_TEXT_CLASS[mode]}`}
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
      {label}
    </span>
  );
}

/**
 * How far the knob's center stays from each end of the timeline. It is half the knob, with its
 * ring, when the pointer is over it, so that the knob stays inside the bar.
 */
const KNOB_INSET_PX = 16;

/**
 * A line from the first turn to the last, with a knob on the turn on screen. Clicking it or
 * dragging along it shows another turn.
 */
function Timeline({
  segment,
  lastSegment,
  slide,
  leaderMove,
}: {
  readonly segment: number;
  readonly lastSegment: number;

  /** The shared replay leader's last move, which flashes over the knob while we follow them. */
  readonly leaderMove: LeaderMove | undefined;

  /** Whether the knob slides to a new turn instead of moving at once, for a leader's moves. */
  readonly slide: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // A leader on the classic screen can show a segment after the last one here.
  const fraction = lastSegment === 0 ? 1 : Math.min(segment / lastSegment, 1);
  const knobLeft = `calc(${KNOB_INSET_PX}px + (100% - ${2 * KNOB_INSET_PX}px) * ${fraction})`;

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
    replay.goToSegment(Math.round(at * lastSegment), true);
  }

  return (
    <div
      aria-label="Turn"
      aria-valuemax={lastSegment + 1}
      aria-valuemin={1}
      aria-valuenow={segment + 1}
      // The knob is lower than the buttons are high, so the bar's padding below it is smaller.
      className="tw:group tw:relative tw:-mb-1 tw:h-8 tw:w-full tw:cursor-pointer tw:touch-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        showTurnAt(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          showTurnAt(event.clientX);
        }
      }}
      ref={ref}
      role="slider"
      tabIndex={-1}
    >
      <span className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:h-2.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-white/12" />
      <span
        className="tw:absolute tw:top-1/2 tw:left-0 tw:h-2.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-replay"
        style={{
          width: knobLeft,
          transition: slide
            ? `width ${TIMELINE_SLIDE_MILLISECONDS}ms ${EASE_OUT}`
            : undefined,
        }}
      />
      <span
        className="tw:absolute tw:top-1/2 tw:size-5 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-text tw:shadow-[0_0_0_4px_var(--game-screen-replay)] tw:transition-transform tw:group-hover:scale-115"
        style={{
          left: knobLeft,
          transition: slide
            ? `left ${TIMELINE_SLIDE_MILLISECONDS}ms ${EASE_OUT}, transform 150ms`
            : undefined,
        }}
      />
      {slide && (
        // Above the knob, and it moves with the knob.
        <span
          className="tw:pointer-events-none tw:absolute tw:bottom-[calc(50%+16px)] tw:flex tw:-translate-x-1/2"
          style={{
            left: knobLeft,
            transition: `left ${TIMELINE_SLIDE_MILLISECONDS}ms ${EASE_OUT}`,
          }}
        >
          <DirectionFlash move={leaderMove} />
        </span>
      )}
    </div>
  );
}

function IconButton({
  label,
  icon,
  size = "normal",
  disabled = false,
  tooltip = label,
  iconClassName = "",
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
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className={`${ICON_BUTTON_CLASS} ${ICON_BUTTON_SIZE_CLASS[size]}`}
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

/** A button that stays pressed while its setting is on, with a check box to show it. */
function ToggleButton({
  label,
  pressed,
  icon,
  disabled = false,
  tooltip,
  onClick,
}: {
  readonly label: string;
  readonly pressed: boolean;
  /** An icon between the check box and the label, such as the leader's crown. */
  readonly icon?: string;
  readonly disabled?: boolean;
  /** What the button does, in the site's tooltip. */
  readonly tooltip: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={pressed}
      className={BUTTON_CLASS}
      disabled={disabled}
      onClick={onClick}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      <Checkbox checked={pressed} />
      {icon !== undefined && (
        <i aria-hidden="true" className={`fas ${icon} tw:text-game-replay`} />
      )}
      {label}
    </button>
  );
}

/**
 * A spectator's switch to follow the shared replay leader: to show the turn that the leader shows,
 * and to join the leader's hypothetical. A step through the turns turns it off.
 */
function FollowButton({
  leader,
  following,
}: {
  readonly leader: string;
  readonly following: boolean;
}): React.JSX.Element {
  return (
    <ToggleButton
      icon="fa-crown"
      label="Follow"
      onClick={replay.toggleSharedSegments}
      pressed={following}
      tooltip={`Show the turns that ${leader} shows. Going to another turn on your own stops this.`}
    />
  );
}

function HypotheticalBar({
  state,
  editingCards,
  onToggleEditCards,
}: {
  readonly state: State;
  readonly editingCards: boolean;
  readonly onToggleEditCards: () => void;
}): React.JSX.Element {
  const hypo = state.replay.hypothetical!;
  const { shared } = state.replay;

  // A hypothetical in a shared replay is the leader's, like the replay around it.
  let label = "Hypothetical";
  if (shared !== undefined && state.replay.ownHypothetical === undefined) {
    label = shared.amLeader
      ? "Shared hypothetical: you lead"
      : `Shared hypothetical: ${shared.leader} leads`;
  }

  if (!controlsHypothetical(state)) {
    return (
      <Bar>
        <Heading icon="fa-flask" label={label} mode="hypothetical" />
        {shared !== undefined && (
          <div className="tw:ml-auto tw:flex">
            <FollowButton
              following={shared.useSharedSegments}
              leader={shared.leader}
            />
          </div>
        )}
      </Bar>
    );
  }

  return (
    <Bar>
      <Heading icon="fa-flask" label={label} mode="hypothetical" />
      <div className={ACTIONS_CLASS}>
        <IconButton
          disabled={hypo.states.length <= 1}
          icon="fa-undo"
          label="Back a turn in the hypothetical"
          onClick={hypothetical.sendHypotheticalBack}
        />
        <button
          className={BUTTON_CLASS}
          disabled={!hypothetical.canPassTurnInHypothetical(state)}
          onClick={hypothetical.sendHypotheticalPassTurn}
          ref={tooltipRef(
            "Spend a clue to pass the turn to the next player without giving a clue.",
          )}
          type="button"
        >
          Pass
        </button>
        <ToggleButton
          disabled={!canToggleDrawnCards(state)}
          label="Show drawn cards"
          onClick={hypothetical.toggleRevealed}
          pressed={hypo.showDrawnCards}
          tooltip="Show the faces of the cards drawn during the hypothetical."
        />
        <ToggleButton
          label="Edit cards"
          onClick={onToggleEditCards}
          pressed={editingCards}
          tooltip="While this is on, click a card in a hand to change it into another card."
        />
        <button
          className={PRIMARY_BUTTON_CLASS}
          onClick={hypothetical.endHypothetical}
          type="button"
        >
          Exit hypothetical
        </button>
      </div>
    </Bar>
  );
}

/**
 * The replay controls, or nothing when the screen shows the game as it stands. In a finished game,
 * they always show.
 */
export function ReplayBar({
  state,
  editingCards,
  onToggleEditCards,
}: {
  readonly state: State;
  readonly editingCards: boolean;
  readonly onToggleEditCards: () => void;
}): React.JSX.Element | undefined {
  const { replay: replayState, finished, visibleState } = state;
  if (
    visibleState === undefined
    || (replayState.segment === undefined && !finished)
  ) {
    return undefined;
  }

  if (replayState.hypothetical !== undefined) {
    return (
      <HypotheticalBar
        editingCards={editingCards}
        onToggleEditCards={onToggleEditCards}
        state={state}
      />
    );
  }

  return <TurnsBar state={state} />;
}

/** The bar of a replay that is not a hypothetical, with the controls to move through its turns. */
export function TurnsBar({
  state,
}: {
  readonly state: State;
}): React.JSX.Element {
  const { replay: replayState, finished, visibleState } = state;
  if (visibleState === undefined) {
    throw new Error("A replay bar needs a turn on screen.");
  }
  const { shared } = replayState;
  const spoilerFree = shared?.spoilerFree === true;
  const turn = visibleState.turn.turnNum + 1;
  const segment = visibleState.turn.segment ?? 0;
  const lastSegment = replay.getLastSegment(state, true);
  // The buttons and the timeline step through segments, as the classic screen's do.
  const atStart = segment === 0;
  const atEnd = segment >= lastSegment;
  const canEnterHypothetical = hypothetical.canStartHypothetical(state);

  // While we follow someone else's lead, the turn moves without us, so the bar shows which way.
  const following =
    shared !== undefined && shared.useSharedSegments && !shared.amLeader;
  const move = useLeaderMove(following, segment, turn);

  // The buttons that step through the turns are together in the middle of the first row, so that a
  // player can click back and forth without moving the mouse far. The leader's menu, or the switch
  // to follow the leader, is on their left, and it names who leads, so the bar needs no heading.
  // The timeline has the second row to itself, so that it is wide enough to pick a turn with the
  // mouse. On a narrow window, the other buttons do not fit beside the steps, so they go below the
  // timeline.
  return (
    <Bar>
      <div className="tw:grid tw:w-full tw:grid-cols-[1fr_auto_1fr] tw:items-center tw:gap-2.5 tw:narrow-980:contents">
        <div className="tw:flex tw:justify-start tw:gap-2.5 tw:narrow-980:order-last tw:narrow-980:flex-1 tw:narrow-980:*:flex-1 tw:narrow-980:empty:hidden">
          {shared !== undefined && (
            <LeaderMenu
              amLeader={shared.amLeader}
              leader={shared.leader}
              spectators={state.spectators}
            />
          )}
          {shared !== undefined && !shared.amLeader && (
            <FollowButton
              following={shared.useSharedSegments}
              leader={shared.leader}
            />
          )}
        </div>
        <div className="tw:flex tw:items-center tw:justify-center tw:gap-2 tw:narrow-980:w-full">
          {finished && (
            <IconButton
              disabled={atStart}
              icon="fa-step-backward"
              label="First turn"
              onClick={replay.backFull}
              size="jump"
            />
          )}
          <IconButton
            disabled={atStart}
            icon="fa-chevron-left"
            label="Previous turn"
            onClick={() => {
              replay.back();
            }}
            size="step"
          />
          {/* Spoiler-free reviews hide how long the game lasts, so they have no timeline, and the
              leader's moves flash between these buttons instead of over the knob. */}
          {spoilerFree && following && (
            <span className="tw:flex tw:w-6 tw:justify-center">
              <DirectionFlash move={move} />
            </span>
          )}
          <IconButton
            disabled={atEnd}
            icon="fa-chevron-right"
            label="Next turn"
            onClick={replay.forward}
            size="step"
          />
          {finished && !spoilerFree && (
            <IconButton
              disabled={atEnd}
              icon="fa-step-forward"
              label="Last turn"
              onClick={replay.forwardFull}
              size="jump"
            />
          )}
        </div>
        <div
          className={`tw:flex tw:items-center tw:justify-end tw:gap-2 tw:narrow-980:order-last ${finished ? "" : "tw:narrow-980:flex-1"}`}
        >
          {canEnterHypothetical && (
            <IconButton
              icon="fa-flask"
              iconClassName="tw:text-game-hypothetical"
              label="Enter hypothetical"
              onClick={hypothetical.startHypothetical}
              tooltip="Enter hypothetical: try out other moves from this turn."
            />
          )}
          {!finished && (
            <button
              className={`${PRIMARY_BUTTON_CLASS} tw:narrow-980:flex-1`}
              onClick={() => {
                replay.exit();
              }}
              type="button"
            >
              Back to the game
            </button>
          )}
        </div>
      </div>
      {!spoilerFree && (
        <Timeline
          lastSegment={lastSegment}
          leaderMove={move}
          segment={segment}
          slide={following}
        />
      )}
    </Bar>
  );
}

/** A move of the shared replay leader, to a later turn or an earlier one. */
interface LeaderMove {
  readonly direction: 1 | -1;

  /** Counts the moves, so that each one shows the icon, even to the same turn as the last. */
  readonly key: number;
}

/**
 * The shared replay leader's last move, while we follow them, so that the direction icon shows its
 * way. Moving on our own, or going back to the leader's turn, is not a leader's move.
 */
function useLeaderMove(
  following: boolean,
  segment: number,
  turn: number,
): LeaderMove | undefined {
  const [previous, setPrevious] = useState({ following, segment, turn });
  const [move, setMove] = useState<LeaderMove>();
  if (
    previous.following !== following
    || previous.segment !== segment
    || previous.turn !== turn
  ) {
    setPrevious({ following, segment, turn });
    if (following && previous.following && previous.segment !== segment) {
      setMove({
        direction: segment > previous.segment ? 1 : -1,
        key: (move?.key ?? 0) + 1,
      });
    } else if (move !== undefined) {
      setMove(undefined);
    }
  }
  return move;
}

/** How long the leader's direction icon shows, from popping in to fading out, in milliseconds. */
const DIRECTION_FLASH_MILLISECONDS = 1000;

/** An overshoot, so that the icon pops in. */
const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/**
 * A forward or back icon over the timeline's knob, which pops in on each of the leader's moves and
 * fades out, as the classic screen's arrow does over the board.
 */
function DirectionFlash({
  move,
}: {
  readonly move: LeaderMove | undefined;
}): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const icon = ref.current;
    if (icon === null || move === undefined) {
      return undefined;
    }
    const pop = icon.animate(
      [
        { opacity: 0, transform: "scale(0.4)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 180, easing: EASE_OUT_BACK },
    );
    const fade = icon.animate([{ opacity: 1 }, { opacity: 0 }], {
      delay: 400,
      duration: DIRECTION_FLASH_MILLISECONDS - 400,
      easing: "ease-in",
      fill: "forwards",
    });
    return () => {
      pop.cancel();
      fade.cancel();
    };
  }, [move]);

  return (
    <i
      aria-hidden="true"
      className={`fas ${move?.direction === -1 ? "fa-backward" : "fa-forward"} tw:inline-block tw:text-[15px] tw:text-game-replay tw:opacity-0`}
      key={move?.key}
      ref={ref}
    />
  );
}
