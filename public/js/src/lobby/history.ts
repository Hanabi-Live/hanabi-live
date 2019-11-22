/*
    The screens that show past games and other scores
*/

// Imports
import { VARIANTS } from '../constants';
import globals from '../globals';
import * as nav from './nav';

export const init = () => {
    $('#lobby-history-show-more').on('click', () => {
        globals.historyClicked = true;
        globals.conn.send('historyGet', {
            offset: Object.keys(globals.historyList).length,
            amount: 10,
        });
    });
};

export const show = () => {
    globals.currentScreen = 'history';
    $('#lobby-history').show();
    $('#lobby-top-half').hide();
    $('#lobby-separator').hide();
    $('#lobby-bottom-half').hide();
    nav.show('history');
    draw();
};

export const hide = () => {
    globals.currentScreen = 'lobby';
    $('#lobby-history').hide();
    $('#lobby-history-details').hide();
    $('#lobby-top-half').show();
    $('#lobby-separator').show();
    $('#lobby-bottom-half').show();
    nav.show('games');
};

export const draw = () => {
    const tbody = $('#lobby-history-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    // JavaScript keys come as strings, so we need to convert them to integers
    const ids = Object.keys(globals.historyList).map((i) => parseInt(i, 10));

    // Handle if the user has no history
    if (ids.length === 0) {
        $('#lobby-history-no').show();
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
        const gameData = globals.historyList[ids[i]];
        const variant = VARIANTS.get(gameData.variant);
        if (!variant) {
            throw new Error(`Failed to get the "${gameData.variant}" variant.`);
        }
        const { maxScore } = variant;

        const row = $('<tr>');

        // Column 1 - Game ID
        $('<td>').html(`#${ids[i]}`).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(gameData.numPlayers).appendTo(row);

        // Column 3 - Score
        $('<td>').html(`${gameData.score}/${maxScore}`).appendTo(row);

        // Column 4 - Variant
        $('<td>').html(gameData.variant).appendTo(row);

        // Column 5 - Other Players
        $('<td>').html(gameData.otherPlayerNames).appendTo(row);

        // Column 6 - Date Played
        const datePlayed = dateTimeFormatter.format(new Date(gameData.datetime));
        $('<td>').html(datePlayed).appendTo(row);

        // Column 7 - Watch Replay
        const watchReplayButton = makeReplayButton(ids[i], 'solo');
        $('<td>').html((watchReplayButton as any)).appendTo(row);

        // Column 8 - Share Replay
        const shareReplayButton = makeReplayButton(ids[i], 'shared');
        $('<td>').html((shareReplayButton as any)).appendTo(row);

        // Column 9 - Other Scores
        const otherScoresButton = makeHistoryDetailsButton(ids[i], gameData.numSimilar);
        $('<td>').html((otherScoresButton as any)).appendTo(row);

        row.appendTo(tbody);
    }

    // Don't show the "Show More History" if we have 10 or less games played
    if (globals.totalGames <= 10) {
        $('#lobby-history-show-more').hide();
    } else {
        $('#lobby-history-show-more').show();
    }
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
        globals.conn.send('replayCreate', {
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

const makeHistoryDetailsButton = (id: number, gameCount: number) => {
    const button = $('<button>').attr('type', 'button').addClass('button fit margin0');
    button.html(`<i class="fas fa-chart-bar lobby-button-icon"></i>&nbsp; ${gameCount - 1}`);
    if (gameCount - 1 === 0) {
        button.addClass('disabled');
    }
    button.attr('id', `history-details-${id}`);

    button.on('click', () => {
        globals.conn.send('historyDetails', {
            gameID: id,
        });
        showDetails();
    });

    return button;
};

export const showDetails = () => {
    globals.currentScreen = 'historyDetails';
    $('#lobby-history').hide();
    $('#lobby-history-details').show();
    nav.show('history-details');

    // The server will send us messages to populate this array momentarily
    globals.historyDetailList = [];
};

export const hideDetails = () => {
    globals.currentScreen = 'history';
    $('#lobby-history').show();
    $('#lobby-history-details').hide();
    nav.show('history');
};

// This function is called once for each new history element received from the server
// The last message is not marked, so each iteration redraws all historyDetailList items
export const drawDetails = () => {
    const tbody = $('#lobby-history-details-table-tbody');

    if (!globals.historyDetailList.length) {
        tbody.text('Loading...');
        return;
    }

    // Clear all of the existing rows
    tbody.html('');

    // The game played by the user will also include its variant
    const variant = globals.historyDetailList
        .filter((g) => g.id in globals.historyList)
        .map((g) => globals.historyList[g.id].variant)
        .map((v) => VARIANTS.get(v))[0];

    // The game played by the user might not have been sent by the server yet
    if (variant === undefined) {
        // If not, the variant is not known yet, so defer drawing
        return;
    }

    // Add all of the games
    for (let i = 0; i < globals.historyDetailList.length; i++) {
        const gameData = globals.historyDetailList[i];

        const row = $('<tr>');

        // Column 1 - Game ID
        let id = `#${gameData.id}`;
        if (gameData.you) {
            id = `<strong>${id}</strong>`;
        }
        $('<td>').html(id).appendTo(row);

        // Column 2 - Score
        let score = `${gameData.score}/${variant.maxScore}`;
        if (gameData.you) {
            score = `<strong>${score}</strong>`;
        }
        $('<td>').html(score).appendTo(row);

        // Column 3 - Players
        let otherPlayers = gameData.otherPlayerNames;
        if (gameData.you) {
            otherPlayers = `<strong>${globals.username}, ${otherPlayers}</strong>`;
        }
        $('<td>').html(otherPlayers).appendTo(row);

        // Column 4 - Date Played
        let datePlayed = dateTimeFormatter.format(new Date(gameData.datetime));
        if (gameData.you) {
            datePlayed = `<strong>${datePlayed}</strong>`;
        }
        $('<td>').html(datePlayed).appendTo(row);

        // Column 5 - Watch Replay
        const watchReplayButton = makeReplayButton(gameData.id, 'solo');
        $('<td>').html((watchReplayButton as any)).appendTo(row);

        // Column 6 - Share Replay
        const shareReplayButton = makeReplayButton(gameData.id, 'shared');
        $('<td>').html((shareReplayButton as any)).appendTo(row);

        row.appendTo(tbody);
    }
};

const dateTimeFormatter = new Intl.DateTimeFormat(
    undefined,
    {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    },
);
