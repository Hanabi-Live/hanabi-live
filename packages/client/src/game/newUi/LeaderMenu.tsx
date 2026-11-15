import type { Spectator } from "@hanabi-live/data";
import { useLayoutEffect, useRef, useState } from "react";
import { store } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { setLeader } from "../ui/leader.ts";
import { FitText } from "./FitText.tsx";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { Menu, MENU_BUTTON_CLASS, MenuCaret } from "./Menu.tsx";
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_COLOR_CLASS,
  MENU_LABEL_CLASS,
  REPLAY_BAR_BUTTON_CLASS,
} from "./surfaces.ts";

const BUTTON_CLASS = `${REPLAY_BAR_BUTTON_CLASS} ${MENU_BUTTON_CLASS} tw:w-full tw:min-w-0`;

/** How long the crown pulses when the leader changes, in milliseconds. */
const CROWN_PULSE_MILLISECONDS = 1000;

/** A person to set as the new leader. */
const ITEM_CLASS = `tw:group tw:flex tw:items-center tw:gap-2.5 ${MENU_ITEM_CLASS} ${MENU_ITEM_COLOR_CLASS}`;

/**
 * The shared replay's leader menu, which shows who leads and sets a new leader. Everyone in the
 * replay has it, so a follower can also make themselves the leader. The list follows the people in
 * the replay while it is open.
 */
export function LeaderMenu({
  spectators,
  leader,
  amLeader,
}: {
  readonly spectators: readonly Spectator[];
  /** The username of the leader. */
  readonly leader: string;
  readonly amLeader: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useCloseOnOutsideClick(open, containerRef, setOpen);

  // The crown pulses when the leader changes, so that everyone sees it. It does not pulse when the
  // menu first shows, such as when the game ends. It only decorates.
  const crownRef = useRef<HTMLElement>(null);
  const previousLeaderRef = useRef(leader);
  useLayoutEffect(() => {
    const previousLeader = previousLeaderRef.current;
    previousLeaderRef.current = leader;
    const crown = crownRef.current;
    if (
      crown === null
      || previousLeader === leader
      || store.getState().session.settings.reducedMotion
    ) {
      return undefined;
    }

    const animation = crown.animate(
      [
        { transform: "scale(1)" },
        {
          transform: "scale(1.6)",
          filter: "drop-shadow(0 0 6px var(--game-screen-mode))",
          offset: 0.35,
        },
        { transform: "scale(1)" },
      ],
      {
        duration: CROWN_PULSE_MILLISECONDS,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [leader]);

  const others = spectators.filter(
    (spectator) => spectator.username !== leader,
  );
  const tooltip = amLeader
    ? "You lead the shared replay. Set someone else as the new leader."
    : `${leader} leads the shared replay. Set a new leader, such as yourself.`;

  return (
    <div className="tw:relative tw:flex tw:min-w-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={BUTTON_CLASS}
        onClick={() => {
          setOpen(!open);
        }}
        // The tooltip would cover the open menu, so it closes when the menu opens.
        ref={tooltipRef(open ? undefined : tooltip)}
        type="button"
      >
        <i
          aria-hidden="true"
          className="fas fa-crown tw:inline-block tw:text-game-mode"
          ref={crownRef}
        />
        {/* A long name makes the text smaller, so that the button does not push the steps in the
            middle of the bar to the side. */}
        <FitText text={`Leader: ${amLeader ? "You" : leader}`} />
        {/* The caret points the way that the menu opens. */}
        <MenuCaret open={open} />
      </button>
      {open && (
        <Menu align="left" className="tw:min-w-52">
          <span className={MENU_LABEL_CLASS}>
            {others.length === 0 ? "No one else is here" : "Set new leader to"}
          </span>
          {others.map((spectator) => (
            <button
              className={ITEM_CLASS}
              key={spectator.userId}
              onClick={() => {
                setOpen(false);
                setLeader(spectator.userId);
              }}
              role="menuitem"
              type="button"
            >
              {/* The crown lights up on the person that it would make the leader. */}
              <i
                aria-hidden="true"
                className="fas fa-crown tw:text-[13px] tw:text-game-muted tw:group-hover:text-game-mode"
              />
              {spectator.username}
            </button>
          ))}
        </Menu>
      )}
    </div>
  );
}
