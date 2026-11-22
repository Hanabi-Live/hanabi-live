// A player's join date, game counts, longest streak, and time on their profile. The counts and the
// time are two short lists side by side.

import type { playerStatisticsSchema } from "@hanabi-live/data";
import { MIN_ACHIEVEMENT_PLAYERS, SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { getVariantById } from "@hanabi-live/game";
import { HOUR_IN_MILLISECONDS, SECOND_IN_MILLISECONDS } from "complete-common";
import type * as z from "zod";
import { SuitDots } from "../gameList/SuitDots.tsx";
import { tooltipRef } from "../tooltipRef.ts";

type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;

const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = HOUR_IN_MILLISECONDS / SECOND_IN_MILLISECONDS;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;

/** A value that is zero, such as no time spent in speedruns. */
const NONE = "\u{2013}";

/** A time in its two largest units, such as "38d 20h" or "16h 39m". */
function durationText(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) {
    return seconds === 0 ? NONE : "<1m";
  }
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function countText(count: number): string {
  return count === 0 ? NONE : count.toLocaleString();
}

interface Row {
  readonly label: string;
  readonly value: string;
  /** A row that sums up the rows above it. */
  readonly total?: boolean;
  /** What the label means, in a tooltip. */
  readonly tooltip?: string;
  /** A line under the row that tells more about its value. */
  readonly detail?: React.ReactNode;
}

const STREAK_TOOLTIP = `The most max scores in a row in one variant, with the same number of players. Only games with ${MIN_ACHIEVEMENT_PLAYERS} or more players and no option, such as "One Extra Card", count.`;

/** The variant and the number of players of a streak, such as "Rainbow (5 Suits), 3 players". */
function StreakDetail({
  streak,
}: {
  readonly streak: NonNullable<PlayerStatistics["bestStreak"]>;
}): React.JSX.Element {
  const variant = getVariantById(streak.variantId);
  return (
    <span className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
      <SuitDots size="0.5em" suits={variant.suits} />
      <span className="tw:min-w-0">
        {variant.name}, {streak.numPlayers} players
      </span>
    </span>
  );
}

function StatisticGroup({
  heading,
  rows,
}: {
  readonly heading: string;
  readonly rows: readonly Row[];
}): React.JSX.Element {
  return (
    <div>
      <h4 className="tw:mb-1.5 tw:text-[0.85em] tw:font-semibold tw:text-text-label">
        {heading}
      </h4>
      <dl className="tw:m-0">
        {rows.map(({ label, value, total = false, tooltip, detail }) => (
          // A grid instead of a nested box, since a group in a list may hold only its terms and
          // descriptions.
          <div
            className={`tw:grid tw:grid-cols-[1fr_auto] tw:items-baseline tw:gap-x-4 tw:py-0.5 ${total ? "tw:mt-1 tw:border-t tw:border-border tw:pt-1.5 tw:font-semibold" : ""}`}
            key={label}
          >
            <dt
              className={
                tooltip === undefined
                  ? undefined
                  : "tw:cursor-help tw:justify-self-start tw:underline tw:decoration-dotted tw:underline-offset-4"
              }
              ref={tooltip === undefined ? undefined : tooltipRef(tooltip)}
            >
              {label}
            </dt>
            <dd className="tw:m-0 tw:tabular-nums">{value}</dd>
            {detail !== undefined && (
              <dd className="tw:col-span-2 tw:m-0 tw:mt-0.5 tw:text-[0.85em] tw:text-text-label">
                {detail}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ProfileStatistics({
  statistics,
}: {
  readonly statistics: PlayerStatistics;
}): React.JSX.Element {
  const joined = new Date(statistics.dateJoined).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <section className="tw:mx-auto tw:mb-8 tw:grid tw:max-w-[36em] tw:gap-x-12 tw:gap-y-5 tw:sm:grid-cols-2">
      <p className="tw:m-0 tw:text-center tw:text-[0.9em] tw:text-text tw:sm:col-span-2">
        Joined {joined}.
      </p>
      <StatisticGroup
        heading="Games"
        rows={[
          {
            label: "Played",
            value: countText(statistics.numGames),
          },
          {
            label: "Finished normally",
            value: countText(statistics.numGamesNormal),
          },
          {
            label: "Longest streak",
            value: countText(statistics.bestStreak?.length ?? 0),
            tooltip: STREAK_TOOLTIP,
            ...(statistics.bestStreak !== undefined && {
              detail: <StreakDetail streak={statistics.bestStreak} />,
            }),
          },
        ]}
      />
      <StatisticGroup
        heading="Time"
        rows={[
          {
            label: "Playing",
            value: durationText(statistics.timePlayedSeconds),
          },
          {
            label: "Reviewing",
            value: durationText(statistics.timeReviewedSeconds),
          },
          {
            label: "Total",
            value: durationText(statistics.timeTotalSeconds),
            total: true,
          },
        ]}
      />
    </section>
  );
}
