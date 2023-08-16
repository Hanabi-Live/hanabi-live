// The screens that show past games and other scores.

import { getVariant } from "@hanabi/data";
import { globals } from "../globals";
import * as tooltips from "../tooltips";
import { OptionIcons } from "../types/OptionIcons";
import type { Options } from "../types/Options";
import { dateTimeFormatter, timerFormatter } from "../utils";
import * as nav from "./nav";
import { tablesDraw } from "./tablesDraw";
import type { GameHistory } from "./types/GameHistory";
import { Screen } from "./types/Screen";
import * as usersDraw from "./usersDraw";

export function init(): void {
  $("#lobby-history-show-more").on("click", () => {
    globals.showMoreHistoryClicked = true;
    let command: string;
    let offset: number;
    if (globals.currentScreen === Screen.History) {
      command = "historyGet";
      offset = Object.keys(globals.history).length;
    } else if (globals.currentScreen === Screen.HistoryFriends) {
      command = "historyFriendsGet";
      offset = Object.keys(globals.historyFriends).length;
    } else {
      return;
    }
    globals.conn!.send(command, {
      offset,
      amount: 10,
    });
  });
}

export function show(): void {
  globals.currentScreen = Screen.History;

  $("#lobby-history").show();
  $("#lobby-top-half").addClass("hidden");
  $("#lobby-separator").addClass("hidden");
  $("#lobby-bottom-half").addClass("hidden");
  $("#lobby-small-screen-buttons").addClass("hidden");

  // Update the nav.
  nav.show("history");
  if (globals.friends.length === 0) {
    $("#nav-buttons-history-show-friends").hide();
  } else {
    $("#nav-buttons-history-show-friends").show();
  }

  // It might be hidden if we are returning from the "Show History of Friends" view.
  $("#lobby-history-show-all").show();
  $("#lobby-history-show-all").attr("href", `/history/${globals.username}`);

  // Draw the history table.
  draw(false);
}

export function hide(): void {
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw();

  $("#lobby-history").hide();
  $("#lobby-history-other-scores").hide();
  $("#lobby-top-half").removeClass("hidden");
  $("#lobby-separator").removeClass("hidden");
  $("#lobby-bottom-half").removeClass("hidden");
  $("#lobby-small-screen-buttons").removeClass("hidden");
  nav.show("lobby");
}

export function draw(friends: boolean): void {
  const tbody = $("#lobby-history-table-tbody");

  // Clear all of the existing rows.
  tbody.html("");

  // JavaScript keys come as strings, so we need to convert them to integers.
  const ids = friends
    ? [...globals.historyFriends.keys()]
    : [...globals.history.keys()];

  // Handle if the user has no history.
  if (ids.length === 0) {
    $("#lobby-history-no").show();
    if (!friends) {
      $("#lobby-history-no").html("No game history. Play some games!");
    } else {
      $("#lobby-history-no").html(
        "None of your friends have played any games yet.",
      );
    }
    $("#lobby-history").addClass("align-center-v");
    $("#lobby-history-table-container").hide();
    return;
  }
  $("#lobby-history-no").hide();
  $("#lobby-history").removeClass("align-center-v");
  $("#lobby-history-table-container").show();

  // Sort the game IDs in reverse order (so that the most recent ones are near the top). By default,
  // JavaScript will sort them in alphabetical order, so we must specify an ascending sort.
  ids.sort((a, b) => a - b);
  ids.reverse();

  // Add all of the history.
  for (const [i, id] of ids.entries()) {
    const gameData = friends
      ? globals.historyFriends[id]!
      : globals.history[id]!;
    const variant = getVariant(gameData.options.variantName);
    const { maxScore } = variant;

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
    $("<td>").html(options).appendTo(row);

    // Column 6 - Other Players / Players (depending on if we are in the "Friends" view or not).
    const playerNames = [...gameData.playerNames];
    let playerNamesString = playerNames.join(", ");
    if (!friends) {
      // Remove our name from the list of players.
      const ourIndex = gameData.playerNames.indexOf(globals.username);
      playerNames.splice(ourIndex, 1);
      playerNamesString = playerNames.join(", ");
    }
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
    tooltips.create(`#lobby-history-table-${i}-options`);
  }

  // Don't show the "Show More History" if we have 10 or less games played.
  if (globals.totalGames <= 10) {
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
      globals.conn!.send("historyGetSeed", {
        seed,
        friends: globals.currentScreen === Screen.HistoryFriends,
      });
      showOtherScores();
    });
  }

  return button;
}

export function showFriends(): void {
  globals.currentScreen = Screen.HistoryFriends;
  nav.show("history-friends");
  $("#lobby-history-table-players").html("Players");
  $("#lobby-history-show-all").hide();
  draw(true);
}

export function hideFriends(): void {
  globals.currentScreen = Screen.History;
  nav.show("history");
  $("#lobby-history-table-players").html("Other Players");
  $("#lobby-history-show-all").show();
  draw(false);
}

function showOtherScores() {
  globals.currentScreen = Screen.HistoryOtherScores;
  $("#lobby-history").hide();
  $("#lobby-history-other-scores").show();
  nav.show("history-other-scores");
}

function hideOtherScores() {
  globals.currentScreen = Screen.History;
  $("#lobby-history").show();
  $("#lobby-history-other-scores").hide();
  nav.show("history");
}

function hideOtherScoresToFriends() {
  globals.currentScreen = Screen.HistoryFriends;
  $("#lobby-history").show();
  $("#lobby-history-other-scores").hide();
  nav.show("history-friends");
}

export function drawOtherScores(
  games: GameHistory[],
  variantName: string,
  friends: boolean,
  seed: string,
): void {
  if (globals.currentScreen !== Screen.HistoryOtherScores) {
    return;
  }

  // Define the functionality of the "Return to History" button.
  if (!friends) {
    $("#nav-buttons-history-other-scores-return").on("click", () => {
      hideOtherScores();
    });
  } else {
    $("#nav-buttons-history-other-scores-return").on("click", () => {
      hideOtherScoresToFriends();
    });
  }

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
    $("<td>").html(options).appendTo(row);

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
    const match = /p\dv\d+s(\d+)/.exec(game.seed);
    let seedNumberSuffix: string;
    seedNumberSuffix =
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
    tooltips.create(`#lobby-history-table-${i}-options-other-scores`);
  }
}

// -----------
// Subroutines
// -----------

function makeOptions(i: number, options: Options, otherScores: boolean) {
  // Start to build the tooltip content HTML, if any
  let tooltipHTML = "";
  const icons: string[] = [];

  if (options.timed) {
    icons.push(OptionIcons.TIMED);
    tooltipHTML += `<li><i class="${OptionIcons.TIMED}"></i>&nbsp; `;
    tooltipHTML += `Timed (${timerFormatter(
      options.timeBase,
    )} + ${timerFormatter(options.timePerTurn)})`;
    tooltipHTML += "</li>";
  }

  if (options.speedrun) {
    icons.push(OptionIcons.SPEEDRUN);
    tooltipHTML += `<li><i class="${OptionIcons.SPEEDRUN}"></i>&nbsp; `;
    tooltipHTML += "Speedrun</li>";
  }

  if (options.cardCycle) {
    icons.push(OptionIcons.CARD_CYCLE);
    tooltipHTML += `<li><i class="${OptionIcons.CARD_CYCLE}"></i>&nbsp; `;
    tooltipHTML += "Card Cycling</li>";
  }

  if (options.deckPlays) {
    icons.push(OptionIcons.DECK_PLAYS);
    tooltipHTML += `<li><i class="${OptionIcons.DECK_PLAYS}" style="position: relative; left: 0.2em;"></i>&nbsp; `;
    tooltipHTML += "Bottom-Deck Blind-Plays</li>";
  }

  if (options.emptyClues) {
    icons.push(OptionIcons.EMPTY_CLUES);
    tooltipHTML += `<li><i class="${OptionIcons.EMPTY_CLUES}"></i>&nbsp; `;
    tooltipHTML += "Empty Clues</li>";
  }

  if (options.oneExtraCard) {
    icons.push(OptionIcons.ONE_EXTRA_CARD);
    tooltipHTML += `<li><i class="${OptionIcons.ONE_EXTRA_CARD}"></i>&nbsp; `;
    tooltipHTML += "One Extra Card</li>";
  }

  if (options.oneLessCard) {
    icons.push(OptionIcons.ONE_LESS_CARD);
    tooltipHTML += `<li><i class="${OptionIcons.ONE_LESS_CARD}"></i>&nbsp; `;
    tooltipHTML += "One Less Card</li>";
  }

  if (options.allOrNothing) {
    icons.push(OptionIcons.ALL_OR_NOTHING);
    tooltipHTML += `<li><i class="${OptionIcons.ALL_OR_NOTHING}"></i>&nbsp; `;
    tooltipHTML += "All or Nothing</li>";
  }

  if (options.detrimentalCharacters) {
    icons.push(OptionIcons.DETRIMENTAL_CHARACTERS);
    tooltipHTML += `<li><i class="${OptionIcons.DETRIMENTAL_CHARACTERS}"></i>&nbsp; `;
    tooltipHTML += "Detrimental Characters</li>";
  }

  if (tooltipHTML === "") {
    return "[none]";
  }

  let id = `lobby-history-table-${i}-options`;
  if (otherScores) {
    id += "-other-scores";
  }
  let html = `<div id="${id}" data-tooltip-content="#${id}-tooltip">`;
  html += `${iconsFromOptions(icons)}`;
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

  return html;
}

function iconsFromOptions(icons: string[]): string {
  let answer = "";
  switch (icons.length) {
    case 1:
    case 2:
    case 3: {
      for (const icon of icons) {
        answer += `<i class="${icon}"></i> `;
      }

      return answer.trim();
    }

    default: {
      return '<i class="fas fa-ellipsis-h"></i>';
    }
  }
}

function makeReplayButton(databaseID: number, visibility: string) {
  const button = $("<button>")
    .attr("type", "button")
    .addClass("button fit margin0");
  let text: string;
  if (visibility === "solo") {
    text = '<i class="fas fa-eye lobby-button-icon"></i>';
  } else if (visibility === "shared") {
    text = '<i class="fas fa-users lobby-button-icon"></i>';
  } else {
    throw new Error(
      'The "makeReplayButton()" function was provided an invalid visibility argument.',
    );
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
      shadowingPlayerIndex: -1,
    });
    if (visibility === "shared") {
      hide();
    }
  });

  return button;
}
