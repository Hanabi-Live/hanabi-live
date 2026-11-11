// The controls above the hands while the screen shows a replay: the in-game replay, a finished
// game, or a hypothetical. They call the same functions as the classic screen's replay controls.

import { useState } from "react";
import type { State } from "../types/State";
import { globals } from "../ui/UIGlobals";
import { controlsHypothetical } from "../ui/controlsHypothetical";
import * as hypothetical from "../ui/hypothetical";
import { showPassLeaderDialog } from "../ui/leader";
import * as replay from "../ui/replay";
import * as restart from "../ui/restart";

const barClass =
  "tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-[14px] tw:px-4 tw:py-2 tw:font-bold tw:text-card-ink";

const buttonClass =
  "tw:h-9 tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-card-ink tw:px-3 tw:font-bold tw:text-game-text tw:disabled:cursor-default tw:disabled:opacity-50";

const iconButtonClass =
  "tw:size-9 tw:cursor-pointer tw:rounded-lg tw:border-0 tw:bg-card-ink tw:text-game-text tw:disabled:cursor-default tw:disabled:opacity-50";

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
      className={iconButtonClass}
      disabled={disabled}
      onClick={onClick}
      title={label}
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
  title,
  onClick,
}: {
  readonly label: string;
  readonly pressed: boolean;
  readonly disabled?: boolean;
  readonly title: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      aria-pressed={pressed}
      className={`${buttonClass} tw:flex tw:items-center tw:gap-2`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {/* The site only bundles the solid icons, so the box is drawn instead of using an icon. */}
      <span
        aria-hidden="true"
        className="tw:box-border tw:flex tw:size-4 tw:items-center tw:justify-center tw:rounded tw:border-2 tw:border-game-text"
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
    <div className="tw:relative">
      <button
        aria-expanded={open}
        className={buttonClass}
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
        <div className="tw:absolute tw:top-full tw:right-0 tw:z-20 tw:mt-2 tw:flex tw:w-64 tw:flex-col tw:gap-2 tw:rounded-[14px] tw:bg-game-text tw:p-3 tw:font-normal tw:shadow-lg">
          {declined.length > 0 && (
            <div className="tw:text-sm">Not ready: {declined.join(", ")}</div>
          )}
          <button
            className={buttonClass}
            disabled={declined.length > 0}
            onClick={() => {
              setOpen(false);
              restart.request(true);
            }}
            title="Start a new game right away, with the same players and options."
            type="button"
          >
            Restart game
          </button>
          <button
            className={buttonClass}
            disabled={!canRestart}
            onClick={() => {
              setOpen(false);
              restart.request(false);
            }}
            title="Make a new table with the same players and options, so that people can join or leave first."
            type="button"
          >
            Remake table
          </button>
          <button
            className={buttonClass}
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

  if (!controlsHypothetical(state)) {
    const leader = state.replay.shared?.leader ?? "The leader";
    return (
      <div className={`${barClass} tw:bg-game-text`} role="status">
        <span className="tw:mr-auto">
          {leader}&apos;s hypothetical: turn {turn}
        </span>
        <button
          className={buttonClass}
          onClick={replay.toggleSharedSegments}
          title="Leave the leader's hypothetical, and look at the turns on your own."
          type="button"
        >
          Pause shared turns
        </button>
      </div>
    );
  }

  return (
    <div className={`${barClass} tw:bg-game-text`} role="status">
      <span className="tw:mr-auto">Hypothetical: turn {turn}</span>
      <IconButton
        disabled={hypo.states.length <= 1}
        icon="fa-chevron-left"
        label="Back a turn in the hypothetical"
        onClick={hypothetical.sendHypotheticalBack}
      />
      <button
        className={buttonClass}
        disabled={!hypothetical.canPassTurnInHypothetical(state)}
        onClick={hypothetical.sendHypotheticalPassTurn}
        title="Spend a clue to pass the turn to the next player without giving a clue."
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
        title="Show the faces of the cards drawn during the hypothetical."
      />
      <ToggleButton
        label="Edit cards"
        onClick={onToggleEditCards}
        pressed={editingCards}
        title="While this is on, click a card in a hand to change it into another card."
      />
      <button
        className={buttonClass}
        onClick={hypothetical.endHypothetical}
        type="button"
      >
        Exit hypothetical
      </button>
    </div>
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
  const atStart = visibleState.turn.turnNum === 0;
  const atEnd = turn >= lastTurn;
  const canEnterHypothetical = shared === undefined || shared.amLeader;
  const turnText = spoilerFree ? `Turn ${turn}` : `Turn ${turn} of ${lastTurn}`;

  let sharedTurnsLabel = "Use shared turns";
  if (shared?.useSharedSegments === true) {
    sharedTurnsLabel = "Pause shared turns";
  } else if (shared?.hypothetical !== undefined) {
    sharedTurnsLabel = "Join hypothetical";
  }

  return (
    <div className={`${barClass} tw:bg-clue`} role="status">
      <span className="tw:mr-auto">
        {finished ? turnText : `Replay: ${turnText.toLowerCase()}`}
      </span>
      {shared !== undefined
        && (shared.amLeader ? (
          <button
            className={buttonClass}
            onClick={showPassLeaderDialog}
            title="You lead the shared replay. Click to pass the lead to someone else."
            type="button"
          >
            <i aria-hidden="true" className="fas fa-crown tw:mr-1.5" />
            Pass leader
          </button>
        ) : (
          <>
            <span className="tw:font-medium">
              <i aria-hidden="true" className="fas fa-crown tw:mr-1.5" />
              {shared.leader}
            </span>
            <button
              className={buttonClass}
              onClick={replay.toggleSharedSegments}
              type="button"
            >
              {sharedTurnsLabel}
            </button>
          </>
        ))}
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
      {canEnterHypothetical && (
        <button
          className={buttonClass}
          onClick={hypothetical.startHypothetical}
          title="Try out other moves from this turn."
          type="button"
        >
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
                !shared.restartDeclined.includes(globals.metadata.ourUsername),
              );
            }}
            pressed={
              !shared.restartDeclined.includes(globals.metadata.ourUsername)
            }
            title="Whether you will play again if the leader restarts the game."
          />
        ))}
      {!finished && (
        <button
          className={buttonClass}
          onClick={() => {
            replay.exit();
          }}
          type="button"
        >
          Back to the game
        </button>
      )}
    </div>
  );
}
