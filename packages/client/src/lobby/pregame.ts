// The lobby area that shows all of the players in the current unstarted game.

import type { PlayerIndex } from "@hanabi/data";
import { MAX_PLAYERS, MIN_PLAYERS, getVariant } from "@hanabi/data";
import type { Options } from "@hanabi/game";
import { assertNotNull, eRange, iRange } from "isaacscript-common-ts";
import { globals } from "../Globals";
import * as chat from "../chat";
import * as tooltips from "../tooltips";
import { OptionIcons } from "../types/OptionIcons";
import {
  getHTMLElement,
  setBrowserAddressBarPath,
  timerFormatter,
} from "../utils";
import * as nav from "./nav";
import { tablesDraw } from "./tablesDraw";
import { Screen } from "./types/Screen";
import * as usersDraw from "./usersDraw";

const lobbyChatText = getHTMLElement("#lobby-chat-text");
const lobbyChatPregameText = getHTMLElement("#lobby-chat-pregame-text");

export function show(): void {
  globals.currentScreen = Screen.PreGame;
  usersDraw.draw();

  // Replace the list of current games with a list of the current players.
  $("#lobby-pregame").show();
  $("#lobby-games").hide();
  // Fix online and chat boxes layout for small screens.
  $("#lobby-chat-container").addClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens.
  $("#lobby-toggle-show-tables").text("Game");
  $("#lobby-toggle-show-chat").addClass("hidden");
  $("#lobby-toggle-show-game-chat").removeClass("hidden");

  // Click the games button.
  $("#lobby-toggle-show-tables").trigger("click");

  // Add an extra chat box.
  $("#lobby-chat-container").removeClass("col-8");
  $("#lobby-chat-container").addClass("col-4");
  $("#lobby-chat-pregame-container").show();

  // Clear the pregame chat box of any previous content.
  $("#lobby-chat-pregame-text").html("");

  // Scroll to the bottom of both the lobby chat and the pregame chat. (Even if the lobby chat is
  // already at the bottom, it will change size and cause it to not be scrolled all the way down.)
  lobbyChatText.scrollTop = lobbyChatText.scrollHeight;
  lobbyChatPregameText.scrollTop = lobbyChatPregameText.scrollHeight;

  // Focus the pregame chat.
  $("#lobby-chat-pregame-input").trigger("focus");

  // The "Create Game" button in the nav was disabled after we clicked the "Create" button, so
  // re-enable it now that we have received a message back from the server.
  $("#nav-buttons-lobby-create-game").removeClass("disabled");

  // Adjust the top navigation bar.
  nav.show("pregame");
  toggleStartGameButton();

  // Set the browser address bar.
  setBrowserAddressBarPath(`/pre-game/${globals.tableID}`);
}

export function hide(): void {
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw();

  // Replace the list of current players with a list of the current games.
  $("#lobby-pregame").hide();
  $("#lobby-games").show();
  // Fix online and chat boxes layout for small screens.
  $("#lobby-chat-container").removeClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").removeClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens.
  $("#lobby-toggle-show-tables").text("Tables");
  $("#lobby-toggle-show-chat").removeClass("hidden");
  $("#lobby-toggle-show-game-chat").addClass("hidden");

  // Click the games button.
  $("#lobby-toggle-show-tables").trigger("click");

  // Remove the extra chat box.
  $("#lobby-chat-container").addClass("col-8");
  $("#lobby-chat-container").removeClass("col-4");
  $("#lobby-chat-pregame-container").hide();

  // Clear the typing list.
  globals.peopleTyping = [];
  chat.updatePeopleTyping();

  // Adjust the navigation bar.
  nav.show("lobby");

  // Remove delegate handlers
  $("#lobby-chat-pregame-text").off();

  // Set the browser address bar.
  setBrowserAddressBarPath("/lobby");
}

export function draw(): void {
  assertNotNull(
    globals.game,
    'Attempted to draw the pre-game screen without having first received a "game" message from the server.',
  );

  // Update the information on the left-hand side of the screen.
  $("#lobby-pregame-name").text(globals.game.name);
  $("#lobby-pregame-variant").text(globals.game.options.variantName);
  $("#lobby-pregame-seats").text(
    `${globals.game.players.length.toString()} / ${globals.game.maxPlayers.toString()}`,
  );

  drawOptions();

  // Draw the player boxes.
  for (const i of eRange(MAX_PLAYERS)) {
    const playerIndex = i as PlayerIndex;
    drawPlayerBox(playerIndex);
  }

  toggleStartGameButton();
}

function drawOptions() {
  if (globals.game === null) {
    return;
  }

  // Start to create the HTML that will appear under the "Options:" text. Note that the tooltips
  // must be created inline; if they are created statically in "main.tmpl", then they will fail to
  // initialize properly on the second viewing.
  let html = "";

  if (globals.game.passwordProtected) {
    html += '<li><i id="lobby-pregame-options-password" class="fas fa-key" ';
    html += 'data-tooltip-content="#pregame-tooltip-password"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-password" class="lobby-pregame-tooltip-icon">
          This is a password-protected game.
        </div>
      </div>
    `;
  }

  html += getOptionIcons(globals.game.options, "lobby-pregame", 0);

  // Set the HTML
  const optionsTitleDiv = $("#lobby-pregame-options-title");
  const optionsText = html === "" ? "" : "Options:";
  optionsTitleDiv.text(optionsText);
  const optionsDiv = $("#lobby-pregame-options");
  optionsDiv.html(html);

  // Initialize the tooltips, if any. (This has to be done after adding the HTML to the page.)

  if (globals.game.passwordProtected) {
    tooltips.create("#lobby-pregame-options-password");
  }

  initializeOptionTooltips(globals.game.options, "lobby-pregame", 0);
}

export function getOptionIcons(
  options: Options,
  idPrefix: string,
  rowId: number,
): string {
  let html = "";

  if (options.timed) {
    html += `<li><i id="${idPrefix}-options-timer-${rowId}" class="${OptionIcons.TIMED}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-timer-${rowId}"></i>&nbsp; (`;
    html += timerFormatter(options.timeBase);
    html += " + ";
    html += timerFormatter(options.timePerTurn);
    html += ")</li>";
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-timer-${rowId}" class="${idPrefix}-tooltip-icon">
          This is a <strong>Timed Game</strong>. The base time is <strong>${timerFormatter(
            options.timeBase,
          )} minute(s)</strong> plus <strong>${
            options.timePerTurn
          } second(s)</strong> per turn.
        </div>
      </div>
    `;
  }

  if (options.speedrun) {
    html += `<li><i id="${idPrefix}-options-speedrun-${rowId}" class="${OptionIcons.SPEEDRUN}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-speedrun-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-speedrun-${rowId}" class="${idPrefix}-tooltip-icon">
          This is a <strong>Speedrun</strong>.
        </div>
      </div>
    `;
  }

  if (options.cardCycle) {
    html += `<li><i id="${idPrefix}-options-card-cycle-${rowId}" class="${OptionIcons.CARD_CYCLE}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-card-cycle-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-card-cycle-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>Card Cycling</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.deckPlays) {
    html += `<li><i id="${idPrefix}-options-deck-plays-${rowId}" class="${OptionIcons.DECK_PLAYS}" `;
    html += 'style="position: relative; left: 0.2em;" ';
    html += `data-tooltip-content="#${idPrefix}-tooltip-deck-plays-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-deck-plays-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>Bottom-Deck Blind-Plays</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.emptyClues) {
    html += `<li><i id="${idPrefix}-options-empty-clues-${rowId}" class="${OptionIcons.EMPTY_CLUES}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-empty-clues-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-empty-clues-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>Empty Clues</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.oneExtraCard) {
    html += `<li><i id="${idPrefix}-options-one-extra-card-${rowId}" class="${OptionIcons.ONE_EXTRA_CARD}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-one-extra-card-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-one-extra-card-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>One Extra Card</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.oneLessCard) {
    html += `<li><i id="${idPrefix}-options-one-less-card-${rowId}" class="${OptionIcons.ONE_LESS_CARD}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-one-less-card-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-one-less-card-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>One Less Card</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.allOrNothing) {
    html += `<li><i id="${idPrefix}-options-all-or-nothing-${rowId}" class="${OptionIcons.ALL_OR_NOTHING}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-all-or-nothing-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-all-or-nothing-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>All or Nothing</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (options.detrimentalCharacters) {
    html += `<li><i id="${idPrefix}-options-characters-${rowId}" class="${OptionIcons.DETRIMENTAL_CHARACTERS}" `;
    html += `data-tooltip-content="#${idPrefix}-tooltip-characters-${rowId}"></i></li>`;
    html += `
      <div class="hidden">
        <div id="${idPrefix}-tooltip-characters-${rowId}" class="${idPrefix}-tooltip-icon">
          The <strong>Detrimental Characters</strong> option is enabled.
        </div>
      </div>
    `;
  }
  return html;
}

export function initializeOptionTooltips(
  options: Options,
  idPrefix: string,
  rowId: number,
): void {
  if (options.timed) {
    tooltips.create(`#${idPrefix}-options-timer-${rowId}`);
  }
  if (options.speedrun) {
    tooltips.create(`#${idPrefix}-options-speedrun-${rowId}`);
  }
  if (options.cardCycle) {
    tooltips.create(`#${idPrefix}-options-card-cycle-${rowId}`);
  }
  if (options.deckPlays) {
    tooltips.create(`#${idPrefix}-options-deck-plays-${rowId}`);
  }
  if (options.emptyClues) {
    tooltips.create(`#${idPrefix}-options-empty-clues-${rowId}`);
  }
  if (options.oneExtraCard) {
    tooltips.create(`#${idPrefix}-options-one-extra-card-${rowId}`);
  }
  if (options.oneLessCard) {
    tooltips.create(`#${idPrefix}-options-one-less-card-${rowId}`);
  }
  if (options.allOrNothing) {
    tooltips.create(`#${idPrefix}-options-all-or-nothing-${rowId}`);
  }
  if (options.detrimentalCharacters) {
    tooltips.create(`#${idPrefix}-options-characters-${rowId}`);
  }
}

function drawPlayerBox(playerIndex: PlayerIndex) {
  if (globals.game === null) {
    return;
  }

  const numPlayers = globals.game.players.length; // The "numPlayers" in the options is not set yet.
  const div = $(`#lobby-pregame-player-${playerIndex + 1}`);

  div.html("");

  const player = globals.game.players[playerIndex];
  if (player === undefined) {
    div.hide();
    return;
  }

  div.show();

  const span = getNameSpan(player.name);
  if (isSpectator()) {
    span.addClass("shadow").on("click", (event) => {
      event.stopPropagation();
      reattend(playerIndex);
    });
  }
  const strong = $("<strong>");
  strong.append(span);
  const p = $("<p>").addClass("margin0 padding0p5").append(strong);
  div.append(p);

  // Calculate some stats
  const variantStats = player.stats.variant;
  // Round it to 1 decimal place.
  const averageScore = Math.round(variantStats.averageScore * 10) / 10;
  const averageScoreString = averageScore === 0 ? "-" : averageScore.toString();
  let strikeoutRateString: string;
  if (variantStats.numGames > 0) {
    let strikeoutRate =
      (variantStats.numStrikeouts / variantStats.numGames) * 100;
    strikeoutRate = Math.round(strikeoutRate * 10) / 10; // (round it to 1 decimal places)
    strikeoutRateString = `${strikeoutRate}%`;
  } else {
    strikeoutRateString = "-";
  }

  let html = `
    <div class="row">
      <div class="col-10">
        Total games:
      </div>
      <div class="col-2 align-right padding0">
        ${player.stats.numGames}
      </div>
    </div>
    <div class="row">
      <div class="col-10">
        ...of this variant:
      </div>
      <div class="col-2 align-right padding0">
        ${variantStats.numGames - variantStats.numStrikeouts}
      </div>
    </div>
    <div class="row">
      <div class="col-10">
        Average score:
      </div>
      <div class="col-2 align-right padding0">
        ${averageScoreString}
      </div>
    </div>
    <div class="row">
      <div class="col-10">
        Strikeout rate:
      </div>
      <div class="col-2 align-right padding0">
        ${strikeoutRateString}
      </div>
    </div>
  `;
  if (numPlayers > 1) {
    html += `
      <div class="row">
        <div class="col-10">
          ${numPlayers}-player best score:
        </div>
        <div class="col-2 align-right padding0">
          ${variantStats.bestScores[numPlayers - 2]!.score}
        </div>
      </div>
    `;
  }
  html += `
    <div class="row">
      <div class="col-10">
        ${numPlayers === 1 ? "B" : "Other b"}est scores:
      </div>
      <div class="col-2 align-right padding0">
        <i id="lobby-pregame-player-${
          playerIndex + 1
        }-scores-icon" class="fas fa-chart-area green" data-tooltip-content="#lobby-pregame-player-${
          playerIndex + 1
        }-tooltip"></i>
      </div>
    </div>
    <div class="hidden">
      <div id="lobby-pregame-player-${
        playerIndex + 1
      }-tooltip" class="lobby-pregame-tooltip">
  `;
  const variant = getVariant(globals.game.options.variantName);
  const { maxScore } = variant;
  for (const bestScorePlayer of iRange(MIN_PLAYERS, MAX_PLAYERS)) {
    const bestScoreObject = variantStats.bestScores[bestScorePlayer - 2];
    if (bestScoreObject === undefined) {
      continue;
    }
    const { score, modifier } = bestScoreObject;

    html += '<div class="row">';
    html += `<div class="col-6">${bestScorePlayer}-player:</div>`;
    html += '<div class="col-6">';
    if (score === maxScore) {
      html += "<strong>";
    }
    html += ` ${score} / ${maxScore}`;
    if (score === maxScore) {
      html += "</strong> &nbsp; ";
      html +=
        modifier === 0
          ? '<i class="fas fa-check score-modifier green"></i>'
          : '<i class="fas fa-times score-modifier red"></i>';
    }
    html += "</div></div>";
  }
  html += `
      </div>
    </div>
  `;
  if (!player.present) {
    html += '<p class="lobby-pregame-player-away"><strong>AWAY</strong></p>';
  }

  div.append($(html));

  // Initialize the tooltip
  tooltips.create(`#lobby-pregame-player-${playerIndex + 1}-scores-icon`);
}

function getNameSpan(name: string) {
  const span = $("<span>").html(name);
  if (name === globals.username) {
    span.addClass("name-me");
  } else if (globals.friends.includes(name)) {
    span.addClass("friend");
  }
  return span;
}

function isSpectator() {
  for (const loopPlayer of globals.game!.players) {
    if (loopPlayer.name === globals.username) {
      return false;
    }
  }
  return true;
}

export function drawSpectators(tableID: number): void {
  if (globals.game === null) {
    return;
  }

  const list = $("#lobby-pregame-spectators");
  list.empty();
  const table = globals.tableMap.get(tableID);
  if (table === undefined) {
    return;
  }

  for (const spectator of table.spectators) {
    const nameSpan = getNameSpan(spectator.name);
    const item = $("<li>").html(`&bull; ${nameSpan.prop("outerHTML")}`);
    if (spectator.shadowingPlayerIndex !== -1) {
      const shadowingPlayer = table.players[spectator.shadowingPlayerIndex];
      if (spectator.name === globals.username) {
        if (
          spectator.shadowingPlayerIndex >= table.players.length || // Shadow index is out of range
          spectator.shadowingPlayerIndex < -1 || // Shadow index is out of range
          (spectator.shadowingPlayerName !== undefined &&
            spectator.shadowingPlayerName !== "" &&
            spectator.shadowingPlayerName !== shadowingPlayer) // The player we where going to shadow, has left.
        ) {
          spectator.shadowingPlayerName = "";
          reattend(-1);
          return;
        }
        $(`#lobby-pregame-player-${spectator.shadowingPlayerIndex + 1} .shadow`)
          .removeClass("shadow")
          .addClass("unShadow")
          .on("click", (event) => {
            event.stopPropagation();
            reattend(-1);
          })
          .append(" 🕵️");
      }
      spectator.shadowingPlayerName = shadowingPlayer!;
      item.html(
        `${item.html()} (🕵️ <em>${spectator.shadowingPlayerName}</em>)`,
      );
    }
    list.append(item);
  }
}

export function toggleStartGameButton(): void {
  // Enable or disable the "Start Game" button. "Start Game" enabled if game owner and enough
  // players.
  $("#nav-buttons-pregame-start").addClass("disabled");

  if (globals.game === null) {
    return;
  }

  if (
    globals.game.owner === globals.userID &&
    globals.game.players.length >= MIN_PLAYERS &&
    globals.game.players.length <= MAX_PLAYERS &&
    // If this field is not equal to null it means that we are waiting a short time to re-enable the
    // button after a player joined.
    globals.enableStartGameButtonTimeout === null
  ) {
    $("#nav-buttons-pregame-start").removeClass("disabled");
  }

  if (globals.game.owner === globals.userID) {
    $("#nav-buttons-pregame-change-variant").removeClass("disabled");
  } else {
    $("#nav-buttons-pregame-change-variant").addClass("disabled");
  }
}

function reattend(shadowingPlayerIndex: PlayerIndex | -1) {
  setTimeout(() => {
    globals.conn!.send("tableUnattend", {
      tableID: globals.tableID,
    });
    globals.conn!.send("tableSpectate", {
      tableID: globals.tableID,
      shadowingPlayerIndex,
    });
  }, 0);
}
