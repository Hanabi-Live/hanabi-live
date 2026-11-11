import type { CardOrder } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";
import type { ClueMarkerView } from "./Card.tsx";
import { getClueMarkerColor } from "./Card.tsx";
import { tooltipRef } from "./tooltipRef.ts";

/** The size of the disc that shows each clue in the log, in CSS pixels. */
const CLUE_DISC_SIZE = 20;

/**
 * How close to the bottom of the log, in CSS pixels, the viewer must scroll for the log to stay on
 * the newest clue.
 */
const BOTTOM_SLOP = 2;

/** How a clue relates to the card under the mouse. */
type Match = "none" | "positive" | "negative";

export interface ClueLogEntry {
  /** The segment on which the clue was given. */
  readonly segment: number;
  readonly turn: number;
  readonly giverName: string;
  readonly targetName: string;
  /** The clue as words, such as "Red" or "3". */
  readonly clueName: string;
  readonly marker: ClueMarkerView;
  /** The cards that the clue touched. */
  readonly touchedCards: readonly CardOrder[];
  /** The other cards in the hand that got the clue. */
  readonly missedCards: readonly CardOrder[];
}

function getMatch(entry: ClueLogEntry, card: CardOrder | undefined): Match {
  if (card === undefined) {
    return "none";
  }
  if (entry.touchedCards.includes(card)) {
    return "positive";
  }
  if (entry.missedCards.includes(card)) {
    return "negative";
  }
  return "none";
}

/**
 * The clues of the game so far, newest at the bottom, like the classic screen's clue log. Each one
 * is a button that shows the turn after it. The clue of the turn on screen stands out, in the same
 * color as its rail beside the hands.
 *
 * While the mouse is on a card in a hand, the log shows only the clues about that card: the ones
 * that touched it, and the ones to its hand that did not (with a cross). So all of them fit,
 * however old the card is.
 */
export function ClueLog({
  entries,
  shownSegment,
  hoveredCard,
  onShowClue,
}: {
  readonly entries: readonly ClueLogEntry[];
  /** The segment of the clue that the turn on screen shows, if any. */
  readonly shownSegment: number | undefined;
  /** The card in a hand under the mouse, if any. */
  readonly hoveredCard: CardOrder | undefined;
  readonly onShowClue: (segment: number) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // Where the viewer left the full log, to go back there when the mouse leaves a card.
  const savedScroll = useRef<{ top: number; atBottom: boolean }>({
    top: 0,
    atBottom: true,
  });

  const filtered = hoveredCard !== undefined;
  const rows = entries
    .map((entry) => ({ entry, match: getMatch(entry, hoveredCard) }))
    .filter(({ match }) => !filtered || match !== "none");

  // Keep the newest clue in view, unless the viewer scrolled back in the full log.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const saved = savedScroll.current;
    list.scrollTop = filtered || saved.atBottom ? list.scrollHeight : saved.top;
  }, [entries.length, filtered, hoveredCard]);

  return (
    <section
      aria-label="Clue log"
      className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-[18px] tw:bg-game-zone tw:narrow-980:h-[320px] tw:narrow-980:flex-none"
    >
      <h2 className="tw:m-0 tw:px-4.5 tw:pt-4 tw:pb-1 tw:text-[15px] tw:font-medium tw:text-game-muted">
        {filtered ? "Clues about this card" : "Clue log"}
      </h2>
      {rows.length === 0 ? (
        <p className="tw:m-0 tw:px-4.5 tw:py-2 tw:text-[14px] tw:text-game-muted">
          {filtered ? "No clues about this card yet." : "No clues yet."}
        </p>
      ) : (
        <ol
          className="tw:m-0 tw:flex tw:min-h-0 tw:flex-1 tw:list-none tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:py-1.5 tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
          onScroll={(event) => {
            if (!filtered) {
              const list = event.currentTarget;
              savedScroll.current = {
                top: list.scrollTop,
                atBottom:
                  list.scrollHeight - list.scrollTop - list.clientHeight
                  <= BOTTOM_SLOP,
              };
            }
          }}
          ref={listRef}
        >
          {/* The first clue sits at the bottom until the log fills up. */}
          <li aria-hidden="true" className="tw:mt-auto" />
          {rows.map(({ entry, match }) => {
            const shown = entry.segment === shownSegment;
            const color = getClueMarkerColor(entry.marker);
            const missed = match === "negative";
            return (
              <li key={entry.segment}>
                <button
                  aria-current={shown ? "step" : undefined}
                  className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border-0 tw:border-l-4 tw:border-solid tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:leading-normal tw:hover:bg-game-raised ${
                    shown ? "tw:bg-game-raised" : "tw:bg-transparent"
                  } ${missed ? "tw:text-game-muted" : "tw:text-game-text"}`}
                  onClick={() => {
                    onShowClue(entry.segment);
                  }}
                  ref={tooltipRef("Show the turn after this clue")}
                  style={{ borderLeftColor: shown ? color : "transparent" }}
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
                  <ClueDisc
                    clueName={entry.clueName}
                    marker={entry.marker}
                    missed={missed}
                  />
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
 * the clue's number. A color clue also has its name beside the disc. A clue that did not touch the
 * card under the mouse has a cross before it and a faded disc.
 */
function ClueDisc({
  marker,
  clueName,
  missed,
}: {
  readonly marker: ClueMarkerView;
  readonly clueName: string;
  readonly missed: boolean;
}): React.JSX.Element {
  const isRank = marker.type === "rank";
  return (
    <span className="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1.5">
      {!isRank && <span className="tw:text-game-muted">{clueName}</span>}
      {missed && (
        <i
          aria-label="did not touch it"
          className="fas fa-times tw:text-[13px] tw:text-game-muted"
          role="img"
        />
      )}
      <span
        aria-label={isRank ? clueName : undefined}
        className={`tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:text-[12px] tw:font-extrabold tw:text-card-ink tw:shadow-[0_0_0_1px_black] ${
          missed ? "tw:opacity-60" : ""
        }`}
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
