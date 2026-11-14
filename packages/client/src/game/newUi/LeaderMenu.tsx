import type { Spectator } from "@hanabi-live/data";
import { useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { setLeader } from "../ui/leader.ts";
import { useCloseOnOutsideClick } from "./hooks.ts";
import { KEY_CLASS } from "./surfaces.ts";

const BUTTON_CLASS = `tw:flex tw:h-11 tw:w-full tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:bg-white/8 tw:px-4 tw:text-[15px] tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:hover:bg-white/15 ${KEY_CLASS}`;

const ITEM_CLASS =
  "tw:flex tw:w-full tw:items-center tw:enabled:cursor-pointer tw:gap-2.5 tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-[14px] tw:text-game-text tw:enabled:hover:bg-white/10";

/**
 * The shared replay leader's menu, which shows that they lead and passes the lead to someone else
 * in the replay. The list follows the people in the replay while it is open.
 */
export function LeaderMenu({
  spectators,
  ourUsername,
}: {
  readonly spectators: readonly Spectator[];
  readonly ourUsername: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useCloseOnOutsideClick(open, containerRef, setOpen);

  const others = spectators.filter(
    (spectator) => spectator.username !== ourUsername,
  );

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
        ref={tooltipRef(
          open
            ? undefined
            : "You lead the shared replay. Pass the lead to someone else.",
        )}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-crown tw:text-game-replay" />
        Leader: You
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
          className="tw:absolute tw:bottom-full tw:left-0 tw:z-30 tw:mb-2 tw:flex tw:min-w-52 tw:flex-col tw:gap-0.5 tw:rounded-[14px] tw:bg-game-panel tw:p-1.5 tw:shadow-lg tw:ring-1 tw:ring-game-line tw:narrow-980:top-full tw:narrow-980:bottom-auto tw:narrow-980:mt-2 tw:narrow-980:mb-0"
          role="menu"
        >
          <span className="tw:px-3 tw:pt-1.5 tw:pb-1 tw:text-[12px] tw:text-game-muted">
            {others.length === 0 ? "No one else is here" : "Pass the lead to"}
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
              {spectator.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
