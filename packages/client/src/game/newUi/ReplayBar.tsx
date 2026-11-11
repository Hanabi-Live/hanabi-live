// The controls above the hands while the screen shows a replay: the in-game replay, a finished
// game, or a hypothetical. They call the same functions as the classic screen's replay controls.

// The bar is a slate panel like the other boxes on the table, with an accent along its left edge
// that names the mode: blue to look back at the game, violet to try other moves.

import { clamp } from "complete-common";
import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import { controlsHypothetical } from "../ui/controlsHypothetical.ts";
import * as hypothetical from "../ui/hypothetical.ts";
import { showPassLeaderDialog } from "../ui/leader.ts";
import * as replay from "../ui/replay.ts";
import * as restart from "../ui/restart.ts";

type Mode = "replay" | "hypothetical";

const ACCENT_CLASS = {
  replay: { text: "tw:text-game-replay", bg: "tw:bg-game-replay" },
  hypothetical: {
    text: "tw:text-game-hypothetical",
    bg: "tw:bg-game-hypothetical",
  },
} as const satisfies Record<Mode, { text: string; bg: string }>;

/** A quiet button for the actions that are not the main one. */
const BUTTON_CLASS =
  "tw:flex tw:h-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-lg tw:border-0 tw:bg-white/8 tw:px-3 tw:text-[14px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8";

/** The bar's main action: the way back out of the mode. */
const PRIMARY_BUTTON_CLASS =
  "tw:flex tw:h-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-game-text tw:px-3.5 tw:text-[14px] tw:font-bold tw:whitespace-nowrap tw:text-card-ink tw:hover:bg-white";

const ICON_BUTTON_CLASS =
  "tw:flex tw:size-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-white/8 tw:text-game-text tw:hover:bg-white/15 tw:disabled:cursor-default tw:disabled:opacity-40 tw:disabled:hover:bg-white/8";

/**
 * The bar's buttons, kept together on the right. On a narrow window, they take a row of their own.
 */
const ACTIONS_CLASS =
  "tw:ml-auto tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-2 tw:narrow-980:w-full tw:narrow-980:*:flex-1";

/** The panel that holds a bar, with the mode's accent along its left edge. */
function Bar({
  mode,
  children,
}: {
  readonly mode: Mode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="tw:relative tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-x-2.5 tw:gap-y-2 tw:overflow-hidden tw:rounded-[14px] tw:bg-game-panel tw:py-2 tw:pr-2.5 tw:pl-5 tw:ring-1 tw:ring-game-line"
      role="status"
    >
      <span
        aria-hidden="true"
        className={`tw:absolute tw:inset-y-0 tw:left-0 tw:w-1 ${ACCENT_CLASS[mode].bg}`}
      />
      {children}
    </div>
  );
}

/** The mode's icon and name, over the turn on screen, like the numbers along the bottom. */
function Heading({
  mode,
  icon,
  label,
  turn,
  lastTurn,
}: {
  readonly mode: Mode;
  readonly icon: string;
  readonly label: string;
  readonly turn: number;
  readonly lastTurn: number | undefined;
}): React.JSX.Element {
  return (
    <div className="tw:mr-1 tw:flex tw:shrink-0 tw:flex-col tw:leading-tight">
      <span
        className={`tw:flex tw:items-center tw:gap-1.5 tw:text-[12px] tw:font-semibold ${ACCENT_CLASS[mode].text}`}
      >
        <i aria-hidden="true" className={`fas ${icon}`} />
        {label}
      </span>
      <span className="tw:text-[17px] tw:font-bold tw:whitespace-nowrap tw:text-game-text">
        Turn {turn}
        {lastTurn !== undefined && (
          <span className="tw:font-medium tw:text-game-muted">
            {" "}
            / {lastTurn}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * A line from the first turn to the last, with a knob on the turn on screen. Clicking it or
 * dragging along it shows another turn.
 */
function Timeline({
  segment,
  lastSegment,
}: {
  readonly segment: number;
  readonly lastSegment: number;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const fraction = lastSegment === 0 ? 1 : segment / lastSegment;
  const percent = `${fraction * 100}%`;

  function showTurnAt(clientX: number) {
    const track = ref.current;
    if (track === null) {
      return;
    }

    const box = track.getBoundingClientRect();
    const at = clamp((clientX - box.left) / box.width, 0, 1);
    replay.goToSegment(Math.round(at * lastSegment), true);
  }

  return (
    <div
      aria-label="Turn"
      aria-valuemax={lastSegment + 1}
      aria-valuemin={1}
      aria-valuenow={segment + 1}
      className="tw:group tw:relative tw:h-7 tw:min-w-24 tw:flex-1 tw:cursor-pointer tw:touch-none"
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
      <span className="tw:absolute tw:inset-x-0 tw:top-1/2 tw:h-1.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-white/12" />
      <span
        className="tw:absolute tw:top-1/2 tw:left-0 tw:h-1.5 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-replay"
        style={{ width: percent }}
      />
      <span
        className="tw:absolute tw:top-1/2 tw:size-3.5 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:rounded-full tw:bg-game-text tw:shadow-[0_0_0_3px_var(--game-screen-replay)] tw:transition-transform tw:group-hover:scale-125"
        style={{ left: percent }}
      />
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
        <div className="tw:absolute tw:top-full tw:right-0 tw:z-20 tw:mt-2 tw:flex tw:w-64 tw:flex-col tw:gap-2 tw:rounded-[14px] tw:bg-game-panel tw:p-3 tw:shadow-lg tw:ring-1 tw:ring-game-line">
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
  const turn = state.visibleState!.turn.turnNum + 1;
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
      <Bar mode="hypothetical">
        <Heading
          icon="fa-flask"
          label={label}
          lastTurn={undefined}
          mode="hypothetical"
          turn={turn}
        />
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
    <Bar mode="hypothetical">
      <Heading
        icon="fa-flask"
        label={label}
        lastTurn={undefined}
        mode="hypothetical"
        turn={turn}
      />
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
  const { replay: replayState, finished, visibleState, ongoingGame } = state;
  if (visibleState === undefined || (!replayState.active && !finished)) {
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

  const { shared } = replayState;
  const spoilerFree = shared?.spoilerFree === true;
  const turn = visibleState.turn.turnNum + 1;
  const lastTurn = ongoingGame.turn.turnNum + 1;
  const segment = visibleState.turn.segment ?? 0;
  const lastSegment = ongoingGame.turn.segment ?? 0;
  // The buttons and the timeline step through segments, as the classic screen's do. The end of a
  // finished game is a segment of its own, on the same turn as the last move.
  const atStart = segment === 0;
  const atEnd = segment >= lastSegment;
  const canEnterHypothetical = shared === undefined || shared.amLeader;

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

  return (
    <Bar mode="replay">
      <Heading
        icon={shared === undefined ? "fa-history" : "fa-crown"}
        label={label}
        lastTurn={spoilerFree ? undefined : lastTurn}
        mode="replay"
        turn={turn}
      />
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
      {/* Spoiler-free reviews hide how long the game lasts. */}
      {spoilerFree ? (
        <span className="tw:flex-1" />
      ) : (
        <Timeline lastSegment={lastSegment} segment={segment} />
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
      <div className={ACTIONS_CLASS}>
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
    </Bar>
  );
}
