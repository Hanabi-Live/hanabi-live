/*
   The lobby area that shows all of the current tables
*/

// Imports
const globals = require('../globals');
const lobby = require('./main');
const misc = require('../misc');
const modals = require('../modals');

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
        // Set the background color of the row, depending on what kind of game it is
        let htmlClass;
        if (table.sharedReplay) {
            htmlClass = 'replay';
        } else if (table.running) {
            htmlClass = 'started';
        } else {
            htmlClass = 'unstarted';
        }
        const row = $(`<tr class="lobby-games-table-${htmlClass}">`);

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
            status = 'Reviewing';
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
            if (table.numPlayers >= 6) {
                button.addClass('disabled');
            }
            button.on('click', tableJoinButton(table));
        } else {
            button.html('<i class="fas fa-play lobby-button-icon"></i>');
            button.attr('id', `resume-${table.id}`);
            button.on('click', tableReattendButton(table));
        }
        $('<td>').html(button).appendTo(row);

        // Column 7 - Players
        $('<td>').html(table.players).appendTo(row);

        // Column 8 - Spectators
        $('<td>').html(table.spectators).appendTo(row);

        row.appendTo(tbody);
    }
};

const tableSpectateButton = table => () => {
    globals.conn.send('gameSpectate', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableJoinButton = table => () => {
    if (table.password) {
        modals.passwordShow(table.id);
        return;
    }

    globals.conn.send('gameJoin', {
        gameID: table.id,
    });
    lobby.tables.draw();
};

const tableReattendButton = table => () => {
    globals.conn.send('gameReattend', {
        gameID: table.id,
    });
    lobby.tables.draw();
};
