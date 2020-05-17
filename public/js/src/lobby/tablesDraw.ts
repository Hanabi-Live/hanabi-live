// The lobby area that shows all of the current tables

// Imports
import globals from '../globals';
import * as misc from '../misc';
import * as modals from '../modals';
import Table from './Table';

const tablesDraw = () => {
  const tbody = $('#lobby-games-table-tbody');

  // Clear all of the existing rows
  tbody.html('');

  if (globals.tableMap.size === 0) {
    $('#lobby-games-no').show();
    $('#lobby-games').addClass('align-center-v');
    $('#lobby-games-table-container').hide();
    return;
  }
  $('#lobby-games-no').hide();
  $('#lobby-games').removeClass('align-center-v');
  $('#lobby-games-table-container').show();

  // We want the tables to be drawn in a certain order:
  // 1) Tables that we are currently in
  // 2) Tables our friends are currently in
  // 3) Unstarted tables
  // 4) Unstarted & password-protected tables
  // 5) Ongoing tables
  // 6) Shared replays
  let sortedTableIDs: number[] = [];
  for (const friends of [true, false]) {
    for (let i = 1; i <= 5; i++) {
      const tableIDsOfThisType: number[] = [];
      for (const [id, table] of globals.tableMap) {
        if (friends && i === 1 && table.joined && !table.sharedReplay) {
          tableIDsOfThisType.push(id);
        }

        const hasFriends = tableHasFriends(table);
        if ((friends && !hasFriends) || (!friends && hasFriends)) {
          continue;
        }

        if (i === 2 && !table.running && !table.passwordProtected && !table.joined) {
          tableIDsOfThisType.push(id);
        } else if (i === 3 && !table.running && table.passwordProtected && !table.joined) {
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
  }

  // Add all of the games
  let addedFirstJoinButton = false;
  for (const id of sortedTableIDs) {
    const table = globals.tableMap.get(id);
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
    } else if (table.passwordProtected) {
      htmlClass = 'unstarted-password';
    } else {
      htmlClass = 'unstarted';
    }
    const row = $(`<tr class="lobby-games-table-${htmlClass}">`);

    // Column 1 - Name
    let name = table.name;
    if (table.passwordProtected && !table.running && !table.sharedReplay) {
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
    } else if (table.running) {
      status = 'Running';
    } else {
      status = 'Not Started';
    }
    if (status !== 'Not Started') {
      status += ` (<span id="status-${table.id}">${table.progress}</span>%)`;
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
      if (!addedFirstJoinButton) {
        addedFirstJoinButton = true;
        button.addClass('lobby-games-first-join-button');
      }
    } else {
      button.html('<i class="fas fa-play lobby-button-icon"></i>');
      button.attr('id', `resume-${table.id}`);
      button.on('click', tableReattendButton(table));
    }
    $('<td>').html(button as any).appendTo(row);

    // Column 7 - Players
    const playersArray: string[] = [];
    for (const player of table.players) {
      if (globals.friends.includes(player)) {
        playersArray.push(`<span class="friend">${player}</span>`);
      } else {
        playersArray.push(player);
      }
    }
    const playersString = playersArray.join(', ');
    $('<td>').html(playersString).appendTo(row);

    // Column 8 - Spectators
    let spectatorsString: string;
    if (table.spectators.length === 0) {
      spectatorsString = '-';
    } else {
      const spectatorsArray: string[] = [];
      for (const spectator of table.spectators) {
        if (globals.friends.includes(spectator)) {
          spectatorsArray.push(`<span class="friend">${spectator}</span>`);
        } else {
          spectatorsArray.push(spectator);
        }
      }
      spectatorsString = spectatorsArray.join(', ');
    }
    $('<td>').html(spectatorsString).appendTo(row);

    row.appendTo(tbody);
  }
};
export default tablesDraw;

const tableSpectateButton = (table: Table) => () => {
  globals.conn!.send('tableSpectate', {
    tableID: table.id,
  });
};

const tableJoinButton = (table: Table) => () => {
  if (table.passwordProtected) {
    modals.passwordShow(table.id);
    return;
  }

  globals.conn!.send('tableJoin', {
    tableID: table.id,
  });
};

const tableReattendButton = (table: Table) => () => {
  globals.conn!.send('tableReattend', {
    tableID: table.id,
  });
};

const tableHasFriends = (table: Table) => {
  for (const player of table.players) {
    if (globals.friends.includes(player)) {
      return true;
    }
  }

  for (const spectator of table.spectators) {
    if (globals.friends.includes(spectator)) {
      return true;
    }
  }

  return false;
};
