// The tooltip with the information about a game, which the classic screen shows on its deck and the
// redesigned game screen shows on the name of the variant.

import {
  millisecondsToClockString,
  secondsToClockString,
} from "@hanabi-live/game";
import { OptionIcons } from "../../enums/OptionIcons.ts";
import { dateTimeFormatter, escapeHtml } from "../../utils.ts";
import { globals } from "./UiGlobals.ts";

/**
 * The HTML of a tooltip about the game: its table, seed, variant, and options. A tooltip that stays
 * the same while it shows leaves out the lengths of the game and of the shared replay, which change
 * every second.
 */
export function getGameInfoTooltip(showLengths = true): string {
  let content = "<strong>Game Info:</strong>";
  content += '<ul class="game-tooltips-ul">';

  const currentTable = globals.lobby.getTable(globals.lobby.joinedTableId);
  if (currentTable !== undefined) {
    content += tooltipField(
      "fas fa-signature",
      "Table name",
      escapeHtml(currentTable.settings.name),
    );

    content += tooltipField(
      "fas fa-crown",
      "Owner",
      escapeHtml(currentTable.owner.username),
    );
  }

  if (globals.state.finished && globals.state.replay.gameId !== undefined) {
    content += tooltipField(
      "fas fa-fingerprint",
      "Database ID",
      `<strong>${globals.state.replay.gameId}</strong>`,
    );
  }

  if (globals.state.finished || globals.metadata.customDeal) {
    const { seed } = globals.metadata;
    const suffix = seed === undefined ? " (JSON game)" : "";
    content += tooltipField(
      "fas fa-seedling",
      "Seed",
      `<strong>${escapeHtml(seed ?? "n/a")}</strong>${suffix}`,
    );
  }

  if (globals.state.finished && globals.state.datetimeFinished !== undefined) {
    const datetimeFinishedDate = new Date(globals.state.datetimeFinished);
    const formattedDatetimeFinished =
      dateTimeFormatter.format(datetimeFinishedDate);
    content += tooltipField(
      "fas fa-calendar",
      "Date Played",
      `<strong>${formattedDatetimeFinished}</strong>`,
    );
  }

  // "datetimeStarted" and "datetimeFinished" are initialized to strings from the reply to
  // "gameInitLoad", so they should never be undefined.
  if (
    showLengths
    && globals.state.datetimeStarted !== undefined
    && globals.state.datetimeFinished !== undefined
  ) {
    const startedDate = new Date(globals.state.datetimeStarted);
    const finishedDate = globals.state.finished
      ? new Date(globals.state.datetimeFinished)
      : new Date();
    const elapsedMilliseconds = finishedDate.getTime() - startedDate.getTime();
    const clockString = millisecondsToClockString(elapsedMilliseconds);
    content += tooltipField(
      "fas fa-stopwatch",
      "Game Length",
      `<strong>${clockString}</strong>`,
    );
  }

  const sharedReplay = globals.state.replay.shared;
  if (showLengths && sharedReplay !== undefined) {
    const startedDate = new Date(sharedReplay.datetimeReplayStarted);
    const elapsedMilliseconds = Date.now() - startedDate.getTime();
    const clockString = millisecondsToClockString(elapsedMilliseconds);
    content += tooltipField(
      "fas fa-hourglass-half",
      "Shared Replay Length",
      `<strong>${clockString}</strong>`,
    );
  }

  content += tooltipField(
    "fas fa-rainbow",
    "Variant",
    `<strong>${globals.variant.name}</strong>`,
  );

  const { timeControl } = globals.options;
  if (timeControl !== undefined) {
    const timeBase = secondsToClockString(timeControl.baseSeconds);
    const timePerTurn = secondsToClockString(timeControl.perTurnSeconds);
    content += tooltipItem(
      OptionIcons.Timed,
      `Timed: ${timeBase} + ${timePerTurn}`,
    );
  }

  if (globals.options.speedrun) {
    content += tooltipItem(OptionIcons.Speedrun, "Speedrun");
  }

  if (globals.options.deckPlays) {
    content += tooltipItem(OptionIcons.DeckPlays, "Bottom-Deck Blind Plays");
  }

  if (globals.options.emptyClues) {
    content += tooltipItem(OptionIcons.EmptyClues, "Empty Clues");
  }

  if (globals.options.oneExtraCard) {
    content += tooltipItem(OptionIcons.OneExtraCard, "One Extra Card");
  }

  if (globals.options.oneLessCard) {
    content += tooltipItem(OptionIcons.OneLessCard, "One Less Card");
  }

  if (globals.options.allOrNothing) {
    content += tooltipItem(OptionIcons.AllOrNothing, "All or Nothing");
  }

  if (globals.options.detrimentalCharacters) {
    content += tooltipItem(
      OptionIcons.DetrimentalCharacters,
      "Detrimental Characters",
    );
  }

  content += "</ul>";

  return content;
}

function tooltipItem(iconClass: string, html: string) {
  return `<li><span class="game-tooltips-icon"><i class="${iconClass}"></i></span>${html}</li>`;
}

function tooltipField(iconClass: string, label: string, valueHtml: string) {
  return tooltipItem(iconClass, `${label}: &nbsp;${valueHtml}`);
}
