import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { SharedReplayState } from "../types/SharedReplayState.ts";
import * as restart from "../ui/restart.ts";
import { Checkbox } from "./ReplayBar.tsx";
import { useCloseOnOutsideClick } from "./hooks.ts";
import {
  KEY_CLASS,
  MENU_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_COLOR_CLASS,
} from "./surfaces.ts";

const BUTTON_CLASS = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:bg-game-raised tw:px-4 tw:text-[15px] tw:whitespace-nowrap tw:text-game-text tw:hover:bg-game-line tw:narrow-980:h-9 tw:narrow-980:px-3 tw:narrow-980:text-sm ${KEY_CLASS}`;

const ITEM_CLASS = `tw:flex tw:flex-col tw:items-start tw:gap-0.5 tw:disabled:opacity-40 ${MENU_ITEM_CLASS} ${MENU_ITEM_COLOR_CLASS}`;

const ITEM_DETAIL_CLASS =
  "tw:text-[12px] tw:leading-[16px] tw:font-normal tw:text-game-muted";

/**
 * The button to play the game again, in place of "End game" once the game is over. The leader
 * chooses how to play again. The other players say whether they are ready to.
 */
export function PlayAgain({
  shared,
  ourUsername,
  playerNames,
  speedrun,
}: {
  readonly shared: SharedReplayState;
  readonly ourUsername: string;
  readonly playerNames: readonly string[];
  readonly speedrun: boolean;
}): React.JSX.Element {
  if (!shared.amLeader) {
    return <ReadyToggle ourUsername={ourUsername} shared={shared} />;
  }

  return (
    <PlayAgainMenu
      playerNames={playerNames}
      shared={shared}
      speedrun={speedrun}
    />
  );
}

/** Tells the leader whether we will play again. It stays pressed while we will. */
function ReadyToggle({
  shared,
  ourUsername,
}: {
  readonly shared: SharedReplayState;
  readonly ourUsername: string;
}): React.JSX.Element {
  const ready = !shared.restartDeclined.includes(ourUsername);

  return (
    <button
      aria-pressed={ready}
      className={BUTTON_CLASS}
      onClick={() => {
        restart.decline(ready);
      }}
      ref={tooltipRef(
        "Whether you will play again if the leader restarts the game.",
      )}
      type="button"
    >
      <Checkbox checked={ready} />
      Ready
    </button>
  );
}

/** The leader's button, with the choices of how to play again. */
function PlayAgainMenu({
  shared,
  playerNames,
  speedrun,
}: {
  readonly shared: SharedReplayState;
  readonly playerNames: readonly string[];
  readonly speedrun: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(open, containerRef, setOpen);

  const declined = restart.declinedPlayers(shared);
  const canRestart = restart.canRestart(shared, playerNames);

  return (
    <div className="tw:relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={BUTTON_CLASS}
        onClick={() => {
          // In a speedrun, when everyone will play again, there is nothing to choose.
          if (speedrun && declined.length === 0) {
            restart.request(true);
          } else {
            setOpen(!open);
          }
        }}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-redo" />
        Play again
        <i aria-hidden="true" className="fas fa-caret-up tw:text-[12px]" />
      </button>
      {open && (
        <div className={`${MENU_CLASS} tw:right-0 tw:w-64`} role="menu">
          <div className="tw:flex tw:flex-col tw:gap-0.5 tw:px-1 tw:pt-1">
            <span className="tw:text-[15px] tw:font-bold tw:text-game-text">
              Play again?
            </span>
            {declined.length > 0 && (
              <span className="tw:text-[12px] tw:text-game-muted">
                Not ready: {declined.join(", ")}
              </span>
            )}
          </div>
          <button
            className={ITEM_CLASS}
            disabled={declined.length > 0}
            onClick={() => {
              setOpen(false);
              restart.request(true);
            }}
            role="menuitem"
            type="button"
          >
            <span className="tw:text-[14px] tw:font-bold">Restart game</span>
            <span className={ITEM_DETAIL_CLASS}>
              Starts right away, with the same players and options
            </span>
          </button>
          <button
            className={ITEM_CLASS}
            disabled={!canRestart}
            onClick={() => {
              setOpen(false);
              restart.request(false);
            }}
            role="menuitem"
            type="button"
          >
            <span className="tw:text-[14px] tw:font-bold">Remake table</span>
            <span className={ITEM_DETAIL_CLASS}>
              So that people can join or leave first
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
