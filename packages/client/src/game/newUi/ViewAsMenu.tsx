import type { PlayerIndex } from "@hanabi-live/game";
import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { useCloseOnOutsideClick } from "./hooks.ts";
import {
  BOTTOM_BAR_BUTTON_CLASS,
  BOTTOM_BAR_BUTTON_COLOR_CLASS,
  MENU_CLASS,
  MENU_ITEM_CLASS,
  MENU_ITEM_COLOR_CLASS,
  MENU_LABEL_CLASS,
} from "./surfaces.ts";

const VIEW_AS_TOOLTIP =
  "Watch the game from a player's seat. You can also right-click a player's name.";

/** A seat to view the game from. The current one cannot be pressed, so it lies flat. */
const ITEM_CLASS = `tw:flex tw:items-center tw:gap-2.5 ${MENU_ITEM_CLASS} ${MENU_ITEM_COLOR_CLASS}`;

/**
 * A menu to view the game from a player's seat, for anyone who does not play in it (see
 * "viewAs.ts"). In an ongoing game, a spectator who views it from a seat "shadows" that player, and
 * the button stands out, so that they can see whose seat they watch from and how to leave it.
 */
export function ViewAsMenu({
  playerNames,
  viewedSeat,
  finished,
  onViewAs,
}: {
  readonly playerNames: readonly string[];
  /** The seat that the viewer watches from, if any. */
  readonly viewedSeat: PlayerIndex | undefined;
  /** A replay always has a seat, so only an ongoing game can be watched with none. */
  readonly finished: boolean;
  readonly onViewAs: (playerIndex: PlayerIndex | undefined) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useCloseOnOutsideClick(open, containerRef, setOpen);

  const viewedName =
    viewedSeat === undefined ? undefined : playerNames[viewedSeat];
  const shadowing = !finished && viewedName !== undefined;

  function choose(playerIndex: PlayerIndex | undefined) {
    setOpen(false);
    onViewAs(playerIndex);
  }

  return (
    <div className="tw:relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${BOTTOM_BAR_BUTTON_CLASS} ${
          shadowing
            ? "tw:bg-game-replay/20 tw:ring-2 tw:ring-game-replay tw:hover:bg-game-replay/30"
            : BOTTOM_BAR_BUTTON_COLOR_CLASS
        }`}
        onClick={() => {
          setOpen(!open);
        }}
        // The tooltip would cover the open menu, so it closes when the menu opens.
        ref={tooltipRef(open ? undefined : VIEW_AS_TOOLTIP)}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-eye" />
        {viewedName === undefined ? "View as" : `Viewing as ${viewedName}`}
        <i aria-hidden="true" className="fas fa-caret-up tw:text-[12px]" />
      </button>
      {open && (
        <div className={`${MENU_CLASS} tw:right-0 tw:min-w-52`} role="menu">
          <span className={MENU_LABEL_CLASS}>View the game as</span>
          {playerNames.map((name, i) => {
            const playerIndex = i as PlayerIndex;
            const current = playerIndex === viewedSeat;
            return (
              <button
                aria-checked={current}
                className={ITEM_CLASS}
                // The current view cannot be chosen again.
                disabled={current}
                key={name}
                onClick={() => {
                  choose(playerIndex);
                }}
                role="menuitemradio"
                type="button"
              >
                <i
                  aria-hidden="true"
                  className={`fas fa-check tw:w-3.5 tw:text-game-replay ${current ? "" : "tw:invisible"}`}
                />
                {name}
              </button>
            );
          })}
          {!finished && (
            <>
              <span className="tw:mx-1 tw:h-px tw:bg-game-line" />
              <button
                aria-checked={viewedSeat === undefined}
                className={ITEM_CLASS}
                disabled={viewedSeat === undefined}
                onClick={() => {
                  choose(undefined);
                }}
                role="menuitemradio"
                type="button"
              >
                <i
                  aria-hidden="true"
                  className={`fas fa-check tw:w-3.5 tw:text-game-replay ${viewedSeat === undefined ? "" : "tw:invisible"}`}
                />
                {shadowing ? "Stop: watch as a spectator" : "A spectator"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
