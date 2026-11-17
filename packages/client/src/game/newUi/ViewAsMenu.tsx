import type { PlayerIndex } from "@hanabi-live/game";
import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { Menu, MENU_BUTTON_CLASS, MenuCaret } from "./Menu.tsx";
import {
  BOTTOM_BAR_BUTTON_CLASS,
  BOTTOM_BAR_BUTTON_COLOR_CLASS,
  MENU_ICON_ITEM_CLASS,
  MENU_LABEL_CLASS,
} from "./surfaces.ts";

const VIEW_AS_TOOLTIP =
  "Watch the game from a player's seat, as that player sees it.";

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
    <div className="tw:relative tw:max-w-full tw:min-w-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          viewedName === undefined ? undefined : `Viewing as ${viewedName}`
        }
        className={`${BOTTOM_BAR_BUTTON_CLASS} ${MENU_BUTTON_CLASS} tw:max-w-full tw:min-w-0 ${
          shadowing
            ? "tw:bg-white/20 tw:ring-2 tw:ring-game-text tw:hover:bg-white/30"
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
        {/* The eye says what the name is for, so that a long name has room. A name that is still
            too long is cut short. */}
        <span className="tw:min-w-0 tw:truncate">
          {viewedName ?? "View as"}
        </span>
        <MenuCaret open={open} />
      </button>
      {open && (
        <Menu align="right" className="tw:min-w-52">
          <span className={MENU_LABEL_CLASS}>View the game as</span>
          {playerNames.map((name, i) => {
            const playerIndex = i as PlayerIndex;
            const current = playerIndex === viewedSeat;
            return (
              // The current seat cannot be pressed, so it lies flat.
              <button
                aria-checked={current}
                className={MENU_ICON_ITEM_CLASS}
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
                  className={`fas fa-check tw:w-3.5 tw:text-game-text ${current ? "" : "tw:invisible"}`}
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
                className={MENU_ICON_ITEM_CLASS}
                disabled={viewedSeat === undefined}
                onClick={() => {
                  choose(undefined);
                }}
                role="menuitemradio"
                type="button"
              >
                <i
                  aria-hidden="true"
                  className={`fas fa-check tw:w-3.5 tw:text-game-text ${viewedSeat === undefined ? "" : "tw:invisible"}`}
                />
                {shadowing ? "Stop: watch as a spectator" : "A spectator"}
              </button>
            </>
          )}
        </Menu>
      )}
    </div>
  );
}
