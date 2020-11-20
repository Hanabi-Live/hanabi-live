// A collection of miscellaneous functions

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
export function closeAllTooltips(): void {
  const instances = $.tooltipster.instances();
  $.each(
    instances,
    (_: number, instance: JQueryTooltipster.ITooltipsterInstance) => {
      if (instance.status().open) {
        instance.close();
      }
    },
  );
}

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
export function copyStringToClipboard(str: string): void {
  const el = document.createElement("textarea"); // Create new element
  el.value = str; // Set the value (the string to be copied)
  el.setAttribute("readonly", ""); // Set non-editable to avoid focus
  document.body.appendChild(el);
  el.select(); // Select text inside element
  document.execCommand("copy"); // Copy text to clipboard
  document.body.removeChild(el); // Remove temporary element
}

export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Use this on a switch statement's default case to get
// the linter to complain if a case was not predicted
export const ensureAllCases = (obj: never): never => obj;

export const getRandomNumber = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1) + min);

export function initArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
}

// This is a helper to check for empty/invalid HTML elements without worrying about the linter
export const isEmpty = (
  value: string | string[] | number | undefined,
): boolean => !value; // eslint-disable-line @typescript-eslint/strict-boolean-expressions

// From: https://stackoverflow.com/questions/61526746
export const isKeyOf = <T>(p: PropertyKey, target: T): p is keyof T =>
  p in target;

export function millisecondsToClockString(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
}

export function nullIfNegative(x: number): number | null {
  return x >= 0 ? x : null;
}

function pad2(num: number) {
  if (num < 10) {
    return `0${num}`;
  }
  return `${num}`;
}

// By default, "parseInt('1a')" will return "1", which is unexpected
// Thus, we use a helper function as a stand-in for parseInt so that we can handle this properly
export function parseIntSafe(input: string): number {
  let trimmedInput = input.trim(); // Remove all leading and trailing whitespace
  const isNegativeNumber = trimmedInput.startsWith("-");
  if (isNegativeNumber) {
    // Remove the leading minus sign before we match the regular expression
    trimmedInput = trimmedInput.substring(1);
  }
  if (/^\d+$/.exec(trimmedInput) === null) {
    // "\d" matches any digit (same as "[0-9]")
    return NaN;
  }
  if (isNegativeNumber) {
    // Add the leading minus sign back
    trimmedInput = `-${trimmedInput}`;
  }
  return parseInt(trimmedInput, 10);
}

export function timerFormatter(totalSeconds: number): string {
  const time = new Date();
  time.setHours(0, 0, totalSeconds);
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
  if (hours > 0) {
    const minutesFormatted = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours}:${minutesFormatted}:${secondsFormatted}`;
  }
  return `${minutes}:${secondsFormatted}`;
}

// Remove any replay suffixes from the URL without reloading the page, if any
export function trimReplaySuffixFromURL(): void {
  let finalCharacterIndex;
  if (window.location.pathname.includes("/replay")) {
    finalCharacterIndex = window.location.pathname.indexOf("/replay");
  } else if (window.location.pathname.includes("/shared-replay")) {
    finalCharacterIndex = window.location.pathname.indexOf("/shared-replay");
  } else {
    return;
  }

  let newURL = window.location.pathname.substring(0, finalCharacterIndex);
  if (newURL === "") {
    newURL = "/";
  }
  window.history.pushState({}, "", newURL);
}

// from https://stackoverflow.com/questions/24093263/set-font-awesome-icons-as-cursor-is-this-possible
export function createMouseCursors(): { [name: string]: string } {
  const canvas = document.createElement("canvas");
  canvas.width = 29;
  canvas.height = 26;

  const icons: Array<{
    name: string;
    width: number;
    code: string;
    color: string;
    html: string;
  }> = [
    {
      name: "eye",
      width: 29,
      color: "#323232",
      code: "\uf06e",
      html: "&#61550;",
    },
    {
      name: "play",
      width: 23,
      color: "#323232",
      code: "\uf04b",
      html: "&#61515;",
    },
    {
      name: "sign",
      width: 26,
      color: "#323232",
      code: "\uf2f6",
      html: "&#62198;",
    },
    {
      name: "forbid",
      width: 26,
      color: "#8b0000",
      code: "\uf05e",
      html: "&#61534;",
    },
  ];

  const mouseIcons: { [name: string]: string } = {};

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Unable to create canvas");
  }

  ctx.font = "24px 'Font Awesome 5 Free'";

  for (const icon of icons) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = icon.color;
    ctx.fillText(icon.code, (canvas.width - icon.width) / 2, 23);
    mouseIcons[icon.name] = `url(${canvas.toDataURL("image/png")}) ${
      canvas.width / 2
    } ${canvas.height / 2}, pointer`;
  }
  return mouseIcons;
}
