import type { CardOrder } from "@hanabi-live/game";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { ClueMarkerView } from "./Card.tsx";
import { getClueMarkerColor } from "./Card.tsx";

/** The size of the disc that shows each clue in the log, in CSS pixels. */
const CLUE_DISC_SIZE = 20;

/**
 * How close to the bottom of the log, in CSS pixels, the viewer must scroll for the log to stay on
 * the newest clue.
 */
const BOTTOM_SLOP = 2;

/**
 * The height of a line in a row of the log, in CSS pixels. It does not change with the size of a
 * name that is made smaller to fit.
 */
const ROW_LINE_HEIGHT = 21;

/** The size of a name in the log, in CSS pixels, if it fits in its column. */
const NAME_FONT_SIZE = 14;

/** How a clue relates to the card that the mouse button is held on. */
type Match = "none" | "positive" | "negative";

/** The background of a row in the filtered log, for each match. */
const MATCH_BACKGROUND = {
  none: "",
  positive: "tw:bg-[rgb(74_222_128/16%)] tw:hover:bg-[rgb(74_222_128/26%)]",
  negative: "tw:bg-[rgb(248_113_113/16%)] tw:hover:bg-[rgb(248_113_113/26%)]",
} as const satisfies Record<Match, string>;

/** What the label of a clue in the filtered log adds, for each match. */
const MATCH_LABEL_SUFFIX = {
  none: "",
  positive: ", touched it",
  negative: ", did not touch it",
} as const satisfies Record<Match, string>;

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
 * The clues of the game so far, newest at the bottom, like the classic screen's clue log. They are
 * in columns: the turn, the giver, an arrow, the receiver, and the clue. A name that is too long
 * for its column is made smaller to fit, not cut off. Each one is a button that shows the turn
 * after it. The clue of the turn on screen stands out, in the same color as its rail beside the
 * hands.
 *
 * While the mouse button is held down on a card in a hand, the log shows only the clues about that
 * card: the ones that touched it (on green), and the ones to its hand that did not (on red). So all
 * of them fit, however old the card is. It does not filter on hover, so that the log does not
 * change as the mouse passes over the hands.
 */
export function ClueLog({
  entries,
  shownSegment,
  pressedCard,
  onShowClue,
}: {
  readonly entries: readonly ClueLogEntry[];
  /** The segment of the clue that the turn on screen shows, if any. */
  readonly shownSegment: number | undefined;
  /** The card in a hand that the mouse button is held down on, if any. */
  readonly pressedCard: CardOrder | undefined;
  readonly onShowClue: (segment: number) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // Where the viewer left the full log, to go back there when the mouse button is released.
  const savedScroll = useRef<{ top: number; atBottom: boolean }>({
    top: 0,
    atBottom: true,
  });

  // Whether older clues are scrolled out of view above, which the top edge of the list fades to
  // show.
  const [scrolledDown, setScrolledDown] = useState(false);

  const filtered = pressedCard !== undefined;
  const rows = entries
    .map((entry) => ({ entry, match: getMatch(entry, pressedCard) }))
    .filter(({ match }) => !filtered || match !== "none");

  // Keep the newest clue in view, unless the viewer scrolled back in the full log.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const saved = savedScroll.current;
    list.scrollTop = filtered || saved.atBottom ? list.scrollHeight : saved.top;
    setScrolledDown(list.scrollTop > 0);
  }, [entries.length, filtered, pressedCard]);

  return (
    // The log is a record to consult, not an object on the table, so it sits sunken into the felt.
    // The discard pile above it and the clue tokens and strikes below it stand out more.
    <section
      aria-label="Clue log"
      className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-[18px] tw:bg-[rgb(0_0_0/18%)] tw:shadow-[inset_0_1px_4px_rgb(0_0_0/35%)] tw:narrow-980:h-[320px] tw:narrow-980:flex-none"
    >
      {/* The whole log needs no heading: its rows are clearly clues. A heading shows only when the
          log is narrowed to one card, so that the missing rows do not look lost. */}
      {filtered ? (
        <h2 className="tw:m-0 tw:px-4.5 tw:pt-4 tw:pb-1 tw:text-[15px] tw:font-medium tw:text-game-muted">
          Clues about this card
        </h2>
      ) : (
        <div className="tw:pt-3" />
      )}
      {rows.length === 0 ? (
        <p className="tw:m-0 tw:px-4.5 tw:py-2 tw:text-[14px] tw:text-game-muted">
          {filtered ? "No clues about this card yet." : "No clues yet."}
        </p>
      ) : (
        <ol
          // A thin scrollbar in the screen's colors has no arrow buttons, and the list stops short
          // of the panel's rounded corner, so that the corner does not cut the scrollbar off.
          className={`tw:m-0 tw:mr-1 tw:mb-2.5 tw:grid tw:min-h-0 tw:flex-1 tw:list-none tw:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] tw:content-start tw:gap-y-px tw:overflow-y-auto tw:px-2 tw:py-1.5 tw:[scrollbar-color:var(--game-screen-line)_transparent] tw:[scrollbar-width:thin] ${
            scrolledDown
              ? "tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
              : ""
          }`}
          onScroll={(event) => {
            setScrolledDown(event.currentTarget.scrollTop > 0);
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
          {rows.map(({ entry, match }) => {
            const shown = entry.segment === shownSegment;
            const color = getClueMarkerColor(entry.marker);
            const background =
              match === "none"
                ? `tw:hover:bg-game-raised ${shown ? "tw:bg-game-raised" : "tw:bg-transparent"}`
                : MATCH_BACKGROUND[match];
            return (
              <li
                className="tw:col-span-full tw:grid tw:grid-cols-subgrid"
                key={entry.segment}
              >
                <button
                  aria-current={shown ? "step" : undefined}
                  className={`tw:col-span-full tw:grid tw:cursor-pointer tw:grid-cols-subgrid tw:items-center tw:gap-x-2 tw:rounded-lg tw:border-0 tw:border-l-4 tw:border-solid tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:text-game-text ${background}`}
                  onClick={() => {
                    onShowClue(entry.segment);
                  }}
                  ref={tooltipRef("Click to go to the turn of this clue.")}
                  style={{
                    borderLeftColor: shown ? color : "transparent",
                    lineHeight: `${ROW_LINE_HEIGHT}px`,
                  }}
                  type="button"
                >
                  <span className="tw:text-[13px] tw:text-game-muted">
                    #{entry.turn}
                  </span>
                  <FitName name={entry.giverName} />
                  <i
                    aria-label="told"
                    className="fas fa-arrow-right tw:text-[11px] tw:text-game-muted"
                    role="img"
                  />
                  <FitName name={entry.targetName} />
                  <ClueDisc
                    clueName={entry.clueName}
                    marker={entry.marker}
                    match={match}
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
 * A name on one line that fills its column. If it is too long for the column, its text is made
 * smaller until it fits, instead of being cut off.
 */
function FitName({ name }: { readonly name: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const span = ref.current;
    if (span === null) {
      return undefined;
    }

    // The width of the span comes from its column, not from its text, and its line height is fixed.
    // So a new font size does not resize the span and make it fit again.
    let fittedWidth: number | undefined;
    function fit() {
      if (span === null || span.clientWidth === fittedWidth) {
        return;
      }
      fittedWidth = span.clientWidth;
      span.style.fontSize = `${NAME_FONT_SIZE}px`;
      if (span.scrollWidth > span.clientWidth) {
        const fitted = (NAME_FONT_SIZE * span.clientWidth) / span.scrollWidth;
        span.style.fontSize = `${Math.floor(fitted * 10) / 10}px`;
      }
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(span);
    return () => {
      observer.disconnect();
    };
  }, [name]);

  return (
    <span
      className="tw:overflow-hidden tw:whitespace-nowrap"
      ref={ref}
      style={{ fontSize: NAME_FONT_SIZE }}
    >
      {name}
    </span>
  );
}

/**
 * The clue as a small disc, like the tokens on the cards: the clue's color, or a white disc with
 * the clue's number. Its label also says whether the clue touched the card under the mouse.
 */
function ClueDisc({
  marker,
  clueName,
  match,
}: {
  readonly marker: ClueMarkerView;
  readonly clueName: string;
  readonly match: Match;
}): React.JSX.Element {
  const label = `${clueName}${MATCH_LABEL_SUFFIX[match]}`;
  return (
    <span
      aria-label={label}
      className="tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:text-[12px] tw:font-extrabold tw:text-card-ink tw:shadow-[0_0_0_1px_black]"
      role="img"
      style={{
        width: CLUE_DISC_SIZE,
        height: CLUE_DISC_SIZE,
        background: getClueMarkerColor(marker),
      }}
    >
      {/* The number's box is trimmed to the height of the digits, so that the digits are centered
          and not the font's space above and below them. */}
      {marker.type === "rank" && (
        <span className="tw:block tw:[text-box:trim-both_cap_alphabetic]">
          {clueName}
        </span>
      )}
    </span>
  );
}
