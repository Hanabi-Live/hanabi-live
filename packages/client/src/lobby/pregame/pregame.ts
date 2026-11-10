// The lobby area that shows all of the players in the current unstarted game.

import type { Options, PlayerIndex } from "@hanabi-live/game";
import { getVariant, MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { assertDefined, eRange, iRange } from "complete-common";
import { globals } from "../../Globals";
import * as chat from "../../chat";
import { H_GROUP_LEVEL_URL_PREFIX, PATH } from "../../constants";
import { store } from "../../store";
import * as tooltips from "../../tooltips";
import {
  escapeHtml,
  getHTMLInputElement,
  setBrowserAddressBarPath,
} from "../../utils";
import { scrollLobbyChatToBottom } from "../chat/LobbyChat";
import * as lobbyPage from "../lobbyPage";
import * as nav from "../nav";
import { getOptionDescriptions } from "../optionDescriptions";
import { Screen } from "../types/Screen";
import { PREGAME_CHAT_INPUT_ID } from "./PregameChat";
import { pregameChatCleared, typingCleared } from "./pregameSlice";

/** What a player's statistics show for a player count that they have not played. */
const NO_SCORE = "&ndash;";

/** Removes the tooltips of the H-Group level badges, which are redrawn with the player boxes. */
const removeBadgeTooltips: Array<() => void> = [];

export function show(): void {
  lobbyPage.hide();
  globals.currentScreen = Screen.PreGame;

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
  store.dispatch(pregameChatCleared());

  // Scroll to the bottom of the lobby chat. (Even if it is already at the bottom, it will change
  // size and cause it to not be scrolled all the way down.)
  scrollLobbyChatToBottom();

  // Focus the pregame chat.
  getHTMLInputElement(`#${PREGAME_CHAT_INPUT_ID}`).focus();

  // The "Create Game" button in the nav was disabled after we clicked the "Create" button, so
  // re-enable it now that we have received a message back from the server.
  $("#nav-buttons-lobby-create-game").removeClass("disabled");

  // Adjust the top navigation bar.
  nav.show("pregame");
  toggleStartGameButton();
  toggleJoinSpectateButtons();

  // Set the browser address bar.
  setBrowserAddressBarPath(
    `${PATH.PRE_GAME}/${globals.tableID}`,
    undefined,
    globalThis.location.pathname === PATH.LOBBY ? "push" : "replace",
  );
}

export function hide(updateURL = true): void {
  lobbyPage.hide();
  globals.currentScreen = Screen.Lobby;

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
  store.dispatch(typingCleared());
  chat.updatePeopleTyping();

  // Adjust the navigation bar.
  nav.show("lobby");

  // Set the browser address bar.
  if (updateURL) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}

export function draw(): void {
  assertDefined(
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
  for (const removeTooltip of removeBadgeTooltips.splice(0)) {
    removeTooltip();
  }
  for (const i of eRange(MAX_PLAYERS)) {
    const playerIndex = i as PlayerIndex;
    drawPlayerBox(playerIndex);
  }

  toggleStartGameButton();
  toggleJoinSpectateButtons();
}

function drawOptions() {
  if (globals.game === undefined) {
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

  html += getOptionIcons(globals.game.options);

  // Set the HTML. Hide the whole section when there are no options so that it does not leave an
  // empty gap.
  $("#lobby-pregame-options-container").toggle(html !== "");
  const optionsDiv = $("#lobby-pregame-options");
  optionsDiv.html(html);

  // Initialize the tooltips, if any. (This has to be done after adding the HTML to the page.)

  if (globals.game.passwordProtected) {
    tooltips.create("#lobby-pregame-options-password");
  }

  initializeOptionTooltips(globals.game.options);
}

function getOptionIcons(options: Options): string {
  let html = "";
  for (const { name, icon, label, tooltip } of getOptionDescriptions(options)) {
    const labelClass = label === undefined ? "" : " icon-label";
    html += `<li><i id="lobby-pregame-options-${name}" class="${icon}${labelClass}" `;
    html += `data-tooltip-content="#lobby-pregame-tooltip-${name}"></i>${label ?? ""}</li>`;
    html += `
      <div class="hidden">
        <div id="lobby-pregame-tooltip-${name}" class="lobby-pregame-tooltip-icon">${tooltip}</div>
      </div>
    `;
  }
  return html;
}

function initializeOptionTooltips(options: Options) {
  for (const { name } of getOptionDescriptions(options)) {
    tooltips.create(`#lobby-pregame-options-${name}`);
  }
}

function drawPlayerBox(playerIndex: PlayerIndex) {
  if (globals.game === undefined) {
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

  const span = getNameSpan(player.username);
  if (isSpectator()) {
    span.addClass("shadow").on("click", (event) => {
      event.stopPropagation();
      reattend(playerIndex);
    });
  }
  const strong = $("<strong>");
  strong.append(span);
  const p = $("<p>").addClass("margin0 padding0p5").append(strong);
  const hGroupLevelBadge = getHGroupLevelBadge(player.username);
  if (hGroupLevelBadge !== undefined) {
    p.append(hGroupLevelBadge);
  }
  div.append(p);

  const variantStats = player.stats.variant;

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
        ${variantStats.numGames}
      </div>
    </div>
  `;
  if (numPlayers >= MIN_PLAYERS) {
    html += `
      <div class="row">
        <div class="col-10">
          ${numPlayers}-player best score:
        </div>
        <div class="col-2 align-right padding0">
          ${variantStats.bestScores[numPlayers - MIN_PLAYERS]!.score ?? NO_SCORE}
        </div>
      </div>
    `;
  }
  html += `
    <div class="row">
      <div class="col-10">
        ${numPlayers < MIN_PLAYERS ? "B" : "Other b"}est scores:
      </div>
      <div class="col-2 align-right padding0">
        <i id="lobby-pregame-player-${
          playerIndex + 1
        }-scores-icon" class="fas fa-chart-bar green" data-tooltip-content="#lobby-pregame-player-${
          playerIndex + 1
        }-tooltip"></i>
      </div>
    </div>
    <div class="hidden">
      <div id="lobby-pregame-player-${
        playerIndex + 1
      }-tooltip" class="lobby-pregame-tooltip">
  `;
  const { maxScore } = getVariant(globals.game.options.variantName);
  for (const bestScorePlayer of iRange(MIN_PLAYERS, MAX_PLAYERS)) {
    const bestScoreObject =
      variantStats.bestScores[bestScorePlayer - MIN_PLAYERS];
    if (bestScoreObject === undefined) {
      continue;
    }
    const { score, modifier } = bestScoreObject;

    html += '<div class="row">';
    html += `<div class="col-6">${bestScorePlayer}-player:</div>`;
    html += '<div class="col-6">';
    if (score === undefined) {
      html += ` ${NO_SCORE}</div></div>`;
      continue;
    }
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

/**
 * A link to the highest H-Group level that an online player chose, if they chose one and have the
 * H-Group features enabled.
 */
function getHGroupLevelBadge(name: string) {
  let hGroupLevel: number | undefined;
  for (const user of globals.userMap.values()) {
    if (user.username === name && user.hGroup) {
      ({ hGroupLevel } = user);
    }
  }
  if (hGroupLevel === undefined) {
    return undefined;
  }

  const level = hGroupLevel.toString();
  const badge = $("<a>")
    .addClass("h-group-level-badge")
    .attr({
      href: `${H_GROUP_LEVEL_URL_PREFIX}${level}`,
      target: "_blank",
      rel: "noopener noreferrer",
    })
    .text(`Level ${level}`);
  const removeTooltip = tooltips.attach(
    badge[0]!,
    `<span class="small-tooltip-text">This player wants to play with H-Group conventions up to level ${level}.</span>`,
  );
  removeBadgeTooltips.push(removeTooltip);
  return badge;
}

/** Redraws the pre-game screen when the H-Group level badge of a player at the table changes. */
export function userChanged(name: string): void {
  if (
    globals.currentScreen === Screen.PreGame
    && globals.game !== undefined
    && globals.game.players.some((player) => player.username === name)
  ) {
    draw();
  }
}

function getNameSpan(name: string) {
  const span = $("<span>").text(name);
  if (name === globals.username) {
    span.addClass("name-me");
  } else if (globals.friends.includes(name)) {
    span.addClass("friend");
  }
  return span;
}

function isSpectator() {
  for (const loopPlayer of globals.game!.players) {
    if (loopPlayer.username === globals.username) {
      return false;
    }
  }
  return true;
}

export function drawSpectators(tableID: number): void {
  const container = $("#lobby-pregame-spectators-container");
  const list = $("#lobby-pregame-spectators");
  list.empty();
  container.hide();
  if (globals.game === undefined) {
    return;
  }

  const table = globals.getTable(tableID);
  if (table === undefined) {
    return;
  }

  container.toggle(table.spectators.length > 0);

  for (const spectator of table.spectators) {
    const nameSpan = getNameSpan(spectator.username);
    const item = $("<li>").html(`&bull; ${nameSpan.prop("outerHTML")}`);
    if (spectator.shadowingPlayerIndex !== undefined) {
      if (spectator.username === globals.username) {
        $(`#lobby-pregame-player-${spectator.shadowingPlayerIndex + 1} .shadow`)
          .removeClass("shadow")
          .addClass("un-shadow")
          .on("click", (event) => {
            event.stopPropagation();
            reattend(undefined);
          })
          // eslint-disable-next-line complete/require-ascii
          .append(" 🕵️");
      }
      item.html(
        // eslint-disable-next-line complete/require-ascii
        `${item.html()} (🕵️ <em>${escapeHtml(table.playerNames[spectator.shadowingPlayerIndex] ?? "")}</em>)`,
      );
    }
    list.append(item);
  }
}

export function toggleStartGameButton(): void {
  // Enable or disable the "Start Game" button. "Start Game" enabled if game owner and enough
  // players.
  $("#nav-buttons-pregame-start").addClass("disabled");

  if (globals.game === undefined) {
    return;
  }

  if (
    globals.game.ownerID === globals.userID
    && globals.game.players.length >= MIN_PLAYERS
    && globals.game.players.length <= MAX_PLAYERS
    // If this field is not equal to undefined it means that we are waiting a short time to
    // re-enable the button after a player joined.
    && globals.enableStartGameButtonTimeout === undefined
  ) {
    $("#nav-buttons-pregame-start").removeClass("disabled");
  }
}

export function toggleJoinSpectateButtons(): void {
  if (globals.game === undefined) {
    return;
  }

  const joinGame = $("#nav-buttons-pregame-join");
  const joinSpectate = $("#nav-buttons-pregame-spectate");

  joinGame.addClass("disabled");
  joinSpectate.addClass("disabled");

  if (isSpectator()) {
    joinSpectate.hide();
    joinGame.show();

    if (globals.game.players.length < globals.game.maxPlayers) {
      joinGame.removeClass("disabled");
    }
  } else {
    joinGame.hide();
    joinSpectate.show();

    if (globals.game.players.length >= MIN_PLAYERS) {
      joinSpectate.removeClass("disabled");
    }
  }
}

function reattend(shadowingPlayerIndex: PlayerIndex | undefined) {
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
