// Parts of a list of past games that the public pages and the lobby's history share.

import type { GameSummary } from "@hanabi-live/data";

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
