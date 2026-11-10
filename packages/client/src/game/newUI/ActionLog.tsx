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
      className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-[18px] tw:bg-surface"
    >
      <h2 className="tw:m-0 tw:px-4.5 tw:pt-4 tw:pb-1 tw:text-[15px] tw:font-medium tw:text-text-label">
        Action log
      </h2>
      <ol
        className="tw:m-0 tw:flex tw:min-h-0 tw:flex-1 tw:list-none tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:py-1.5 tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
        ref={listRef}
      >
        {/* The first entry sits at the bottom until the log fills up. */}
        <li aria-hidden="true" className="tw:mt-auto" />
        {log.map((entry, i) => (
          <li
            className={`tw:flex tw:gap-2.5 tw:rounded-lg tw:px-2 tw:py-0.5 tw:text-[14px] tw:leading-normal ${
              i === log.length - 1 ? "tw:bg-border" : ""
            }`}
            // Log entries never change or move, so the index identifies them.
            key={i}
          >
            <span className="tw:w-8 tw:shrink-0 tw:pt-px tw:text-[13px] tw:text-text-label">
              #{entry.turn}
            </span>
            <span className="tw:min-w-0 tw:text-text-strong">{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
