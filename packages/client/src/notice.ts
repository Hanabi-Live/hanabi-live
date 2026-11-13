// A notice from the server, which the client shows in a modal.

import type { ServerEventData } from "@hanabi-live/data";
import { VERSION } from "@hanabi-live/data";
import { escapeHtml, textToHtml } from "./utils.ts";

/** The HTML of a notice. An outdated client lists its release and the server's. */
export function noticeHtml(notice: ServerEventData["warning"]): string {
  return notice.code === "outdatedClient" && notice.latestVersion !== undefined
    ? outdatedClientHtml(notice.latestVersion)
    : textToHtml(notice.message);
}

/** The HTML that explains that the client is from another release than `latestVersion`. */
export function outdatedClientHtml(latestVersion: string): string {
  return [
    "You are running an outdated version of the client code.",
    "<ul>",
    `<li>You are on: <strong>${escapeHtml(VERSION)}</strong></li>`,
    `<li>The latest: <strong>${escapeHtml(latestVersion)}</strong></li>`,
    "</ul>",
    "Please perform a refresh to get the latest version. ",
  ].join("");
}
