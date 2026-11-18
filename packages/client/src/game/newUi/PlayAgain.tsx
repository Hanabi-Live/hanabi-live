import { useRef, useState, useSyncExternalStore } from "react";
import { store } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import * as gameSession from "../gameSession.ts";
import type { SharedReplayState } from "../types/SharedReplayState.ts";
import * as restart from "../ui/restart.ts";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { Menu, MENU_BUTTON_CLASS, MenuCaret } from "./Menu.tsx";
import { getOpacityTransition } from "./motion.ts";
import { Checkbox } from "./ReplayControls.tsx";
import {
  BOTTOM_BAR_BUTTON_CLASS,
  BOTTOM_BAR_BUTTON_COLOR_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_COLOR_CLASS,
} from "./surfaces.ts";

const BUTTON_CLASS = `${BOTTOM_BAR_BUTTON_CLASS} ${MENU_BUTTON_CLASS} ${BOTTOM_BAR_BUTTON_COLOR_CLASS}`;

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

  // From the request to play again until the server answers, the button waits instead.
  const pending = useSyncExternalStore(
    gameSession.subscribeToRestartPending,
    gameSession.isRestartPending,
  );

  const { reducedMotion } = store.getState().session.settings;
  // When the button goes back from the wait to its label, the label fades in, as the wait did.
  const [waited, setWaited] = useState(false);
  if (pending && !waited) {
    setWaited(true);
  }

  if (pending) {
    // It is not "disabled", so that its tooltip still shows.
    return (
      <button
        aria-disabled="true"
        className={`${BOTTOM_BAR_BUTTON_CLASS} tw:cursor-default tw:bg-white/8 tw:opacity-60`}
        ref={tooltipRef("Waiting for the server to answer.")}
        type="button"
      >
        {/* The new label fades in. */}
        <span
          className={`tw:flex tw:items-center tw:gap-2 ${reducedMotion ? "" : "tw:starting:opacity-0"}`}
          style={{
            transition: reducedMotion ? undefined : getOpacityTransition(true),
          }}
        >
          <i aria-hidden="true" className="fas fa-hourglass-half" />
          Waiting...
        </span>
      </button>
    );
  }

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
        <span
          className={`tw:flex tw:items-center tw:gap-2 ${waited && !reducedMotion ? "tw:starting:opacity-0" : ""}`}
          style={{
            transition:
              waited && !reducedMotion ? getOpacityTransition(true) : undefined,
          }}
        >
          <i aria-hidden="true" className="fas fa-redo" />
          Play again
        </span>
        <MenuCaret open={open} />
      </button>
      {open && (
        <Menu align="right" className="tw:w-64">
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
        </Menu>
      )}
    </div>
  );
}
