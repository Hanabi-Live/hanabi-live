// The lobby area that shows all of the players in the current unstarted game

import * as chat from "../chat";
import { getVariant } from "../game/data/gameData";
import globals from "../globals";
import { setBrowserAddressBarPath, timerFormatter } from "../misc";
import * as tooltips from "../tooltips";
import * as nav from "./nav";
import tablesDraw from "./tablesDraw";
import Screen from "./types/Screen";
import * as usersDraw from "./usersDraw";

export function show(): void {
  globals.currentScreen = Screen.PreGame;
  usersDraw.draw();

  // Replace the list of current games with a list of the current players
  $("#lobby-pregame").show();
  $("#lobby-games").hide();
  // Fix online and chat boxes layout for small screens
  $("#lobby-chat-container").addClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").addClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens
  $("#lobby-toggle-show-tables").text("Game");
  $("#lobby-toggle-show-chat").addClass("hidden");
  $("#lobby-toggle-show-game-chat").removeClass("hidden");

  // Click the games button
  $("#lobby-toggle-show-tables").trigger("click");

  // Add an extra chat box
  $("#lobby-chat-container").removeClass("col-8");
  $("#lobby-chat-container").addClass("col-4");
  $("#lobby-chat-pregame-container").show();

  // Clear the pregame chat box of any previous content
  $("#lobby-chat-pregame-text").html("");

  // Scroll to the bottom of both the lobby chat and the pregame chat
  // (even if the lobby chat is already at the bottom, it will change size and cause it to not
  // be scrolled all the way down)
  const chat1 = document.getElementById("lobby-chat-text");
  if (chat1 !== null) {
    chat1.scrollTop = chat1.scrollHeight;
  } else {
    throw new Error('Failed to get the "lobby-chat-text" element.');
  }
  const chat2 = document.getElementById("lobby-chat-pregame-text");
  if (chat2 !== null) {
    chat2.scrollTop = chat2.scrollHeight;
  } else {
    throw new Error('Failed to get the "lobby-chat-pregame-text" element.');
  }

  // Focus the pregame chat
  $("#lobby-chat-pregame-input").focus();

  // The "Create Game" button in the nav was disabled after we clicked the "Create" button,
  // so re-enable it now that we have received a message back from the server
  $("#nav-buttons-lobby-create-game").removeClass("disabled");

  // Adjust the top navigation bar
  nav.show("pregame");
  enableStartGameButton();

  // Set the browser address bar
  setBrowserAddressBarPath(`/pre-game/${globals.tableID}`);
}

export function hide(): void {
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw();

  // Replace the list of current players with a list of the current games
  $("#lobby-pregame").hide();
  $("#lobby-games").show();
  // Fix online and chat boxes layout for small screens
  $("#lobby-chat-container").removeClass("pregame-chat-layout");
  $("#lobby-chat-pregame-container").removeClass("pregame-chat-layout");

  // Fix bottom nav buttons for small screens
  $("#lobby-toggle-show-tables").text("Tables");
  $("#lobby-toggle-show-chat").removeClass("hidden");
  $("#lobby-toggle-show-game-chat").addClass("hidden");

  // Click the games button
  $("#lobby-toggle-show-tables").trigger("click");

  // Remove the extra chat box
  $("#lobby-chat-container").addClass("col-8");
  $("#lobby-chat-container").removeClass("col-4");
  $("#lobby-chat-pregame-container").hide();

  // Clear the typing list
  globals.peopleTyping = [];
  chat.updatePeopleTyping();

  // Adjust the navigation bar
  nav.show("lobby");

  // Set the browser address bar
  setBrowserAddressBarPath("/lobby");
}

export function draw(): void {
  if (globals.game === null) {
    throw new Error(
      'Attempted to draw the pre-game screen without having first received a "game" message from the server.',
    );
  }

  // Update the information on the left-hand side of the screen
  $("#lobby-pregame-name").text(globals.game.name);
  $("#lobby-pregame-variant").text(globals.game.options.variantName);

  drawOptions();

  // Draw the player boxes
  for (let i = 0; i <= 5; i++) {
    drawPlayerBox(i);
  }

  // Disable Start game for 2 seconds
  enableStartGameButton(true);
  setTimeout(() => {
    enableStartGameButton();
  }, 2000);
}

function drawOptions() {
  if (globals.game === null) {
    return;
  }

  // Start to create the HTML that will appear under the "Options:" text
  // Note that the tooltips must be created inline; if they are created statically in "main.tmpl",
  // then they will fail to initialize properly on the second viewing
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

  if (globals.game.options.timed) {
    html += '<li><i id="lobby-pregame-options-timer" class="fas fa-clock" ';
    html += 'data-tooltip-content="#pregame-tooltip-timer"></i>&nbsp; (';
    html += timerFormatter(globals.game.options.timeBase);
    html += " + ";
    html += timerFormatter(globals.game.options.timePerTurn);
    html += ")</li>";
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-timer" class="lobby-pregame-tooltip-icon">
          This is a timed game.
        </div>
      </div>
    `;
  }

  if (globals.game.options.speedrun) {
    html +=
      '<li><i id="lobby-pregame-options-speedrun" class="fas fa-running" ';
    html += 'data-tooltip-content="#pregame-tooltip-speedrun"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-speedrun" class="lobby-pregame-tooltip-icon">
          This is a speedrun.
        </div>
      </div>
    `;
  }

  if (globals.game.options.cardCycle) {
    html +=
      '<li><i id="lobby-pregame-options-card-cycle" class="fas fa-sync-alt" ';
    html += 'data-tooltip-content="#pregame-tooltip-card-cycle"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-card-cycle" class="lobby-pregame-tooltip-icon">
          The <strong>Card Cycling</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.deckPlays) {
    html +=
      '<li><i id="lobby-pregame-options-deck-plays" class="fas fa-blind" ';
    html += 'style="position: relative; left: 0.2em;" ';
    html += 'data-tooltip-content="#pregame-tooltip-deck-plays"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-deck-plays" class="lobby-pregame-tooltip-icon">
          The <strong>Bottom-Deck Blind-Plays</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.emptyClues) {
    html +=
      '<li><i id="lobby-pregame-options-empty-clues" class="fas fa-expand" ';
    html += 'data-tooltip-content="#pregame-tooltip-empty-clues"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-empty-clues" class="lobby-pregame-tooltip-icon">
          The <strong>Empty Clues</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.oneExtraCard) {
    html +=
      '<li><i id="lobby-pregame-options-one-extra-card" class="fas fa-plus-circle" ';
    html += 'data-tooltip-content="#pregame-tooltip-one-extra-card"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-one-extra-card" class="lobby-pregame-tooltip-icon">
          The <strong>One Extra Card</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.oneLessCard) {
    html +=
      '<li><i id="lobby-pregame-options-one-less-card" class="fas fa-minus-circle" ';
    html += 'data-tooltip-content="#pregame-tooltip-one-less-card"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-one-less-card" class="lobby-pregame-tooltip-icon">
          The <strong>One Less Card</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.allOrNothing) {
    html +=
      '<li><i id="lobby-pregame-options-empty-clues" class="fas fa-layer-group" ';
    html += 'data-tooltip-content="#pregame-tooltip-all-or-nothing"></i></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-all-or-nothing" class="lobby-pregame-tooltip-icon">
          The <strong>All or Nothing</strong> option is enabled.
        </div>
      </div>
    `;
  }

  if (globals.game.options.detrimentalCharacters) {
    html += '<li><span id="lobby-pregame-options-characters" ';
    html += 'style="position: relative; right: 0.2em;" ';
    html += 'data-tooltip-content="#pregame-tooltip-characters">🤔</span></li>';
    html += `
      <div class="hidden">
        <div id="pregame-tooltip-characters" class="lobby-pregame-tooltip-icon">
          The <strong>Detrimental Characters</strong> option is enabled.
        </div>
      </div>
    `;
  }

  // Set the HTML
  const optionsTitleDiv = $("#lobby-pregame-options-title");
  const optionsText = html === "" ? "" : "Options:";
  optionsTitleDiv.text(optionsText);
  const optionsDiv = $("#lobby-pregame-options");
  optionsDiv.html(html);

  // Initialize the tooltips, if any
  // (this has to be done after adding the HTML to the page)
  if (globals.game.passwordProtected) {
    $("#lobby-pregame-options-password").tooltipster(tooltips.options);
  }
  if (globals.game.options.timed) {
    $("#lobby-pregame-options-timer").tooltipster(tooltips.options);
  }
  if (globals.game.options.speedrun) {
    $("#lobby-pregame-options-speedrun").tooltipster(tooltips.options);
  }
  if (globals.game.options.cardCycle) {
    $("#lobby-pregame-options-card-cycle").tooltipster(tooltips.options);
  }
  if (globals.game.options.deckPlays) {
    $("#lobby-pregame-options-deck-plays").tooltipster(tooltips.options);
  }
  if (globals.game.options.emptyClues) {
    $("#lobby-pregame-options-empty-clues").tooltipster(tooltips.options);
  }
  if (globals.game.options.oneExtraCard) {
    $("#lobby-pregame-options-one-extra-card").tooltipster(tooltips.options);
  }
  if (globals.game.options.oneLessCard) {
    $("#lobby-pregame-options-one-less-card").tooltipster(tooltips.options);
  }
  if (globals.game.options.allOrNothing) {
    $("#lobby-pregame-options-all-or-nothing").tooltipster(tooltips.options);
  }
  if (globals.game.options.detrimentalCharacters) {
    $("#lobby-pregame-options-characters").tooltipster(tooltips.options);
  }
}

function drawPlayerBox(i: number) {
  if (globals.game === null) {
    return;
  }

  const numPlayers = globals.game.players.length; // The "numPlayers" in the options is not set yet
  const div = $(`#lobby-pregame-player-${i + 1}`);

  const player = globals.game.players[i];
  if (player === undefined) {
    div.html("");
    div.hide();
    return;
  }

  div.show();

  let html = '<p class="margin0 padding0p5"><strong>';
  if (player.name === globals.username) {
    html += `<span class="name-me">${player.name}</span>`;
  } else if (globals.friends.includes(player.name)) {
    html += `<span class="friend">${player.name}</span>`;
  } else {
    html += player.name;
  }
  html += "</strong></p>";

  // Calculate some stats
  const variantStats = player.stats.variant;
  const averageScore = Math.round(variantStats.averageScore * 10) / 10;
  // (round it to 1 decimal place)
  let averageScoreString;
  if (averageScore === 0) {
    averageScoreString = "-";
  } else {
    averageScoreString = averageScore.toString();
  }
  let strikeoutRateString;
  if (variantStats.numGames > 0) {
    let strikeoutRate =
      (variantStats.numStrikeouts / variantStats.numGames) * 100;
    strikeoutRate = Math.round(strikeoutRate * 10) / 10; // (round it to 1 decimal places)
    strikeoutRateString = `${strikeoutRate}%`;
  } else {
    strikeoutRateString = "-";
  }

  html += `
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
          ${variantStats.bestScores[numPlayers - 2].score}
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
          i + 1
        }-scores-icon" class="fas fa-chart-area green" data-tooltip-content="#lobby-pregame-player-${
    i + 1
  }-tooltip"></i>
      </div>
    </div>
    <div class="hidden">
      <div id="lobby-pregame-player-${
        i + 1
      }-tooltip" class="lobby-pregame-tooltip">
  `;
  const variant = getVariant(globals.game.options.variantName);
  const { maxScore } = variant;
  for (let j = 2; j <= 6; j++) {
    html += '<div class="row">';
    html += `<div class="col-6">${j}-player:</div>`;
    const bestScoreObject = variantStats.bestScores[j - 2];
    const bestScore = bestScoreObject.score;
    const bestScoreMod = bestScoreObject.modifier;
    html += '<div class="col-6">';
    if (bestScore === maxScore) {
      html += "<strong>";
    }
    html += ` ${bestScore} / ${maxScore}`;
    if (bestScore === maxScore) {
      html += "</strong> &nbsp; ";
      if (bestScoreMod === 0) {
        html += '<i class="fas fa-check score-modifier green"></i>';
      } else {
        html += '<i class="fas fa-times score-modifier red"></i>';
      }
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

  div.html(html);

  // Initialize the tooltip
  $(`#lobby-pregame-player-${i + 1}-scores-icon`).tooltipster(tooltips.options);
}

export function enableStartGameButton(forAll = false): void {
  // Enable or disable the "Start Game" and "Change Variant" button.
  // "Start Game" enabled if game owner and enough players
  // "Change Variant" enabled if game owner
  //
  // If forAll is true, it is disabled for everyone.
  // This is used to delay game start when players enter / leave
  $("#nav-buttons-pregame-start").addClass("disabled");

  if (globals.game === null) {
    return;
  }

  if (
    globals.game.owner === globals.userID &&
    globals.game.players.length >= 2 &&
    globals.game.players.length <= 6 &&
    !forAll
  ) {
    $("#nav-buttons-pregame-start").removeClass("disabled");
  }
}
