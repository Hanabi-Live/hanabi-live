import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import type { BestScore } from "./interfaces/BestScore";
import type { UserStatsRow } from "./interfaces/UserStatsRow";

interface ScoreSummary {
  readonly rows: ReadonlyArray<{
    id: number;
    name: string;
    maxScore: number;
    numGames: number;
    bestScores: readonly BestScore[];
    averageScore: string;
    strikeoutRate: string;
  }>;
  readonly total: number;
  readonly percentage: string;
  readonly perType: ReadonlyArray<{ total: number; percentage: string }>;
}

export function formatPercentage(
  numerator: number,
  denominator: number,
): string {
  return formatDecimal(
    denominator === 0 ? 0 : (numerator / denominator) * 100,
  ).replace(/\.0$/u, "");
}

/** Go's "%.1f" rounds exact binary ties to even, unlike JavaScript's toFixed. */
export function formatDecimal(value: number): string {
  const fraction = Math.abs(value % 1);
  if (fraction === 0.25 || fraction === 0.75) {
    const lower = Math.floor(value * 10);
    return ((lower % 2 === 0 ? lower : lower + 1) / 10).toFixed(1);
  }
  return value.toFixed(1);
}

function unit(value: number, name: string) {
  return `${value} ${name}${value === 1 ? "" : "s"}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return unit(Math.round(seconds), "second");
  }
  if (seconds < 3600) {
    return unit(Math.round(seconds / 60), "minute");
  }
  const totalHours = Math.trunc(seconds / 3600);
  const minutes = Math.trunc(seconds / 60) - totalHours * 60;
  // Go retains "24 hours" instead of rolling it over to the next day.
  const days = Math.max(0, Math.floor((totalHours - 1) / 24));
  const hours = totalHours - days * 24;
  return days > 0
    ? `${unit(days, "day")}, ${unit(hours, "hour")}, and ${unit(minutes, "minute")}`
    : `${unit(hours, "hour")} and ${unit(minutes, "minute")}`;
}

export function formatDateJoined(date: Date): string {
  const day = date.getUTCDate();
  let suffix = "th";
  if ([1, 21, 31].includes(day)) {
    suffix = "st";
  } else if ([2, 22].includes(day)) {
    suffix = "nd";
  } else if ([23, 3].includes(day)) {
    suffix = "rd";
  }
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${month} ${day}${suffix}, ${date.getUTCFullYear()}`;
}

export function getScoreSummary(
  stats: ReadonlyMap<number, UserStatsRow>,
): ScoreSummary {
  const totals = [0, 0, 0, 0, 0];
  const rows = VARIANT_NAMES.map((name) => {
    const variant = getVariant(name);
    const row = stats.get(variant.id);
    const bestScores = [2, 3, 4, 5, 6].map((numPlayers, index) => {
      const best = row?.bestScores[index] ?? {
        numPlayers,
        score: 0,
        modifier: 0,
      };
      if (best.score === variant.maxScore) {
        totals[index] = (totals[index] ?? 0) + 1;
      }
      return best;
    });
    const average = formatDecimal(row?.averageScore ?? 0);
    return {
      id: variant.id,
      name,
      maxScore: variant.maxScore,
      numGames: row?.numGames ?? 0,
      bestScores,
      averageScore: average === "0.0" ? "-" : average,
      strikeoutRate:
        row === undefined || row.numGames === 0
          ? "-"
          : formatPercentage(row.numStrikeouts, row.numGames),
    };
  });
  const total = totals.reduce((sum, value) => sum + value, 0);
  return {
    rows,
    total,
    percentage: formatPercentage(total, VARIANT_NAMES.length * 5),
    perType: totals.map((value) => ({
      total: value,
      percentage: formatPercentage(value, VARIANT_NAMES.length),
    })),
  };
}
