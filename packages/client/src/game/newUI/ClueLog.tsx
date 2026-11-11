import { useLayoutEffect, useRef } from "react";
import type { ClueMarkerView } from "./Card.tsx";
import { getClueMarkerColor } from "./Card.tsx";

/** The size of the disc that shows each clue in the log, in CSS pixels. */
const CLUE_DISC_SIZE = 20;

export interface ClueLogEntry {
  /** The segment on which the clue was given. */
  readonly segment: number;
  readonly turn: number;
  readonly giverName: string;
  readonly targetName: string;
  /** The clue as words, such as "Red" or "3". */
  readonly clueName: string;
  readonly marker: ClueMarkerView;
}

/**
 * The clues of the game so far, newest at the bottom, like the classic screen's clue log. Each one
 * is a button that shows the turn after it. The clue of the turn on screen stands out, in the same
 * color as its rail beside the hands.
 */
export function ClueLog({
  entries,
  shownSegment,
  onShowClue,
}: {
  readonly entries: readonly ClueLogEntry[];
  /** The segment of the clue that the turn on screen shows, if any. */
  readonly shownSegment: number | undefined;
  readonly onShowClue: (segment: number) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the newest clue in view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries.length]);

  return (
    <section
      aria-label="Clue log"
      className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-[18px] tw:bg-game-zone tw:narrow-980:h-[220px] tw:narrow-980:flex-none"
    >
      <h2 className="tw:m-0 tw:px-4.5 tw:pt-4 tw:pb-1 tw:text-[15px] tw:font-medium tw:text-game-muted">
        Clue log
      </h2>
      {entries.length === 0 ? (
        <p className="tw:m-0 tw:px-4.5 tw:py-2 tw:text-[14px] tw:text-game-muted">
          No clues yet.
        </p>
      ) : (
        <ol
          className="tw:m-0 tw:flex tw:min-h-0 tw:flex-1 tw:list-none tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:py-1.5 tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
          ref={listRef}
        >
          {/* The first clue sits at the bottom until the log fills up. */}
          <li aria-hidden="true" className="tw:mt-auto" />
          {entries.map((entry) => {
            const shown = entry.segment === shownSegment;
            const color = getClueMarkerColor(entry.marker);
            return (
              <li key={entry.segment}>
                <button
                  aria-current={shown ? "step" : undefined}
                  className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border-0 tw:border-l-4 tw:border-solid tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:leading-normal tw:text-game-text tw:hover:bg-game-raised ${
                    shown ? "tw:bg-game-raised" : "tw:bg-transparent"
                  }`}
                  onClick={() => {
                    onShowClue(entry.segment);
                  }}
                  style={{ borderLeftColor: shown ? color : "transparent" }}
                  title="Show the turn after this clue"
                  type="button"
                >
                  <span className="tw:w-8 tw:shrink-0 tw:text-[13px] tw:text-game-muted">
                    #{entry.turn}
                  </span>
                  <span className="tw:min-w-0 tw:truncate">
                    {entry.giverName}
                  </span>
                  <i
                    aria-label="told"
                    className="fas fa-arrow-right tw:shrink-0 tw:text-[11px] tw:text-game-muted"
                    role="img"
                  />
                  <span className="tw:min-w-0 tw:truncate">
                    {entry.targetName}
                  </span>
                  <ClueDisc clueName={entry.clueName} marker={entry.marker} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * The clue as a small disc, like the tokens on the cards: the clue's color, or a white disc with
 * the clue's number. A color clue also has its name beside the disc.
 */
function ClueDisc({
  marker,
  clueName,
}: {
  readonly marker: ClueMarkerView;
  readonly clueName: string;
}): React.JSX.Element {
  const isRank = marker.type === "rank";
  return (
    <span className="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1.5">
      {!isRank && <span className="tw:text-game-muted">{clueName}</span>}
      <span
        aria-label={isRank ? clueName : undefined}
        className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:text-[12px] tw:font-extrabold tw:text-card-ink tw:shadow-[0_0_0_1px_black]"
        role={isRank ? "img" : undefined}
        style={{
          width: CLUE_DISC_SIZE,
          height: CLUE_DISC_SIZE,
          background: getClueMarkerColor(marker),
        }}
      >
        {isRank ? clueName : ""}
      </span>
    </span>
  );
}
