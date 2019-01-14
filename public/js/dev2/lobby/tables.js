/*
   The lobby area that shows all of the current tables
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');
const modals = require('../modals');
const lobby = require('./main');

exports.draw = () => {
    const tbody = $('#lobby-games-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    if (Object.keys(globals.tableList).length === 0) {
        $('#lobby-games-no').show();
        $('#lobby-games').addClass('align-center-v');
        $('#lobby-games-table-container').hide();
        return;
    }
    $('#lobby-games-no').hide();
    $('#lobby-games').removeClass('align-center-v');
    $('#lobby-games-table-container').show();

    // Add all of the games
    for (const table of Object.values(globals.tableList)) {
        const row = $('<tr>');

        // Column 1 - Name
        $('<td>').html(table.name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(table.numPlayers).appendTo(row);

        // Column 3 - Variant
        $('<td>').html(table.variant).appendTo(row);

        // Column 4 - Timed
        let timed = 'No';
        if (table.timed) {
            timed = `${misc.timerFormatter(table.baseTime)} + ${misc.timerFormatter(table.timePerTurn)}`;
        }
        $('<td>').html(timed).appendTo(row);

        // Column 5 - Status
        let status;
        if (table.sharedReplay) {
            status = 'Shared Replay';
        } else if (table.running && table.joined) {
            if (table.ourTurn) {
                status = '<strong>Your Turn</strong>';
            } else {
                status = 'Waiting';
            }
        } else if (table.running) {
            status = 'Running';
        } else {
            status = 'Not Started';
        }
        if (status !== 'Not Started') {
            status += ` (${table.progress}%)`;
        }
        $('<td>').html(status).appendTo(row);

        // Column 6 - Action
        const button = $('<button>').attr('type', 'button').addClass('button small margin0');
        if (table.sharedReplay || (!table.joined && table.running)) {
            button.html('<i class="fas fa-eye lobby-button-icon"></i>');
            button.attr('id', `spectate-${table.id}`);
            button.on('click', tableSpectateButton(table));
        } else if (!table.joined) {
            button.html('<i class="fas fa-sign-in-alt lobby-button-icon"></i>');
            button.attr('id', `join-${table.id}`);
            if (table.numPlayers >= 5) {
                button.addClass('disabled');
            }
            button.on('click', tableJoinButton(table));
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>');
            button.attr('id', `resume-${table.id}`);
            button.on('click', tableReattendButton(table));
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Abandon
        let button2 = 'n/a';
        if (table.joined && (table.owned || table.running) && !table.sharedReplay) {
            button2 = $('<button>').attr('type', 'button').addClass('button small margin0');
            button2.html('<i class="fas fa-times lobby-button-icon"></i>');
            button2.attr('id', `abandon-${table.id}`);
            button2.on('click', tableAbandonButton(table));
        }
        $('<td>').html(button2).appendTo(row);

        // Column 8 - Players
        $('<td>').html(table.players).appendTo(row);

        // Column 9 - Spectators
        $('<td>').html(table.spectators).appendTo(row);

        row.appendTo(tbody);
    }
};

const tableSpectateButton = table => (event) => {
    event.preventDefault();
    globals.gameID = table.id;
    globals.conn.send('gameSpectate', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableJoinButton = table => (event) => {
    event.preventDefault();

    if (table.password) {
        modals.passwordShow(table.id);
        return;
    }

    globals.gameID = table.id;
    globals.conn.send('gameJoin', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableReattendButton = table => (event) => {
    event.preventDefault();
    globals.gameID = table.id;
    globals.conn.send('gameReattend', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableAbandonButton = table => (event) => {
    event.preventDefault();

    if (table.running) {
        if (!window.confirm('Are you sure? This will cancel the game for all players.')) {
            return;
        }
    }

    globals.gameID = null;
    globals.conn.send('gameAbandon', {
        gameID: table.id,
    });
};
