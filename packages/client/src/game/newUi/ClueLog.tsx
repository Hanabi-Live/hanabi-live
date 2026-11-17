import type { CardOrder } from "@hanabi-live/game";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { ClueMarkerView } from "./Card.tsx";
import {
  CLUE_EMOJI_FONT_PER_SIZE,
  ColorSymbolView,
  getClueMarkerColor,
  getClueMarkerLabel,
} from "./Card.tsx";
import { WELL_CLASS } from "./surfaces.ts";

/** The size of the disc that shows each clue in the log, in CSS pixels. */
const CLUE_DISC_SIZE = 16;

/** The size of the number on a clue disc, as a fraction of the disc's size. */
const DISC_FONT_SIZE_PER_SIZE = 10 / CLUE_DISC_SIZE;

/** The size of a color's symbol on a clue disc, as a fraction of the disc's size. */
const DISC_SYMBOL_PER_SIZE = 0.8;

/**
 * How close to the bottom of the log, in CSS pixels, the viewer must scroll for the log to stay on
 * the newest clue.
 */
const BOTTOM_SLOP = 2;

/**
 * The height of a line in a row of the log, in CSS pixels: the disc and its outline. It does not
 * change with the size of a name that is made smaller to fit.
 */
const ROW_LINE_HEIGHT = CLUE_DISC_SIZE + 1;

/** The size of a name in the log, in CSS pixels, if it fits in its column. */
const NAME_FONT_SIZE = 14;

/** How a clue relates to the card that the mouse is over. */
type Match = "none" | "positive" | "negative";

/** The background of a row about a hovered card, for each match. */
const MATCH_BACKGROUND = {
  none: "",
  positive: "tw:bg-[rgb(74_222_128/40%)] tw:hover:bg-[rgb(74_222_128/52%)]",
  negative: "tw:bg-[rgb(248_113_113/40%)] tw:hover:bg-[rgb(248_113_113/52%)]",
} as const satisfies Record<Match, string>;

/** What the label of a clue about a hovered card adds, for each match. */
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
 * The clue as words next to its disc, such as "Red" or "Number 2". A bare number gets the word
 * "Number", so that it does not read as a count.
 */
export function getClueText(entry: ClueLogEntry): string {
  const { clueName, marker } = entry;
  return marker.type === "rank" && clueName === marker.label
    ? `Number ${clueName}`
    : clueName;
}

/**
 * The clues of the game so far, newest at the bottom, like the classic screen's clue log. They are
 * in columns: the turn, the giver, an arrow, the receiver, and the clue (a disc and its name). A
 * name that is too long for its column is made smaller to fit, not cut off. Each one is a button
 * that shows the turn after it. The clue of the turn on screen stands out.
 *
 * While the mouse is over a card in a hand, the clues about that card stand out, as on the classic
 * screen: the ones that touched it (on green), and the ones to its hand that did not (on red). The
 * other clues stay, so that the log does not jump as the mouse passes over the hands. A clue that
 * did not touch the card is also struck through, since it says what the card is not, so that the
 * match does not depend on color alone.
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
  /** The card in a hand that the mouse is over, if any. */
  readonly hoveredCard: CardOrder | undefined;
  readonly onShowClue: (segment: number) => void;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);

  // Whether the viewer is at the newest clue, so that the log stays there when a clue comes in.
  const atBottom = useRef(true);

  // Whether older clues are scrolled out of view above, which the top edge of the list fades to
  // show.
  const [scrolledDown, setScrolledDown] = useState(false);

  // Keep the newest clue in view, unless the viewer scrolled back.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    if (atBottom.current) {
      list.scrollTop = list.scrollHeight;
    }
    setScrolledDown(list.scrollTop > 0);
  }, [entries.length]);

  return (
    // The log is a record to consult, so it sits sunken into the felt, like the other readouts. On
    // a narrow window, the screen scrolls instead of the log, so the log is as tall as its clues.
    <section
      aria-label="Clue log"
      className={`tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-game-panel tw:phone:flex-none ${WELL_CLASS}`}
      ref={tooltipRef("Clue log")}
    >
      {/* The log needs no heading: its rows are clearly clues. */}
      <div className="tw:pt-3" />
      {entries.length === 0 ? (
        <p className="tw:m-0 tw:px-4.5 tw:py-2 tw:text-[14px] tw:text-game-muted">
          No clues yet.
        </p>
      ) : (
        <ol
          // A thin scrollbar in the screen's colors has no arrow buttons, and the list stops short
          // of the panel's rounded corner, so that the corner does not cut the scrollbar off.
          className={`tw:m-0 tw:mr-1 tw:mb-2.5 tw:grid tw:min-h-0 tw:flex-1 tw:list-none tw:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] tw:content-start tw:gap-y-px tw:overflow-y-auto tw:px-2 tw:phone:overflow-y-visible tw:py-1.5 tw:[scrollbar-color:var(--game-screen-line)_transparent] tw:[scrollbar-width:thin] ${
            scrolledDown
              ? "tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]"
              : ""
          }`}
          onScroll={(event) => {
            const list = event.currentTarget;
            setScrolledDown(list.scrollTop > 0);
            atBottom.current =
              list.scrollHeight - list.scrollTop - list.clientHeight
              <= BOTTOM_SLOP;
          }}
          ref={listRef}
        >
          {entries.map((entry) => {
            const match = getMatch(entry, hoveredCard);
            const shown = entry.segment === shownSegment;
            const background =
              match === "none"
                ? `tw:hover:bg-white/18 ${shown ? "tw:bg-game-raised" : "tw:bg-transparent"}`
                : MATCH_BACKGROUND[match];
            return (
              <li
                className="tw:col-span-full tw:grid tw:grid-cols-subgrid"
                key={entry.segment}
              >
                <button
                  aria-current={shown ? "step" : undefined}
                  className={`tw:col-span-full tw:grid tw:cursor-pointer tw:grid-cols-subgrid tw:items-center tw:gap-x-2 tw:rounded-game-control tw:border-0 tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:text-game-text ${background}`}
                  onClick={() => {
                    onShowClue(entry.segment);
                  }}
                  ref={tooltipRef(
                    `This clue was given on turn ${entry.turn}. Click to go to it.`,
                  )}
                  style={{ lineHeight: `${ROW_LINE_HEIGHT}px` }}
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
                  <span className="tw:flex tw:items-center tw:gap-1.5">
                    <ClueDisc
                      clueName={entry.clueName}
                      marker={entry.marker}
                      match={match}
                    />
                    {/* The disc's label already says this to screen readers. */}
                    <span
                      aria-hidden
                      className={`tw:whitespace-nowrap ${match === "negative" ? "tw:line-through tw:decoration-2" : ""}`}
                      data-missed={match === "negative" ? true : undefined}
                    >
                      {getClueText(entry)}
                    </span>
                  </span>
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
      if (span.scrollWidth <= span.clientWidth) {
        return;
      }

      const fitted = (NAME_FONT_SIZE * span.clientWidth) / span.scrollWidth;
      span.style.fontSize = `${Math.floor(fitted * 10) / 10}px`;
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
 * the token's label. In colorblind mode, a color is a white disc with the color's symbol in that
 * color, which is easier to read than a white symbol on the color. Its label also says whether the
 * clue touched the card under the mouse.
 */
export function ClueDisc({
  marker,
  clueName,
  match = "none",
  size = CLUE_DISC_SIZE,
}: {
  readonly marker: ClueMarkerView;
  readonly clueName: string;
  readonly match?: Match;
  /** The width and height in CSS pixels. */
  readonly size?: number;
}): React.JSX.Element {
  const label = `${clueName}${MATCH_LABEL_SUFFIX[match]}`;
  const colorSymbol = marker.type === "color" ? marker.symbol : undefined;
  return (
    <span
      aria-label={label}
      className="tw:box-border tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:font-extrabold tw:text-card-ink tw:shadow-[0_0_0_1px_black]"
      role="img"
      style={{
        width: size,
        height: size,
        fontSize: size * DISC_FONT_SIZE_PER_SIZE,
        background:
          colorSymbol === undefined ? getClueMarkerColor(marker) : "white",
      }}
    >
      {/* The number's box is trimmed to the height of the digits, so that the digits are centered
          and not the font's space above and below them. An emoji fills its whole box, so it is
          not trimmed. */}
      {marker.type === "rank" && (
        <span className="tw:block tw:[text-box:trim-both_cap_alphabetic]">
          {getClueMarkerLabel(marker)}
        </span>
      )}
      {marker.type === "color" && colorSymbol !== undefined && (
        <ColorSymbolView
          fill={marker.fill}
          size={size * DISC_SYMBOL_PER_SIZE}
          symbol={colorSymbol}
        />
      )}
      {marker.type === "sound" && (
        <span
          className="tw:block tw:leading-none"
          style={{ fontSize: size * CLUE_EMOJI_FONT_PER_SIZE }}
        >
          {marker.emoji}
        </span>
      )}
    </span>
  );
}
