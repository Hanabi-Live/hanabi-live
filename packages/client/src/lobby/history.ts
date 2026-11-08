// The screens that show past games and other scores.

import type { GameHistory } from "@hanabi-live/data";
import { compareGameHistory } from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import { getVariant, NO_VALUE, secondsToClockString } from "@hanabi-live/game";
import { DECK_PLAYS_ICON_STYLE, OptionIcons } from "../enums/OptionIcons";
import { globals } from "../Globals";
import * as tooltips from "../tooltips";
import { dateTimeFormatter, setBrowserAddressBarPath } from "../utils";
import * as nav from "./nav";
import { tablesDraw } from "./tablesDraw";
import { Screen } from "./types/Screen";

/** The number of games that each history request asks for. */
const HISTORY_PAGE_SIZE = 10;

export function init(): void {
  $("#lobby-history-show-more").on("click", () => {
    if (globals.currentScreen !== Screen.History) {
      return;
    }
    globals.conn!.send("historyGet", {
      offset: globals.history.size,
      amount: HISTORY_PAGE_SIZE,
    });
  });
}

export function show(requestHistory = true): void {
  globals.currentScreen = Screen.History;
  if (
    globalThis.location.pathname === "/lobby"
    && globalThis.location.hash === ""
  ) {
    setBrowserAddressBarPath("/lobby", "#history");
  }

  $("#lobby-history-other-scores").hide();
  $("#lobby-history").show();
  $("#lobby-top-half").addClass("hidden");
  $("#lobby-separator").addClass("hidden");
  $("#lobby-bottom-half").addClass("hidden");
  $("#lobby-small-screen-buttons").addClass("hidden");

  // Update the nav.
  nav.show("history");
  $("#lobby-history-show-all").attr("href", `/history/${globals.username}`);

  // Draw the history table.
  draw();
  if (requestHistory) {
    request();
  }
}

function request() {
  globals.conn!.send("historyGet", {
    offset: 0,
    amount: HISTORY_PAGE_SIZE,
  });
  if (globals.history.size === 0) {
    $("#lobby-history-no").text("Loading history...");
  }
}

export function hide(): void {
  globals.currentScreen = Screen.Lobby;
  setBrowserAddressBarPath("/lobby", undefined);
  tablesDraw();

  $("#lobby-history").hide();
  $("#lobby-history-other-scores").hide();
  $("#lobby-top-half").removeClass("hidden");
  $("#lobby-separator").removeClass("hidden");
  $("#lobby-bottom-half").removeClass("hidden");
  $("#lobby-small-screen-buttons").removeClass("hidden");
  nav.show("lobby");
}

export function draw(): void {
  const tbody = $("#lobby-history-table-tbody");

  // Clear all of the existing rows.
  tbody.html("");

  const games = [...globals.history.values()].toSorted(compareGameHistory);

  // Handle if the user has no history.
  if (games.length === 0) {
    $("#lobby-history-no").show();
    $("#lobby-history-no").html("No game history. Play some games!");
    $("#lobby-history").addClass("align-center-v");
    $("#lobby-history-table-container").hide();
    return;
  }
  $("#lobby-history-no").hide();
  $("#lobby-history").removeClass("align-center-v");
  $("#lobby-history-table-container").show();

  // Add all of the history.
  for (const [i, gameData] of games.entries()) {
    const { id } = gameData;
    const { maxScore } = getVariant(gameData.options.variantName);

    const row = $("<tr>");

    // Column 1 - Game ID.
    $("<td>").html(`#${id}`).appendTo(row);

    // Column 2 - # of Players.
    $("<td>").html(gameData.options.numPlayers.toString()).appendTo(row);

    // Column 3 - Score.
    $("<td>").html(`${gameData.score}/${maxScore}`).appendTo(row);

    // Column 4 - Variant.
    $("<td>").html(gameData.options.variantName).appendTo(row);

    // Column 5 - Options.
    const options = makeOptions(i, gameData.options, false);
    $("<td>").html(options.html).appendTo(row);

    // Column 6 - Other Players.
    const playerNamesString = gameData.playerNames
      .filter((name) => name !== globals.username)
      .join(", ");
    $("<td>").html(playerNamesString).appendTo(row);

    // Column 7 - Date Played.
    const datePlayed = dateTimeFormatter.format(
      new Date(gameData.datetimeFinished),
    );
    $("<td>").html(datePlayed).appendTo(row);

    // Column 8 - Watch Replay.
    const watchReplayButton = makeReplayButton(id, "solo");
    $("<td>").html(watchReplayButton[0]!).appendTo(row);

    // Column 9 - Share Replay.
    const shareReplayButton = makeReplayButton(id, "shared");
    $("<td>").html(shareReplayButton[0]!).appendTo(row);

    // Column 10 - Other Scores.
    const otherScoresButton = makeOtherScoresButton(
      id,
      gameData.seed,
      gameData.numGamesOnThisSeed,
    );
    $("<td>").html(otherScoresButton[0]!).appendTo(row);

    row.appendTo(tbody);

    // Initialize the tooltips, if any (this has to be done after adding the HTML to the page).
    if (options.tooltipSelector !== undefined) {
      tooltips.create(options.tooltipSelector);
    }
  }

  // Do not show the "Show More History" button if the first page holds every game.
  if (globals.totalGames !== null && globals.totalGames <= HISTORY_PAGE_SIZE) {
    $("#lobby-history-show-more").hide();
  } else {
    $("#lobby-history-show-more").show();
  }
}

function makeOtherScoresButton(id: number, seed: string, gameCount: number) {
  const button = $("<button>")
    .attr("type", "button")
    .addClass("button fit margin0");
  button.html(
    `<i class="fas fa-chart-bar lobby-button-icon"></i>&nbsp; ${gameCount - 1}`,
  );
  button.attr("id", `history-other-scores-${id}`);
  if (gameCount - 1 === 0) {
    button.addClass("disabled");
  } else {
    button.on("click", () => {
      globals.conn!.send("historyGetSeed", { seed });
      showOtherScores();
      setBrowserAddressBarPath(
        "/lobby",
        `#history-other-scores-${encodeURIComponent(seed)}`,
        "push",
      );
    });
  }

  return button;
}

export function showOtherScoresFromURL(seed: string): void {
  globals.conn!.send("historyGetSeed", { seed });
  showOtherScores();
}

function showOtherScores() {
  globals.currentScreen = Screen.HistoryOtherScores;
  $("#lobby-history").hide();
  $("#lobby-history-other-scores").show();
  nav.show("history-other-scores");
}

function hideOtherScores() {
  globals.currentScreen = Screen.History;
  setBrowserAddressBarPath("/lobby", "#history", "push");
  $("#lobby-history").show();
  $("#lobby-history-other-scores").hide();
  nav.show("history");
}

export function drawOtherScores(
  games: readonly GameHistory[],
  variantName: string,
  seed: string,
): void {
  if (globals.currentScreen !== Screen.HistoryOtherScores) {
    return;
  }

  // Define the functionality of the "Return to History" button.
  $("#nav-buttons-history-other-scores-return")
    .off("click")
    .on("click", hideOtherScores);

  // Set the link for the "View seed data" button.
  $("#nav-buttons-history-other-scores-view-all").attr("href", `/seed/${seed}`);

  const tbody = $("#lobby-history-other-scores-table-tbody");

  // Clear all of the existing rows.
  tbody.html("");

  // The game played by the user will also include its variant.
  const variant = getVariant(variantName);

  // Add all of the games for this particular seed.
  for (const [i, game] of games.entries()) {
    // Find out if this game was played by us.
    const ourGame = game.playerNames.includes(globals.username);

    const row = $("<tr>");

    // Column 1 - Game ID.
    let id = `#${game.id}`;
    if (ourGame) {
      id = `<strong>${id}</strong>`;
    }
    $("<td>").html(id).appendTo(row);

    // Column 2 - Score.
    let score = `${game.score}/${variant.maxScore}`;
    if (ourGame) {
      score = `<strong>${score}</strong>`;
    }
    $("<td>").html(score).appendTo(row);

    // Column 3 - Options.
    const options = makeOptions(i, game.options, true);
    $("<td>").html(options.html).appendTo(row);

    // Column 4 - Players.
    let playerNamesString = game.playerNames.join(", ");
    if (ourGame) {
      playerNamesString = `<strong>${playerNamesString}</strong>`;
    }
    $("<td>").html(playerNamesString).appendTo(row);

    // Column 5 - Date Played.
    let datePlayed = dateTimeFormatter.format(new Date(game.datetimeFinished));
    if (ourGame) {
      datePlayed = `<strong>${datePlayed}</strong>`;
    }
    $("<td>").html(datePlayed).appendTo(row);

    // Column 6 - Seed. Chop off the prefix.
    const match = /p\dv\d+s(\d+)/u.exec(game.seed);
    let seedNumberSuffix: string =
      match === null || match.length < 2 ? "Unknown" : match[1]!;
    if (ourGame) {
      seedNumberSuffix = `<strong>${seedNumberSuffix}</strong>`;
    }
    $("<td>").html(seedNumberSuffix).appendTo(row);

    // Column 7 - Watch Replay.
    const watchReplayButton = makeReplayButton(game.id, "solo");
    $("<td>").html(watchReplayButton[0]!).appendTo(row);

    // Column 8 - Share Replay.
    const shareReplayButton = makeReplayButton(game.id, "shared");
    $("<td>").html(shareReplayButton[0]!).appendTo(row);

    row.appendTo(tbody);

    // Initialize the tooltips, if any. (This has to be done after adding the HTML to the page.)
    if (options.tooltipSelector !== undefined) {
      tooltips.create(options.tooltipSelector);
    }
  }
}

// -----------
// Subroutines
// -----------

/** Returns the options cell, and the selector of its tooltip if the game has any options. */
function makeOptions(
  i: number,
  options: Options,
  otherScores: boolean,
): { html: string; tooltipSelector?: string } {
  // Start to build the tooltip content HTML, if any
  let tooltipHTML = "";
  const icons: string[] = [];

  if (options.timed) {
    icons.push(OptionIcons.Timed);
    tooltipHTML += `<li><i class="${OptionIcons.Timed}"></i>&nbsp; `;
    tooltipHTML += `Timed (${secondsToClockString(
      options.timeBase,
    )} + ${secondsToClockString(options.timePerTurn)})`;
    tooltipHTML += "</li>";
  }

  if (options.speedrun) {
    icons.push(OptionIcons.Speedrun);
    tooltipHTML += `<li><i class="${OptionIcons.Speedrun}"></i>&nbsp; `;
    tooltipHTML += "Speedrun</li>";
  }

  if (options.deckPlays) {
    icons.push(OptionIcons.DeckPlays);
    tooltipHTML += `<li><i class="${OptionIcons.DeckPlays}" style="${DECK_PLAYS_ICON_STYLE}"></i>&nbsp; `;
    tooltipHTML += "Bottom-Deck Blind-Plays</li>";
  }

  if (options.emptyClues) {
    icons.push(OptionIcons.EmptyClues);
    tooltipHTML += `<li><i class="${OptionIcons.EmptyClues}"></i>&nbsp; `;
    tooltipHTML += "Empty Clues</li>";
  }

  if (options.oneExtraCard) {
    icons.push(OptionIcons.OneExtraCard);
    tooltipHTML += `<li><i class="${OptionIcons.OneExtraCard}"></i>&nbsp; `;
    tooltipHTML += "One Extra Card</li>";
  }

  if (options.oneLessCard) {
    icons.push(OptionIcons.OneLessCard);
    tooltipHTML += `<li><i class="${OptionIcons.OneLessCard}"></i>&nbsp; `;
    tooltipHTML += "One Less Card</li>";
  }

  if (options.allOrNothing) {
    icons.push(OptionIcons.AllOrNothing);
    tooltipHTML += `<li><i class="${OptionIcons.AllOrNothing}"></i>&nbsp; `;
    tooltipHTML += "All or Nothing</li>";
  }

  if (options.detrimentalCharacters) {
    icons.push(OptionIcons.DetrimentalCharacters);
    tooltipHTML += `<li><i class="${OptionIcons.DetrimentalCharacters}"></i>&nbsp; `;
    tooltipHTML += "Detrimental Characters</li>";
  }

  if (tooltipHTML === "") {
    return { html: "[none]" };
  }

  let id = `lobby-history-table-${i}-options`;
  if (otherScores) {
    id += "-other-scores";
  }
  let html = `<div id="${id}" data-tooltip-content="#${id}-tooltip">`;
  html += iconsFromOptions(icons);
  html += "</div>";
  html += `
    <div class="hidden">
      <div id="${id}-tooltip">
        <ul class="lobby-history-table-tooltip-ul">
          ${tooltipHTML}
        </ul>
      </div>
    </div>
  `;

  return { html, tooltipSelector: `#${id}` };
}

/** Games with more options than this show an ellipsis, with the options listed in the tooltip. */
const MAX_OPTION_ICONS = 3;

function iconsFromOptions(icons: readonly string[]): string {
  if (icons.length === 0 || icons.length > MAX_OPTION_ICONS) {
    return '<i class="fas fa-ellipsis-h"></i>';
  }

  return icons.map((icon) => `<i class="${icon}"></i>`).join(" ");
}

function makeReplayButton(databaseID: number, visibility: "solo" | "shared") {
  const button = $("<button>")
    .attr("type", "button")
    .addClass("button fit margin0");

  let text: string;
  switch (visibility) {
    case "solo": {
      text = '<i class="fas fa-eye lobby-button-icon"></i>';
      break;
    }

    case "shared": {
      text = '<i class="fas fa-users lobby-button-icon"></i>';
      break;
    }
  }

  button.html(text);
  button.addClass("history-table");
  button.addClass("enter-history-game");
  button.attr("id", `replay-${databaseID}`);

  button.on("click", () => {
    globals.conn!.send("replayCreate", {
      source: "id",
      databaseID,
      visibility,
      shadowingPlayerIndex: NO_VALUE,
    });
    if (visibility === "shared") {
      hide();
    }
  });

  return button;
}
