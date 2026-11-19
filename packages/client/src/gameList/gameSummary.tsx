// The parts of a row in a list of games: its score, its options, and the style of its buttons.

import type { GameSummary } from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import { secondsToClockString } from "@hanabi-live/game";
import { Fragment } from "react";
import { OptionIcons } from "../enums/OptionIcons.ts";
import { tooltipRefHtml } from "../tooltipRef.ts";

type EndCondition = GameSummary["endCondition"];

/**
 * A button in a row of a list of games, or under it. It uses the page's font, which a button
 * element does not inherit, so that a button and a link look the same.
 */
export const ROW_BUTTON =
  "tw:m-0 tw:inline-flex tw:h-[2.25em] tw:items-center tw:justify-center tw:gap-2 tw:px-3 tw:[font:inherit] tw:text-[0.9em] tw:leading-none";

/** A row's button that shows only an icon. */
export const ROW_ICON_BUTTON = `${ROW_BUTTON} tw:w-[2.25em] tw:px-0`;

/** The tooltip of a row's button that opens a shared replay. */
export const SHARED_REPLAY_TOOLTIP = "Watch in a shared replay.";

/** The tooltip of a row's button that shows the other games on the seed. */
export const OTHER_GAMES_TOOLTIP = "See the other games on this seed.";

/** The tooltip of a row's other games, when no one else has played the seed. */
export const NO_OTHER_GAMES_TOOLTIP = "No one else has played this seed.";

/** How a game ended, when it did not end normally. */
export const END_CONDITION_TEXT = {
  normal: undefined,
  strikeout: "Struck out",
  timeout: "Ran out of time",
  terminatedByPlayer: "Terminated",
  terminatedByVote: "Terminated by vote",
  speedrunFail: "Speedrun failed",
  idleTimeout: "Idle too long",
  characterSoftlock: "Stuck",
  allOrNothingFail: "Failed",
  allOrNothingSoftlock: "Stuck",
} as const satisfies Record<EndCondition, string | undefined>;

/** Games in groups by the day that they finished, in the order that they come. */
export function groupByDay(games: readonly GameSummary[]): ReadonlyArray<{
  readonly day: string;
  readonly games: readonly GameSummary[];
}> {
  const groups: Array<{ day: string; games: GameSummary[] }> = [];
  for (const game of games) {
    const day = dayName(new Date(game.finishedAt));
    const last = groups.at(-1);
    if (last?.day === day) {
      last.games.push(game);
    } else {
      groups.push({
        day,
        games: [game],
      });
    }
  }
  return groups;
}

/** "Today", "Yesterday", or the date, with the year only when it is not this year. */
function dayName(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

/** The score as a number over the variant's best score, with a bar that fills toward it. */
export function Score({
  score,
  max,
}: {
  readonly score: number;
  readonly max: number;
}): React.JSX.Element {
  const perfect = score === max;
  return (
    <div className="tw:w-[4.25em]">
      <div className="tw:flex tw:items-baseline tw:gap-1 tw:leading-none">
        <span
          className={`tw:text-[1.6em] tw:font-semibold tw:tabular-nums ${perfect ? "tw:text-[var(--button-primary-bg)]" : ""}`}
        >
          {score}
        </span>
        <span className="tw:text-[0.75em] tw:text-text-label tw:tabular-nums">
          / {max}
        </span>
      </div>
      <div className="tw:mt-1.5 tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-border">
        <div
          className={`tw:h-full tw:rounded-full ${perfect ? "tw:bg-[var(--button-primary-bg)]" : "tw:bg-green-text"}`}
          style={{ width: `${(score * 100) / max}%` }}
        />
      </div>
    </div>
  );
}

/** Games with more options than this show an ellipsis, with the options listed in the tooltip. */
const MAX_OPTION_ICONS = 3;

/**
 * A few icons for the options of a game, with a tooltip that lists all of them. A game without
 * options shows the empty text.
 */
export function GameOptionIcons({
  options,
  emptyText,
}: {
  readonly options: GameOptions;
  readonly emptyText?: string;
}): React.JSX.Element | null {
  const items = getOptionItems(options);
  if (items.length === 0) {
    return emptyText === undefined ? null : <>{emptyText}</>;
  }

  const tooltip = items
    .map(
      ({ icon, text }) =>
        `<li class="tw:mb-[0.3em] tw:pl-[0.2em] tw:last:mb-0"><i class="${icon} icon-label"></i>${text}</li>`,
    )
    .join("");
  const ref = tooltipRefHtml(
    `<ul class="tw:m-0 tw:list-none tw:p-0">${tooltip}</ul>`,
    { instant: true },
  );

  // The tooltip's arrow points at the middle of this element, so it must be only as wide as the
  // icons, not the cell.
  return (
    <div className="tw:w-fit" ref={ref}>
      {items.length > MAX_OPTION_ICONS ? (
        <i className="fas fa-ellipsis" />
      ) : (
        items.map(({ icon }, i) => (
          <Fragment key={icon}>
            {i > 0 && " "}
            <i className={icon} />
          </Fragment>
        ))
      )}
    </div>
  );
}

function getOptionItems(
  options: GameOptions,
): ReadonlyArray<{ readonly icon: OptionIcons; readonly text: string }> {
  const items: Array<{ icon: OptionIcons; text: string }> = [];
  const { timeControl } = options;
  if (timeControl !== undefined) {
    items.push({
      icon: OptionIcons.Timed,
      text: `Timed (${secondsToClockString(timeControl.baseSeconds)} + ${secondsToClockString(timeControl.perTurnSeconds)})`,
    });
  }
  if (options.speedrun) {
    items.push({
      icon: OptionIcons.Speedrun,
      text: "Speedrun",
    });
  }
  if (options.deckPlays) {
    items.push({
      icon: OptionIcons.DeckPlays,
      text: "Bottom-Deck Blind-Plays",
    });
  }
  if (options.emptyClues) {
    items.push({
      icon: OptionIcons.EmptyClues,
      text: "Empty Clues",
    });
  }
  if (options.oneExtraCard) {
    items.push({
      icon: OptionIcons.OneExtraCard,
      text: "One Extra Card",
    });
  }
  if (options.oneLessCard) {
    items.push({
      icon: OptionIcons.OneLessCard,
      text: "One Less Card",
    });
  }
  if (options.allOrNothing) {
    items.push({
      icon: OptionIcons.AllOrNothing,
      text: "All or Nothing",
    });
  }
  if (options.detrimentalCharacters) {
    items.push({
      icon: OptionIcons.DetrimentalCharacters,
      text: "Detrimental Characters",
    });
  }
  return items;
}
