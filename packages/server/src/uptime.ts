const DATETIME_SERVER_STARTED = Date.now();

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getCameOnline(): string {
  const datetimeString = millisecondsToEnglishDateString(
    DATETIME_SERVER_STARTED,
  );
  return `The server came online at: ${datetimeString}`;
}

function millisecondsToEnglishDateString(milliseconds: number): string {
  const date = new Date(milliseconds);

  const englishDateString = date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h24",
    timeZone: "UTC",
    timeZoneName: "short",
  });

  // By default, it will look like: Monday, August 14, 2023 at 22:04 UTC
  return englishDateString.replaceAll(" at ", ", ");
}

// TODO: export
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getUptime(): string {
  const elapsedMilliseconds = Date.now() - DATETIME_SERVER_STARTED;
  return millisecondsToDateString(elapsedMilliseconds);
}

function millisecondsToDateString(milliseconds: number): string {
  const duration = millisecondsToDuration(milliseconds);
  if (duration === undefined) {
    return "unknown";
  }

  const { days, hours, minutes, seconds } = duration;

  const daysString = timeUnitsToWord(days, "day");
  const hoursString = timeUnitsToWord(hours, "hour");
  const minutesString = timeUnitsToWord(minutes, "minute");
  const secondsString = timeUnitsToWord(seconds, "second");

  // Display only seconds if the duration is less than a minute.
  if (days === 0 && hours === 0 && minutes === 0) {
    return secondsString;
  }

  // Display only minutes if the duration is less than an hour.
  if (days === 0 && hours === 0) {
    return minutesString;
  }

  // Display hours and minutes if the duration is less than a day.
  if (days === 0) {
    return `${hoursString} and ${minutesString}`;
  }

  // Display days, hours, and minutes if the duration is less than a week.
  return `${daysString}, ${hoursString}, and ${minutesString}`;
}

/**
 * From:
 * https://stackoverflow.com/questions/19700283/how-to-convert-time-in-milliseconds-to-hours-min-sec-format-in-javascript
 */
function millisecondsToDuration(milliseconds: number) {
  if (!Number.isInteger(milliseconds)) {
    return undefined;
  }

  /**
   * Takes as many whole units from the time pool (milliseconds) as possible.
   *
   * @param millisecondsUnit Size of a single unit in milliseconds.
   * @returns Number of units taken from the time pool.
   */
  // eslint-disable-next-line func-style
  const allocate = (millisecondsUnit: number) => {
    const units = Math.trunc(milliseconds / millisecondsUnit);
    milliseconds -= units * millisecondsUnit; // eslint-disable-line no-param-reassign
    return units;
  };

  return {
    days: allocate(86_400_000),
    hours: allocate(3_600_000),
    minutes: allocate(60_000),
    seconds: allocate(1000),
    milliseconds, // remainder
  };
}

function timeUnitsToWord(timeUnits: number, timeUnitName: string): string {
  const suffix = timeUnits === 1 ? "" : "s";
  return `${timeUnits} ${timeUnitName}${suffix}`;
}
