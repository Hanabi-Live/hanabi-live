/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// NOTE: This is because this file introduces a generic extension for
// all JQuery objects

// A collection of miscellaneous functions

// init is executed when the document is ready
export const init = () => {
  // Add a function to the jQuery object to detect if an element is off screen
  // https://stackoverflow.com/questions/8897289/how-to-check-if-an-element-is-off-screen
  ($.expr as any).filters.offscreen = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < 0 // Above the top
      || rect.bottom > window.innerHeight // Below the bottom
      || rect.left < 0 // Left of the left edge
      || rect.right > window.innerWidth // Right of the right edge
    );
  };
};

// From: https://stackoverflow.com/questions/27709489/jquery-tooltipster-plugin-hide-all-tips
export const closeAllTooltips = () => {
  const instances = $.tooltipster.instances();
  $.each(instances, (_: number, instance: JQueryTooltipster.ITooltipsterInstance) => {
    if (instance.status().open) {
      instance.close();
    }
  });
};

// From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
export const copyStringToClipboard = (str: string) => {
  const el = document.createElement('textarea'); // Create new element
  el.value = str; // Set the value (the string to be copied)
  el.setAttribute('readonly', ''); // Set non-editable to avoid focus
  document.body.appendChild(el);
  el.select(); // Select text inside element
  document.execCommand('copy'); // Copy text to clipboard
  document.body.removeChild(el); // Remove temporary element
};

export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Use this on a switch statement's default case to get
// the linter to complain if a case was not predicted
export const ensureAllCases = (obj: never): never => obj;

export const getRandomNumber = (
  min: number,
  max: number,
) => Math.floor((Math.random() * (max - min + 1)) + min);

export function initArray<T>(length: number, value: T): T[] {
  return Array.from({ length }, () => value);
}

// This is a helper to check for empty/invalid HTML elements without worrying about the linter
// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
export const isEmpty = (value: string | string[] | number | undefined) => !value;

// From: https://stackoverflow.com/questions/61526746
export const isKeyOf = <T>(p: PropertyKey, target: T): p is keyof T => p in target;

export const millisecondsToClockString = (milliseconds: number) => {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
};

export function nullIfNegative(x: number) {
  return x >= 0 ? x : null;
}

const pad2 = (num: number) => {
  if (num < 10) {
    return `0${num}`;
  }
  return `${num}`;
};

export const timerFormatter = (totalSeconds: number) => {
  const milliseconds = totalSeconds * 1000;
  const time = new Date();
  time.setHours(0, 0, 0, milliseconds || 0);
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const secondsFormatted = seconds < 10 ? `0${seconds}` : seconds;
  return `${minutes}:${secondsFormatted}`;
};

// Remove any replay suffixes from the URL without reloading the page, if any
export const trimReplaySuffixFromURL = () => {
  let finalCharacterIndex;
  if (window.location.pathname.includes('/replay')) {
    finalCharacterIndex = window.location.pathname.indexOf('/replay');
  } else if (window.location.pathname.includes('/shared-replay')) {
    finalCharacterIndex = window.location.pathname.indexOf('/shared-replay');
  } else {
    return;
  }

  let newURL = window.location.pathname.substring(0, finalCharacterIndex);
  if (newURL === '') {
    newURL = '/';
  }
  window.history.pushState({}, '', newURL);
};
