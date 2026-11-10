import type { LogEntry } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";

/** The moves of the game so far, newest at the bottom. */
export function ActionLog({
  log,
}: {
  readonly log: readonly LogEntry[];
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the newest move in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [log]);

  return (
    <section
      aria-label="Action log"
      className="tw:h-[132px] tw:shrink-0 tw:overflow-hidden tw:rounded-[14px] tw:bg-table-zone"
    >
      <ol
        className="tw:m-0 tw:flex tw:h-full tw:list-none tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:py-1.5 tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
        ref={listRef}
      >
        {/* The first entry sits at the bottom until the log fills up. */}
        <li aria-hidden="true" className="tw:mt-auto" />
        {log.map((entry, i) => (
          <li
            className={`tw:flex tw:gap-2.5 tw:rounded-lg tw:px-2 tw:py-0.5 tw:text-[14.5px] tw:leading-[1.45] ${
              i === log.length - 1 ? "tw:bg-table-raised" : ""
            }`}
            // Log entries never change or move, so the index identifies them.
            key={i}
          >
            <span className="tw:w-8 tw:shrink-0 tw:pt-px tw:text-[13px] tw:text-table-faint">
              #{entry.turn}
            </span>
            <span className="tw:min-w-0 tw:text-table-text">{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
