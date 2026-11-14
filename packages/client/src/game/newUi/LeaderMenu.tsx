import type { Spectator } from "@hanabi-live/data";
import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { setLeader } from "../ui/leader.ts";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { KEY_CLASS } from "./surfaces.ts";

const BUTTON_CLASS = `tw:flex tw:h-11 tw:w-full tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:bg-white/8 tw:px-4 tw:text-[15px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:hover:bg-white/15 ${KEY_CLASS}`;

/**
 * A person to set as the new leader. Like every button on the game screen, it is a key that stands
 * on the panel, so that it looks like something to press.
 */
const ITEM_CLASS = `tw:group tw:flex tw:h-10 tw:w-full tw:cursor-pointer tw:items-center tw:gap-2.5 tw:rounded-lg tw:border-0 tw:bg-white/8 tw:px-3 tw:text-left tw:text-[15px] tw:font-semibold tw:text-game-text tw:hover:bg-white/15 ${KEY_CLASS}`;

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

  const others = spectators.filter(
    (spectator) => spectator.username !== leader,
  );
  const tooltip = amLeader
    ? "You lead the shared replay. Set someone else as the new leader."
    : `${leader} leads the shared replay. Set a new leader, such as yourself.`;

  return (
    <div className="tw:relative tw:flex" ref={containerRef}>
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
        <i aria-hidden="true" className="fas fa-crown tw:text-game-replay" />
        Leader: {amLeader ? "You" : leader}
        {/* The caret points the way that the menu opens. */}
        <i
          aria-hidden="true"
          className="fas fa-caret-up tw:text-[12px] tw:narrow-980:hidden"
        />
        <i
          aria-hidden="true"
          className="fas fa-caret-down tw:hidden tw:text-[12px] tw:narrow-980:inline-block"
        />
      </button>
      {open && (
        // On a narrow window, the bar is at the top of the page, so the menu opens downward.
        <div
          className="tw:absolute tw:bottom-full tw:left-0 tw:z-30 tw:mb-2 tw:flex tw:min-w-52 tw:flex-col tw:gap-2 tw:rounded-[14px] tw:bg-game-panel tw:p-2 tw:pb-3 tw:shadow-lg tw:ring-1 tw:ring-game-line tw:narrow-980:top-full tw:narrow-980:bottom-auto tw:narrow-980:mt-2 tw:narrow-980:mb-0"
          role="menu"
        >
          <span className="tw:px-1 tw:pt-1 tw:text-[13px] tw:text-game-muted">
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
                className="fas fa-crown tw:text-[13px] tw:text-game-muted tw:group-hover:text-game-replay"
              />
              {spectator.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
