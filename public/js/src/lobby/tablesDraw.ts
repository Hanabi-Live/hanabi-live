/*
   The lobby area that shows all of the current tables
*/

// Imports
import globals from '../globals';
import * as misc from '../misc';
import * as modals from '../modals';

const tablesDraw = () => {
    const tbody = $('#lobby-games-table-tbody');

    // Clear all of the existing rows
    tbody.html('');

    if (globals.tableList.size === 0) {
        $('#lobby-games-no').show();
        $('#lobby-games').addClass('align-center-v');
        $('#lobby-games-table-container').hide();
        return;
    }
    $('#lobby-games-no').hide();
    $('#lobby-games').removeClass('align-center-v');
    $('#lobby-games-table-container').show();

    // We want the tables to be drawn in a certain order:
    // 1) Tables that you are currently in
    // 2) Unstarted tables
    // 3) Unstarted & password-protected tables
    // 4) Ongoing tables
    // 5) Shared replays
    let sortedTableIDs: Array<number> = [];
    for (let i = 1; i <= 5; i++) {
        const tableIDsOfThisType: Array<number> = [];
        for (const [id, table] of globals.tableList) {
            if (i === 1 && table.joined && !table.sharedReplay) {
                tableIDsOfThisType.push(id);
            } else if (i === 2 && !table.running && !table.password && !table.joined) {
                tableIDsOfThisType.push(id);
            } else if (i === 3 && !table.running && table.password && !table.joined) {
                tableIDsOfThisType.push(id);
            } else if (i === 4 && table.running && !table.sharedReplay && !table.joined) {
                tableIDsOfThisType.push(id);
            } else if (i === 5 && table.running && table.sharedReplay) {
                tableIDsOfThisType.push(id);
            }
        }
        tableIDsOfThisType.sort();
        sortedTableIDs = sortedTableIDs.concat(tableIDsOfThisType);
    }

    // Add all of the games
    for (const id of sortedTableIDs) {
        const table = globals.tableList.get(id);
        if (typeof table === 'undefined') {
            throw new Error(`Failed to get the table for the ID of "${id}".`);
        }

        // Set the background color of the row, depending on what kind of game it is
        let htmlClass;
        if (table.sharedReplay) {
            htmlClass = 'replay';
        } else if (table.joined) {
            htmlClass = 'joined';
        } else if (table.running) {
            htmlClass = 'started';
        } else if (table.password) {
            htmlClass = 'unstarted-password';
        } else {
            htmlClass = 'unstarted';
        }
        const row = $(`<tr class="lobby-games-table-${htmlClass}">`);

        // Column 1 - Name
        let name = table.name;
        if (table.password && !table.running && !table.sharedReplay) {
            name = `<i class="fas fa-key fa-sm"></i> &nbsp; ${name}`;
        }
        $('<td>').html(name).appendTo(row);

        // Column 2 - # of Players
        $('<td>').html(table.numPlayers.toString()).appendTo(row);

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
        $('<td>').html(button as any).appendTo(row);

        // Column 7 - Players
        $('<td>').html(table.players).appendTo(row);

        // Column 8 - Spectators
        $('<td>').html(table.spectators).appendTo(row);

        row.appendTo(tbody);
    }
};
export default tablesDraw;

const tableSpectateButton = (table: Table) => () => {
    globals.conn.send('tableSpectate', {
        tableID: table.id,
    });
};

const tableJoinButton = (table: Table) => () => {
    if (table.password) {
        modals.passwordShow(table.id);
        return;
    }

    globals.conn.send('tableJoin', {
        tableID: table.id,
    });
};

const tableReattendButton = (table: Table) => () => {
    globals.conn.send('tableReattend', {
        tableID: table.id,
    });
};
