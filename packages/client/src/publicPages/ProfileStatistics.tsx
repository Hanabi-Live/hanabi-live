// A player's join date, game counts, and time on their profile. The counts and the time are two
// short lists side by side.

import type { playerStatisticsSchema } from "@hanabi-live/data";
import { SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { HOUR_IN_MILLISECONDS, SECOND_IN_MILLISECONDS } from "complete-common";
import type * as z from "zod";

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
        {rows.map(({ label, value, total = false }) => (
          <div
            className={`tw:flex tw:items-baseline tw:justify-between tw:gap-4 tw:py-0.5 ${total ? "tw:mt-1 tw:border-t tw:border-border tw:pt-1.5 tw:font-semibold" : ""}`}
            key={label}
          >
            <dt>{label}</dt>
            <dd className="tw:m-0 tw:tabular-nums">{value}</dd>
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
