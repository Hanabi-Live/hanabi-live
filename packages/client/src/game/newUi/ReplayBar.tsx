// The controls below the hands while the screen shows a replay: the in-game replay, a finished
// game, or a hypothetical. They call the same functions as the classic screen's replay controls.

// The bar is a dark felt panel like the other boxes on the table. The color of its heading names
// the mode: blue to look back at the game, violet to try other moves. The buttons and the timeline
// are large, because a player clicks them many times in a row.

import { clamp } from "complete-common";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import { controlsHypothetical } from "../ui/controlsHypothetical.ts";
import * as hypothetical from "../ui/hypothetical.ts";
import { showPassLeaderDialog } from "../ui/leader.ts";
import * as replay from "../ui/replay.ts";
import * as restart from "../ui/restart.ts";
import { CONTROL_PANEL_CLASS } from "./CluePanel.tsx";
import { KEY_CLASS } from "./surfaces.ts";

type Mode = "replay" | "hypothetical";

const ACCENT_TEXT_CLASS = {
  replay: "tw:text-game-replay",
  hypothetical: "tw:text-game-hypothetical",
} as const satisfies Record<Mode, string>;

/** A quiet button for the actions that are not the main one. */
const BUTTON_CLASS = `tw:flex tw:h-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:bg-white/8 tw:px-4 tw:text-[15px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8 ${KEY_CLASS}`;

/** The bar's main action: the way back out of the mode. */
const PRIMARY_BUTTON_CLASS = `tw:flex tw:h-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[10px] tw:border-0 tw:bg-game-text tw:px-4 tw:text-[15px] tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:hover:bg-white ${KEY_CLASS}`;

/** How long the knob of the timeline takes to slide to the leader's turn, in milliseconds. */
const TIMELINE_SLIDE_MILLISECONDS = 300;

/** A fast start and a soft stop, so that a slide reads as a move to a place. */
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const ICON_BUTTON_CLASS = `tw:flex tw:size-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[10px] tw:border-0 tw:bg-white/8 tw:text-[17px] tw:text-game-text tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8 ${KEY_CLASS}`;

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
      className={`tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-x-2.5 tw:gap-y-3 tw:rounded-[14px] tw:py-3 tw:pr-3 tw:pl-4 tw:ring-1 tw:ring-game-line ${CONTROL_PANEL_CLASS}`}
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
 * ring, when the pointer is over it, so that the knob does not cover the buttons beside it.
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
      className="tw:group tw:relative tw:h-11 tw:min-w-12 tw:flex-1 tw:cursor-pointer tw:touch-none"
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
  disabled = false,
  onClick,
}: {
  readonly label: string;
  readonly icon: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className={ICON_BUTTON_CLASS}
      disabled={disabled}
      onClick={onClick}
      ref={tooltipRef(label)}
      type="button"
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
    </button>
  );
}

/** A button that stays pressed while its setting is on, with a check box to show it. */
function ToggleButton({
  label,
  pressed,
  disabled = false,
  tooltip,
  onClick,
}: {
  readonly label: string;
  readonly pressed: boolean;
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
      {/* The site only bundles the solid icons, so the box is drawn instead of using an icon. */}
      <span
        aria-hidden="true"
        className={`tw:box-border tw:flex tw:size-4 tw:items-center tw:justify-center tw:rounded tw:border-2 tw:border-solid ${
          pressed
            ? "tw:border-game-text tw:bg-game-text tw:text-card-ink"
            : "tw:border-game-muted"
        }`}
      >
        {pressed && <i className="fas fa-check tw:text-[9px]" />}
      </span>
      {label}
    </button>
  );
}

/** The leader's button to play the game again, with the choices of how. */
function PlayAgain(): React.JSX.Element | undefined {
  const [open, setOpen] = useState(false);
  const { shared } = globals.state.replay;
  if (shared === undefined) {
    return undefined;
  }

  const declined = restart.declinedPlayers(shared);
  const canRestart = restart.canRestart(shared, globals.metadata.playerNames);

  return (
    <div className="tw:relative tw:flex">
      <button
        aria-expanded={open}
        className={`${PRIMARY_BUTTON_CLASS} tw:flex-1`}
        onClick={() => {
          // In a speedrun, when everyone will play again, there is nothing to choose.
          if (globals.options.speedrun && declined.length === 0) {
            restart.request(true);
          } else {
            setOpen(!open);
          }
        }}
        type="button"
      >
        Play again
      </button>
      {open && (
        <div className="tw:absolute tw:right-0 tw:bottom-full tw:z-20 tw:mb-2 tw:narrow-980:top-full tw:narrow-980:bottom-auto tw:narrow-980:mt-2 tw:narrow-980:mb-0 tw:flex tw:w-64 tw:flex-col tw:gap-2 tw:rounded-[14px] tw:bg-game-panel tw:p-3 tw:shadow-lg tw:ring-1 tw:ring-game-line">
          {declined.length > 0 && (
            <div className="tw:text-sm tw:text-game-muted">
              Not ready: {declined.join(", ")}
            </div>
          )}
          <button
            className={BUTTON_CLASS}
            disabled={declined.length > 0}
            onClick={() => {
              setOpen(false);
              restart.request(true);
            }}
            ref={tooltipRef(
              "Start a new game right away, with the same players and options.",
            )}
            type="button"
          >
            Restart game
          </button>
          <button
            className={BUTTON_CLASS}
            disabled={!canRestart}
            onClick={() => {
              setOpen(false);
              restart.request(false);
            }}
            ref={tooltipRef(
              "Make a new table with the same players and options, so that people can join or leave first.",
            )}
            type="button"
          >
            Remake table
          </button>
          <button
            className={BUTTON_CLASS}
            onClick={() => {
              setOpen(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
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
        <button
          className={`${PRIMARY_BUTTON_CLASS} tw:ml-auto`}
          onClick={replay.toggleSharedSegments}
          ref={tooltipRef(
            "Leave the leader's hypothetical, and look at the turns on your own.",
          )}
          type="button"
        >
          Pause shared turns
        </button>
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
          // A drawn card that has been played, discarded, or clued stays shown.
          disabled={globals.elements.showDrawnCardsCheckbox?.enabled === false}
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
  const canEnterHypothetical = shared === undefined || shared.amLeader;

  // While we follow someone else's lead, the turn moves without us, so the bar shows which way.
  const following =
    shared !== undefined && shared.useSharedSegments && !shared.amLeader;
  const move = useLeaderMove(following, segment, turn);

  let sharedTurnsLabel = "Use shared turns";
  if (shared?.useSharedSegments === true) {
    sharedTurnsLabel = "Pause shared turns";
  } else if (shared?.hypothetical !== undefined) {
    sharedTurnsLabel = "Join hypothetical";
  }

  let label = "Replay";
  if (shared !== undefined) {
    label = shared.amLeader
      ? "Shared replay: you lead"
      : `Shared replay: ${shared.leader} leads`;
  }

  // The heading and the buttons are on the first row. The timeline has the second row to itself, so
  // that it is wide enough to pick a turn with the mouse. On a narrow window, the buttons take rows
  // of their own, so they go below the timeline.
  return (
    <Bar>
      <div className="tw:flex tw:w-full tw:flex-wrap tw:items-center tw:gap-x-2.5 tw:gap-y-3 tw:narrow-980:contents">
        <Heading
          icon={shared === undefined ? "fa-history" : "fa-crown"}
          label={label}
          mode="replay"
        />
        <div className={`${ACTIONS_CLASS} tw:narrow-980:order-last`}>
          {shared !== undefined
            && (shared.amLeader ? (
              <button
                className={BUTTON_CLASS}
                onClick={showPassLeaderDialog}
                ref={tooltipRef(
                  "Pass the lead of the shared replay to someone else.",
                )}
                type="button"
              >
                Pass leader
              </button>
            ) : (
              <button
                className={BUTTON_CLASS}
                onClick={replay.toggleSharedSegments}
                type="button"
              >
                {sharedTurnsLabel}
              </button>
            ))}
          {canEnterHypothetical && (
            <button
              className={BUTTON_CLASS}
              onClick={hypothetical.startHypothetical}
              ref={tooltipRef("Try out other moves from this turn.")}
              type="button"
            >
              <i
                aria-hidden="true"
                className="fas fa-flask tw:text-game-hypothetical"
              />
              Enter hypothetical
            </button>
          )}
          {shared?.canPlayAgain === true
            && (shared.amLeader ? (
              <PlayAgain />
            ) : (
              <ToggleButton
                label="Ready"
                onClick={() => {
                  restart.decline(
                    !shared.restartDeclined.includes(
                      globals.metadata.ourUsername,
                    ),
                  );
                }}
                pressed={
                  !shared.restartDeclined.includes(globals.metadata.ourUsername)
                }
                tooltip="Whether you will play again if the leader restarts the game."
              />
            ))}
          {!finished && (
            <button
              className={PRIMARY_BUTTON_CLASS}
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
      <div className="tw:flex tw:w-full tw:items-center tw:gap-2.5 tw:narrow-980:gap-1.5">
        {finished && (
          <IconButton
            disabled={atStart}
            icon="fa-angle-double-left"
            label="First turn"
            onClick={replay.backFull}
          />
        )}
        <IconButton
          disabled={atStart}
          icon="fa-chevron-left"
          label="Previous turn"
          onClick={() => {
            replay.back();
          }}
        />
        {/* Spoiler-free reviews hide how long the game lasts, so the leader's moves flash in the
            middle of the row instead of over the knob. */}
        {spoilerFree ? (
          <span className="tw:flex tw:flex-1 tw:justify-center">
            {following && <DirectionFlash move={move} />}
          </span>
        ) : (
          <Timeline
            lastSegment={lastSegment}
            leaderMove={move}
            segment={segment}
            slide={following}
          />
        )}
        <IconButton
          disabled={atEnd}
          icon="fa-chevron-right"
          label="Next turn"
          onClick={replay.forward}
        />
        {finished && !spoilerFree && (
          <IconButton
            disabled={atEnd}
            icon="fa-angle-double-right"
            label="Last turn"
            onClick={replay.forwardFull}
          />
        )}
      </div>
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
