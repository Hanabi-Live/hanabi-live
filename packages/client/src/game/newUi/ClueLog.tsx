import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import type { ClueMarkerView } from "./Card.tsx";
import {
  CLUE_EMOJI_FONT_PER_SIZE,
  COLOR_SYMBOL_PER_SIZE,
  ColorSymbolView,
  getClueMarkerColor,
  getClueMarkerLabel,
} from "./Card.tsx";
import { getOpacityTransition } from "./motion.ts";
import { WELL_CLASS } from "./surfaces.ts";
import { getTabPanelStyle, Tabs, TABS_HEIGHT } from "./Tabs.tsx";

/** The size of the disc that shows each clue in the log, in CSS pixels. */
const CLUE_DISC_SIZE = 16;

/**
 * The font size of a number or a color's letter on a clue disc, as a fraction of the disc's size.
 * The characters fill most of the inside of the disc, so that they are easy to read.
 */
const DISC_FONT_SIZE_PER_SIZE = 0.8;

/** The size of a color's pip on a clue disc, as a fraction of the disc's size. */
const DISC_PIP_PER_SIZE = 0.8;

/**
 * How close to the bottom of the log, in CSS pixels, the viewer must scroll for the log to stay on
 * the newest clue.
 */
const BOTTOM_SLOP = 2;

/** The height of a line in a row of the log, in CSS pixels: the disc and its outline. */
const ROW_LINE_HEIGHT = CLUE_DISC_SIZE + 1;

/** The height of a row of the log, in CSS pixels: its line, its `tw:py-1`, and the gap below it. */
const ROW_HEIGHT = ROW_LINE_HEIGHT + 8 + 1;

/**
 * The height of the log around its rows, in CSS pixels: the tabs and the `tw:pt-2` above them, and
 * the list's `tw:py-1.5` and `tw:mb-2.5`.
 */
const LOG_PADDING = 8 + TABS_HEIGHT + 12 + 10;

/** The height of a log that shows this many rows, in CSS pixels. */
export function getClueLogHeight(rows: number): number {
  return LOG_PADDING + rows * ROW_HEIGHT;
}

/** How a clue relates to the card that the mouse is over. */
type Match = "none" | "positive" | "negative";

/**
 * The color of a row about a hovered card, for each match. It is a layer under the row's text, so
 * that it can fade in and out as the mouse moves over the hands. Only its opacity animates, never a
 * background color (see `useModeFade` in "StatusStrip.tsx").
 */
const MATCH_BACKGROUND = {
  positive:
    "tw:bg-[rgb(74_222_128/40%)] tw:group-hover/row:bg-[rgb(74_222_128/52%)]",
  negative:
    "tw:bg-[rgb(248_113_113/40%)] tw:group-hover/row:bg-[rgb(248_113_113/52%)]",
} as const satisfies Record<Exclude<Match, "none">, string>;

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

/** A line of the action log. */
export interface ActionLogEntry {
  /** The segment that shows the game just after the action. */
  readonly segment: number;
  /** The turn of the action, or nothing for a line about the start of the game. */
  readonly turn: number | undefined;
  readonly text: string;
}

/** The IDs of the two logs, which are tabs of one box. */
export const CLUE_LOG_TAB = "clue-log-tab";
const ACTION_LOG_TAB = "action-log-tab";

export type LogTab = typeof CLUE_LOG_TAB | typeof ACTION_LOG_TAB;

/** The class of a list of the log. */
const LIST_CLASS =
  // A thin scrollbar in the screen's colors has no arrow buttons, and the list stops short of the
  // panel's rounded corner, so that the corner does not cut the scrollbar off.
  "tw:m-0 tw:mr-1 tw:mb-2.5 tw:grid tw:min-h-0 tw:flex-1 tw:list-none tw:content-start tw:gap-y-px tw:overflow-y-auto tw:px-2 tw:group-data-screen-scrolls/logs:overflow-y-visible tw:py-1.5 tw:[scrollbar-color:var(--game-screen-line)_transparent] tw:[scrollbar-width:thin]";

/** The class of a list of the log when older rows are scrolled out of view above it. */
const SCROLLED_DOWN_CLASS =
  "tw:[mask-image:linear-gradient(to_bottom,transparent_0,#000_28px)]";

/** The class of the text that says that a log has no rows yet. */
const EMPTY_CLASS =
  "tw:m-0 tw:px-4.5 tw:py-2 tw:text-[14px] tw:text-game-muted";

/**
 * Keeps the newest row of a list of the log in view, unless the viewer scrolled back. It returns
 * whether older rows are scrolled out of view above, which the top edge of the list fades to show,
 * and the list's scroll handler.
 */
function useNewestInView(
  list: RefObject<HTMLOListElement | null>,
  length: number,
): readonly [boolean, (event: React.UIEvent<HTMLOListElement>) => void] {
  // Whether the viewer is at the newest row, so that the log stays there when a row comes in.
  const atBottom = useRef(true);
  const [scrolledDown, setScrolledDown] = useState(false);

  useLayoutEffect(() => {
    const element = list.current;
    if (element === null) {
      return undefined;
    }
    function keepNewest() {
      if (element !== null && atBottom.current) {
        element.scrollTop = element.scrollHeight;
      }
    }
    keepNewest();
    setScrolledDown(element.scrollTop > 0);

    // The list and its rows can change size after they draw, such as when the column gets shorter
    // or a font loads.
    const observer = new ResizeObserver(keepNewest);
    observer.observe(element);
    for (const row of element.children) {
      observer.observe(row);
    }
    return () => {
      observer.disconnect();
    };
  }, [list, length]);

  function onScroll(event: React.UIEvent<HTMLOListElement>) {
    const element = event.currentTarget;
    setScrolledDown(element.scrollTop > 0);
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight
      <= BOTTOM_SLOP;
  }

  return [scrolledDown, onScroll];
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
 * The logs of the game so far, in one box with two tabs: the clue log and the action log. Both stay
 * drawn, so that switching tabs keeps their scrolling.
 */
export function ClueLog({
  screenScrolls,
  tab,
  onTab,
  entries,
  actions,
  shownSegment,
  hoveredCard,
  dragging,
  onShowClue,
  onShowSegment,
  reducedMotion,
}: {
  /**
   * Whether the screen scrolls, as in the phone layout. Then the box is as tall as the log that
   * shows, instead of the log scrolling.
   */
  readonly screenScrolls: boolean;
  /**
   * The log that shows. The game screen keeps it, since the box moves to another place in the page
   * when the window changes its size.
   */
  readonly tab: LogTab;
  readonly onTab: (tab: LogTab) => void;
  readonly entries: readonly ClueLogEntry[];
  readonly actions: readonly ActionLogEntry[];
  /** The segment on screen. */
  readonly shownSegment: number | undefined;
  /** The card in a hand that the mouse is over, if any. */
  readonly hoveredCard: CardOrder | undefined;
  /** Whether the player holds a card. Then the rows do not light up under the pointer. */
  readonly dragging: boolean;
  readonly onShowClue: (segment: number) => void;
  readonly onShowSegment: (segment: number) => void;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  function getPanelClass(name: LogTab): string {
    return `tw:col-start-1 tw:row-start-1 tw:flex tw:min-h-0 tw:flex-col ${tab === name ? "" : "tw:invisible tw:group-data-screen-scrolls/logs:hidden"}`;
  }

  return (
    // The logs are a record to consult, so they sit sunken into the felt, like the other readouts.
    <section
      aria-label="Logs"
      className={`tw:group/logs tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden tw:rounded-game-panel ${screenScrolls ? "tw:flex-none" : "tw:flex-1"} ${WELL_CLASS}`}
      data-screen-scrolls={screenScrolls ? "" : undefined}
    >
      <div className="tw:px-2 tw:pt-2">
        <Tabs
          label="Clue log and action log"
          onTab={onTab}
          reducedMotion={reducedMotion}
          tab={tab}
          tabs={[
            [CLUE_LOG_TAB, "Clue Log"],
            [ACTION_LOG_TAB, "Action Log"],
          ]}
        />
      </div>
      <div className="tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(0,1fr)] tw:grid-rows-[minmax(0,1fr)]">
        <div
          className={getPanelClass(CLUE_LOG_TAB)}
          id={CLUE_LOG_TAB}
          role="tabpanel"
          style={getTabPanelStyle(tab === CLUE_LOG_TAB, reducedMotion)}
        >
          <ClueList
            dragging={dragging}
            entries={entries}
            hoveredCard={hoveredCard}
            onShowClue={onShowClue}
            reducedMotion={reducedMotion}
            shownSegment={shownSegment}
          />
        </div>
        <div
          className={getPanelClass(ACTION_LOG_TAB)}
          id={ACTION_LOG_TAB}
          role="tabpanel"
          style={getTabPanelStyle(tab === ACTION_LOG_TAB, reducedMotion)}
        >
          <ActionList
            dragging={dragging}
            entries={actions}
            onShowSegment={onShowSegment}
            reducedMotion={reducedMotion}
            shownSegment={shownSegment}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The layer that raises the row of the turn on screen. It fades in and out as the turn changes, and
 * it makes way for the hover color.
 */
function ShownLayer({
  shown,
  hoverLights,
  reducedMotion,
}: {
  readonly shown: boolean;
  readonly hoverLights: boolean;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] tw:bg-game-raised ${shown ? "tw:opacity-100" : "tw:opacity-0"} ${hoverLights ? "tw:group-hover/row:opacity-0" : ""}`}
      style={{
        transition: reducedMotion ? undefined : getOpacityTransition(shown),
      }}
    />
  );
}

/**
 * The clues of the game so far, newest at the bottom, like the classic screen's clue log. They are
 * in columns: the turn, the giver, an arrow, the receiver, and the clue (a disc and its name). A
 * name that is too long for its column is cut off. Each one is a button that shows the turn after
 * it. The clue of the turn on screen stands out.
 *
 * While the mouse is over a card in a hand, the clues about that card stand out, as on the classic
 * screen: the ones that touched it (on green), and the ones to its hand that did not (on red). The
 * other clues stay, so that the log does not jump as the mouse passes over the hands. A clue that
 * did not touch the card is also struck through, since it says what the card is not, so that the
 * match does not depend on color alone.
 *
 * While the player drags a card, the rows do not light up under the pointer, since a click on them
 * does nothing then.
 */
function ClueList({
  entries,
  shownSegment,
  hoveredCard,
  dragging,
  onShowClue,
  reducedMotion,
}: {
  readonly entries: readonly ClueLogEntry[];
  readonly shownSegment: number | undefined;
  readonly hoveredCard: CardOrder | undefined;
  readonly dragging: boolean;
  readonly onShowClue: (segment: number) => void;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);
  const [scrolledDown, onScroll] = useNewestInView(listRef, entries.length);

  if (entries.length === 0) {
    return <p className={EMPTY_CLASS}>No clues yet.</p>;
  }

  return (
    <ol
      className={`${LIST_CLASS} tw:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] ${scrolledDown ? SCROLLED_DOWN_CLASS : ""}`}
      onScroll={onScroll}
      ref={listRef}
    >
      {entries.map((entry) => {
        const match = getMatch(entry, hoveredCard);
        // The clue's row stands out on the turn after it.
        const shown =
          shownSegment !== undefined && entry.segment === shownSegment - 1;
        const hoverLights = !dragging && match === "none";
        const background = `tw:bg-transparent ${hoverLights ? "tw:hover:bg-white/18" : ""}`;
        return (
          <li
            className="tw:col-span-full tw:grid tw:grid-cols-subgrid"
            key={entry.segment}
          >
            <button
              aria-current={shown ? "step" : undefined}
              className={`tw:group/row tw:relative tw:isolate tw:col-span-full tw:grid tw:cursor-pointer tw:grid-cols-subgrid tw:items-center tw:gap-x-2 tw:rounded-game-control tw:border-0 tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:text-game-text ${background}`}
              onClick={() => {
                onShowClue(entry.segment);
              }}
              ref={tooltipRef(
                `This clue was given on turn ${entry.turn}. Click to go to it.`,
              )}
              style={{ lineHeight: `${ROW_LINE_HEIGHT}px` }}
              type="button"
            >
              <ShownLayer
                hoverLights={hoverLights}
                reducedMotion={reducedMotion}
                shown={shown}
              />
              {(["positive", "negative"] as const).map((layer) => (
                <span
                  aria-hidden="true"
                  className={`tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] ${MATCH_BACKGROUND[layer]}`}
                  key={layer}
                  style={{
                    opacity: match === layer ? 1 : 0,
                    transition: reducedMotion
                      ? undefined
                      : getOpacityTransition(match === layer),
                  }}
                />
              ))}
              <span className="tw:text-[13px] tw:text-game-muted">
                #{entry.turn}
              </span>
              <Name name={entry.giverName} />
              <i
                aria-label="told"
                className="fas fa-arrow-right tw:text-[11px] tw:text-game-muted"
                role="img"
              />
              <Name name={entry.targetName} />
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
  );
}

/**
 * Every line of the game's log so far, newest at the bottom, like the classic screen's action log:
 * the turn and what happened. Each one is a button that shows the game just after it. The line of
 * the turn on screen stands out.
 */
function ActionList({
  entries,
  shownSegment,
  dragging,
  onShowSegment,
  reducedMotion,
}: {
  readonly entries: readonly ActionLogEntry[];
  readonly shownSegment: number | undefined;
  readonly dragging: boolean;
  readonly onShowSegment: (segment: number) => void;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const listRef = useRef<HTMLOListElement>(null);
  const [scrolledDown, onScroll] = useNewestInView(listRef, entries.length);

  if (entries.length === 0) {
    return <p className={EMPTY_CLASS}>No actions yet.</p>;
  }

  return (
    <ol
      className={`${LIST_CLASS} tw:grid-cols-[auto_minmax(0,1fr)] ${scrolledDown ? SCROLLED_DOWN_CLASS : ""}`}
      onScroll={onScroll}
      ref={listRef}
    >
      {entries.map((entry, i) => {
        const shown = entry.segment === shownSegment;
        return (
          <li
            className="tw:col-span-full tw:grid tw:grid-cols-subgrid"
            // The log only grows, so a line keeps its place.
            key={i}
          >
            <button
              aria-current={shown ? "step" : undefined}
              className={`tw:group/row tw:relative tw:isolate tw:col-span-full tw:grid tw:cursor-pointer tw:grid-cols-subgrid tw:items-baseline tw:gap-x-2 tw:rounded-game-control tw:border-0 tw:bg-transparent tw:px-2 tw:py-1 tw:text-left tw:text-[14px] tw:text-game-text ${dragging ? "" : "tw:hover:bg-white/18"}`}
              onClick={() => {
                onShowSegment(entry.segment);
              }}
              style={{ lineHeight: `${ROW_LINE_HEIGHT}px` }}
              type="button"
            >
              <ShownLayer
                hoverLights={!dragging}
                reducedMotion={reducedMotion}
                shown={shown}
              />
              <span className="tw:text-[13px] tw:text-game-muted">
                {entry.turn === undefined ? "" : `#${entry.turn}`}
              </span>
              <span>{entry.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A name on one line that fills its column. If it is too long for the column, its end is cut off.
 */
function Name({ name }: { readonly name: string }): React.JSX.Element {
  return (
    <span className="tw:overflow-hidden tw:whitespace-nowrap">{name}</span>
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
          size={
            colorSymbol.type === "text"
              ? (size * DISC_FONT_SIZE_PER_SIZE) / COLOR_SYMBOL_PER_SIZE
              : size * DISC_PIP_PER_SIZE
          }
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
