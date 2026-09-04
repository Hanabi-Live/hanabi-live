/**
 * From: https://techoverflow.net/2018/03/30/copying-strings-to-the-clipboard-using-pure-javascript/
 */
export function copyStringToClipboard(str: string): void {
  const element = document.createElement("textarea"); // Create new element.
  element.value = str; // Set the value (the string to be copied).
  element.setAttribute("readonly", ""); // Set non-editable to avoid focus.
  document.body.append(element);
  element.select(); // Select text inside element.
  document.execCommand("copy"); // Copy text to clipboard.
  element.remove(); // Remove temporary element.
}

export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getHTMLElement(selectors: string): HTMLElement {
  const element = document.querySelector(selectors);

  if (!(element instanceof HTMLElement)) {
    throw new TypeError(`Failed to find the HTMLElement: ${selectors}`);
  }

  return element;
}

export function getHTMLInputElement(selectors: string): HTMLInputElement {
  const element = document.querySelector(selectors);

  if (!(element instanceof HTMLInputElement)) {
    throw new TypeError(`Failed to find the HTMLInputElement: ${selectors}`);
  }

  return element;
}

export function getURLFromPath(path: string): string {
  let url = `${globalThis.location.protocol}//${globalThis.location.hostname}`;
  if (globalThis.location.port !== "") {
    url += `:${globalThis.location.port}`;
  }
  url += path;

  return url;
}

export function setBrowserAddressBarPath(newPath: string, hash?: string): void {
  // Combine the path (e.g. "/") with the query string parameters (e.g. "?dev")
  const queryParameters = new URLSearchParams(globalThis.location.search);
  const modifiedQueryParameters = queryParameters
    .toString()
    // "URLSearchParams.toString()" will convert "?dev" to "?dev=", which is undesirable.
    .replaceAll("=&", "&")
    .replace(/=$/, "");

  let path = newPath;
  if (modifiedQueryParameters !== "") {
    path += `?${modifiedQueryParameters}`;
  }
  if (hash !== undefined) {
    // e.g. "#123", which is used to show the current turn
    path += hash;
  }
  globalThis.history.replaceState(undefined, "", path);
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
