import type { LogEntry } from "@hanabi-live/game";
import { useEffect, useRef } from "react";

/**
 * The lines of the action log that a player's actions wrote. Each line starts with the name of the
 * player who acted. When one name starts with another (such as "Al" and "Alice"), the line belongs
 * to the longer name that it starts with.
 */
export function getPlayerLog(
  log: readonly LogEntry[],
  playerNames: readonly string[],
  playerIndex: number,
): readonly LogEntry[] {
  return log.filter((entry) => {
    let longest: number | undefined;
    for (const [i, name] of playerNames.entries()) {
      if (
        entry.text.startsWith(name)
        && (longest === undefined || name.length > playerNames[longest]!.length)
      ) {
        longest = i;
      }
    }
    return longest === playerIndex;
  });
}

/**
 * A list of every action that one player took up to the turn that shows, as on the classic screen.
 * Clicking a player's name opens it. Clicking outside of it or pressing Escape closes it.
 */
export function PlayerLog({
  name,
  entries,
  onClose,
}: {
  readonly name: string;
  readonly entries: readonly LogEntry[];
  readonly onClose: () => void;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // The newest action is the one that a player most often wants, so the list starts at its end.
  useEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries]);

  return (
    <div
      className="tw:absolute tw:inset-0 tw:z-40 tw:flex tw:items-center tw:justify-center tw:bg-[rgb(0_0_0/50%)] tw:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={`${name}'s actions`}
        aria-modal="true"
        className="tw:flex tw:max-h-full tw:w-[560px] tw:max-w-full tw:flex-col tw:rounded-game-panel tw:bg-game-panel tw:shadow-2xl tw:ring-1 tw:ring-game-line tw:outline-none"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-game-line tw:py-2 tw:pr-2 tw:pl-4">
          <h2 className="tw:m-0 tw:min-w-0 tw:flex-1 tw:truncate tw:text-[17px] tw:font-bold tw:text-game-text">
            {name}&apos;s actions
          </h2>
          <button
            aria-label="Close"
            className="tw:flex tw:size-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-times" />
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="tw:m-0 tw:px-4 tw:py-5 tw:text-game-muted">
            {name} has not taken any actions yet.
          </p>
        ) : (
          <ol
            className="tw:m-0 tw:grid tw:min-h-0 tw:list-none tw:grid-cols-[auto_1fr] tw:gap-x-3 tw:gap-y-1.5 tw:overflow-y-auto tw:px-4 tw:py-3 tw:text-[15px]"
            ref={listRef}
          >
            {entries.map((entry, i) => (
              <li
                className="tw:col-span-2 tw:grid tw:grid-cols-subgrid"
                key={i}
              >
                <span className="tw:text-right tw:text-game-muted tw:tabular-nums">
                  {entry.turn}
                </span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
