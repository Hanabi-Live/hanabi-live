import { assertDefined } from "complete-common";
import { formatDuration } from "./publicPageUtils";

const STARTED = new Date();
const STARTED_MONOTONIC = performance.now();

export function getStartedTimestamp(): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  });
  const parts = new Map(
    formatter.formatToParts(STARTED).map(({ type, value }) => [type, value]),
  );
  function part(type: Intl.DateTimeFormatPartTypes) {
    const value = parts.get(type);
    assertDefined(value, `Missing start timestamp ${type}.`);
    return value;
  }
  const date = `${part("weekday")} ${part("month")} ${part("day")}`;
  const time = `${part("hour")}:${part("minute")}:${part("second")}`;
  return `${date} ${time} ${part("timeZoneName")} ${part("year")}`;
}

export function getCameOnline(): string {
  return `The server came online at: ${getStartedTimestamp()}`;
}

export function getUptimeSeconds(): number {
  return (performance.now() - STARTED_MONOTONIC) / 1000;
}

export function getUptime(): string {
  return `Uptime: ${formatDuration(Math.floor(getUptimeSeconds()))}`;
}
