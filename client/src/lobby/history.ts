// The screens that show past games and other scores

import { getVariant, VARIANTS } from '../game/data/gameData';
import Variant from '../game/types/Variant';
import globals from '../globals';
import { timerFormatter, dateTimeFormatter } from '../misc';
import Options from '../types/Options';
import * as nav from './nav';
import tablesDraw from './tablesDraw';
import GameHistory from './types/GameHistory';
import Screen from './types/Screen';
import * as usersDraw from './usersDraw';

// Constants
const tooltipOptions: JQueryTooltipster.ITooltipsterOptions = {
  animation: 'grow',
  contentAsHTML: true,
  delay: 0,
  theme: [
    'tooltipster-shadow',
    'tooltipster-shadow-big',
  ],
};

export const init = () => {
  $('#lobby-history-show-more').on('click', () => {
    globals.showMoreHistoryClicked = true;
    let command: string;
    let offset: number;
    if (globals.currentScreen === Screen.History) {
      command = 'historyGet';
      offset = Object.keys(globals.history).length;
    } else if (globals.currentScreen === Screen.HistoryFriends) {
      command = 'historyFriendsGet';
      offset = Object.keys(globals.historyFriends).length;
    } else {
      return;
    }
    globals.conn!.send(command, {
      offset,
      amount: 10,
    });
  });
};

export const show = () => {
  globals.currentScreen = Screen.History;

  $('#lobby-history').show();
  $('#lobby-top-half').hide();
  $('#lobby-separator').hide();
  $('#lobby-bottom-half').hide();

  // Update the nav
  nav.show('history');
  if (globals.friends.length === 0) {
    $('#nav-buttons-history-show-friends').hide();
  } else {
    $('#nav-buttons-history-show-friends').show();
  }

  // It might be hidden if we are returning from the "Show History of Friends" view
  $('#lobby-history-show-all').show();
  $('#lobby-history-show-all').attr('href', `/history/${globals.username}`);

  // Draw the history table
  draw(false);
};

export const hide = () => {
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw();

  $('#lobby-history').hide();
  $('#lobby-history-other-scores').hide();
  $('#lobby-top-half').show();
  $('#lobby-separator').show();
  $('#lobby-bottom-half').show();
  nav.show('games');
};

export const draw = (friends: boolean) => {
  const tbody = $('#lobby-history-table-tbody');

  // Clear all of the existing rows
  tbody.html('');

  // JavaScript keys come as strings, so we need to convert them to integers
  let ids: number[];
  if (!friends) {
    ids = Object.keys(globals.history).map((i) => parseInt(i, 10));
  } else {
    ids = Object.keys(globals.historyFriends).map((i) => parseInt(i, 10));
  }

  // Handle if the user has no history
  if (ids.length === 0) {
    $('#lobby-history-no').show();
    if (!friends) {
      $('#lobby-history-no').html('No game history. Play some games!');
    } else {
      $('#lobby-history-no').html('None of your friends have played any games yet.');
    }
    $('#lobby-history').addClass('align-center-v');
    $('#lobby-history-table-container').hide();
    return;
  }
  $('#lobby-history-no').hide();
  $('#lobby-history').removeClass('align-center-v');
  $('#lobby-history-table-container').show();

  // Sort the game IDs in reverse order (so that the most recent ones are near the top)
  // By default, JavaScript will sort them in alphabetical order,
  // so we must specify an ascending sort
  ids.sort((a, b) => a - b);
  ids.reverse();

  // Add all of the history
  for (let i = 0; i < ids.length; i++) {
    let gameData;
    if (!friends) {
      gameData = globals.history[ids[i]];
    } else {
      gameData = globals.historyFriends[ids[i]];
    }
    const variant = getVariant(gameData.options.variantName);
    const { maxScore } = variant;

    const row = $('<tr>');

    // Column 1 - Game ID
    $('<td>').html(`#${ids[i]}`).appendTo(row);

    // Column 2 - # of Players
    $('<td>').html(gameData.options.numPlayers.toString()).appendTo(row);

    // Column 3 - Score
    $('<td>').html(`${gameData.score}/${maxScore}`).appendTo(row);

    // Column 4 - Variant
    $('<td>').html(gameData.options.variantName).appendTo(row);

    // Column 5 - Options
    const options = makeOptions(i, gameData.options);
    $('<td>').html(options).appendTo(row);

    // Column 6 - Other Players / Players
    // (depending on if we are in the "Friends" view or not)
    const playerNames = gameData.playerNames.slice();
    let playerNamesString = playerNames.join(', ');
    if (!friends) {
      // Remove our name from the list of players
      const ourIndex = gameData.playerNames.indexOf(globals.username);
      playerNames.splice(ourIndex, 1);
      playerNamesString = playerNames.join(', ');
    }
    $('<td>').html(playerNamesString).appendTo(row);

    // Column 7 - Date Played
    const datePlayed = dateTimeFormatter.format(new Date(gameData.datetimeFinished));
    $('<td>').html(datePlayed).appendTo(row);

    // Column 8 - Watch Replay
    const watchReplayButton = makeReplayButton(ids[i], 'solo');
    $('<td>').html(watchReplayButton as any).appendTo(row);

    // Column 9 - Share Replay
    const shareReplayButton = makeReplayButton(ids[i], 'shared');
    $('<td>').html(shareReplayButton as any).appendTo(row);

    // Column 10 - Other Scores
    const otherScoresButton = makeOtherScoresButton(
      ids[i],
      gameData.seed,
      gameData.numGamesOnThisSeed,
    );
    $('<td>').html(otherScoresButton as any).appendTo(row);

    row.appendTo(tbody);

    // Initialize the tooltips, if any
    // (this has to be done after adding the HTML to the page)
    $(`#lobby-history-table-${i}-options`).tooltipster(tooltipOptions);
  }

  // Don't show the "Show More History" if we have 10 or less games played
  if (globals.totalGames <= 10) {
    $('#lobby-history-show-more').hide();
  } else {
    $('#lobby-history-show-more').show();
  }
};

const makeOptions = (i: number, options: Options) => {
  // Start to build the tooltip content HTML, if any
  let tooltipHTML = '';

  if (options.timed) {
    tooltipHTML += '<li><i class="fas fa-clock"></i>&nbsp; ';
    tooltipHTML += `Timed (${timerFormatter(options.timeBase)} + ${timerFormatter(options.timePerTurn)})`;
    tooltipHTML += '</li>';
  }

  if (options.speedrun) {
    tooltipHTML += '<li><i class="fas fa-running"></i>&nbsp; ';
    tooltipHTML += 'Speedrun</li>';
  }

  if (options.cardCycle) {
    tooltipHTML += '<li><i class="fas fa-sync-alt"></i>&nbsp; ';
    tooltipHTML += 'Card Cycling</li>';
  }

  if (options.deckPlays) {
    tooltipHTML += '<li><i class="fas fa-blind" style="position: relative; left: 0.2em;"></i>&nbsp; ';
    tooltipHTML += 'Bottom-Deck Blind-Plays</li>';
  }

  if (options.emptyClues) {
    tooltipHTML += '<li><i class="fas fa-expand"></i>&nbsp; ';
    tooltipHTML += 'Empty Clues</li>';
  }

  if (options.oneExtraCard) {
    tooltipHTML += '<li><i class="fas fa-plus-circle"></i>&nbsp; ';
    tooltipHTML += 'One Extra Card</li>';
  }

  if (options.oneLessCard) {
    tooltipHTML += '<li><i class="fas fa-minus-circle"></i>&nbsp; ';
    tooltipHTML += 'One Less Card</li>';
  }

  if (options.allOrNothing) {
    tooltipHTML += '<li><i class="fas fa-layer-group"></i>&nbsp; ';
    tooltipHTML += 'All or Nothing</li>';
  }

  if (options.detrimentalCharacters) {
    tooltipHTML += '<li><span style="position: relative; right: 0.2em;">🤔</span>';
    tooltipHTML += 'Detrimental Characters</li>';
  }

  if (tooltipHTML === '') {
    return '-';
  }

  let html = `<i id="lobby-history-table-${i}-options" class="fas fa-plus" `;
  html += `data-tooltip-content="#lobby-history-table-${i}-options-tooltip"></i>`;
  html += `
    <div class="hidden">
      <div id="lobby-history-table-${i}-options-tooltip">
        <ul class="lobby-history-table-tooltip-ul">
          ${tooltipHTML}
        </ul>
      </div>
    </div>
  `;

  return html;
};

const makeReplayButton = (id: number, visibility: string) => {
  const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
  let text;
  if (visibility === 'solo') {
    text = '<i class="fas fa-eye lobby-button-icon"></i>';
  } else if (visibility === 'shared') {
    text = '<i class="fas fa-users lobby-button-icon"></i>';
  } else {
    throw new Error('The "makeReplayButton()" function was provided an invalid visibility argument.');
  }
  button.html(text);
  button.addClass('history-table');
  button.addClass('enter-history-game');
  button.attr('id', `replay-${id}`);

  button.on('click', () => {
    globals.conn!.send('replayCreate', {
      source: 'id',
      gameID: id,
      visibility,
    });
    if (visibility === 'shared') {
      hide();
    }
  });

  return button;
};

const makeOtherScoresButton = (id: number, seed: string, gameCount: number) => {
  const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
  button.html(`<i class="fas fa-chart-bar lobby-button-icon"></i>&nbsp; ${gameCount - 1}`);
  button.attr('id', `history-other-scores-${id}`);
  if (gameCount - 1 === 0) {
    button.addClass('disabled');
  } else {
    button.on('click', () => {
      globals.conn!.send('historyGetSeed', {
        seed,
        friends: globals.currentScreen === Screen.HistoryFriends,
      });
      showOtherScores();
    });
  }

  return button;
};

export const showFriends = () => {
  globals.currentScreen = Screen.HistoryFriends;
  nav.show('history-friends');
  $('#lobby-history-table-players').html('Players');
  $('#lobby-history-show-all').hide();
  draw(true);
};

export const hideFriends = () => {
  globals.currentScreen = Screen.History;
  nav.show('history');
  $('#lobby-history-table-players').html('Other Players');
  $('#lobby-history-show-all').show();
  draw(false);
};

export const showOtherScores = () => {
  globals.currentScreen = Screen.HistoryOtherScores;
  $('#lobby-history').hide();
  $('#lobby-history-other-scores').show();
  nav.show('history-other-scores');
};

export const hideOtherScores = () => {
  globals.currentScreen = Screen.History;
  $('#lobby-history').show();
  $('#lobby-history-other-scores').hide();
  nav.show('history');
};

export const hideOtherScoresToFriends = () => {
  globals.currentScreen = Screen.HistoryFriends;
  $('#lobby-history').show();
  $('#lobby-history-other-scores').hide();
  nav.show('history-friends');
};

export const drawOtherScores = (games: GameHistory[], friends: boolean) => {
  // Define the functionality of the "Return to History" button
  console.log(friends);
  if (!friends) {
    $('#nav-buttons-history-other-scores-return').on('click', () => {
      hideOtherScores();
    });
  } else {
    $('#nav-buttons-history-other-scores-return').on('click', () => {
      hideOtherScoresToFriends();
    });
  }

  const tbody = $('#lobby-history-other-scores-table-tbody');

  // Clear all of the existing rows
  tbody.html('');

  // The game played by the user will also include its variant
  let variant: Variant | undefined;
  if (!friends) {
    variant = games
      .filter((g) => g.id in globals.history)
      .map((g) => globals.history[g.id].options.variantName)
      .map((v) => VARIANTS.get(v))[0];
  } else if (friends) {
    variant = games
      .filter((g) => g.id in globals.historyFriends)
      .map((g) => globals.historyFriends[g.id].options.variantName)
      .map((v) => VARIANTS.get(v))[0];
  } else {
    return;
  }
  if (variant === undefined) {
    return;
  }

  // Add all of the games
  for (const gameData of games) {
    // Find out if this game was played by us
    const ourGame = gameData.playerNames.includes(globals.username);

    const row = $('<tr>');

    // Column 1 - Game ID
    let id = `#${gameData.id}`;
    if (ourGame) {
      id = `<strong>${id}</strong>`;
    }
    $('<td>').html(id).appendTo(row);

    // Column 2 - Score
    let score = `${gameData.score}/${variant.maxScore}`;
    if (ourGame) {
      score = `<strong>${score}</strong>`;
    }
    $('<td>').html(score).appendTo(row);

    // Column 3 - Players
    let playerNamesString = gameData.playerNames.join(', ');
    if (ourGame) {
      playerNamesString = `<strong>${playerNamesString}</strong>`;
    }
    $('<td>').html(playerNamesString).appendTo(row);

    // Column 4 - Date Played
    let datePlayed = dateTimeFormatter.format(new Date(gameData.datetimeFinished));
    if (ourGame) {
      datePlayed = `<strong>${datePlayed}</strong>`;
    }
    $('<td>').html(datePlayed).appendTo(row);

    // Column 5 - Seed
    // Chop off the prefix
    const match = gameData.seed.match(/p\dv\d+s(\d+)/);
    let seed;
    if (match === null || match.length < 2) {
      seed = 'Unknown';
    } else {
      seed = match[1];
    }
    if (ourGame) {
      seed = `<strong>${seed}</strong>`;
    }
    $('<td>').html(seed).appendTo(row);

    // Column 6 - Watch Replay
    const watchReplayButton = makeReplayButton(gameData.id, 'solo');
    $('<td>').html(watchReplayButton as any).appendTo(row);

    // Column 7 - Share Replay
    const shareReplayButton = makeReplayButton(gameData.id, 'shared');
    $('<td>').html(shareReplayButton as any).appendTo(row);

    row.appendTo(tbody);
  }
};
