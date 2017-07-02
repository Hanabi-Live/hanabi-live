'use strict';

// Sent when the user clicks on the "Lobby" button while they are in the middle of a game
// "data" is empty

// Imports
const globals  = require('../globals');
const messages = require('../messages');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = socket.atTable.id;
    let game = globals.currentGames[data.gameID];

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        console.log("(Table does not exist.)");
        return;
    }

    // Check to see if they are a spectator
    if (socket.atTable.spectating) {
        if (socket.userID in game.spectators === false) {
            console.error('User "' + socket.username + '" tried to unattend game #' + data.gameID + ', but they were not in the spectators list.');
            return;
        }

        delete game.spectators[socket.userID];
        return;
    }

    // Set their "present" variable to false, which will turn their name red
    for (let player of game.players) {
        if (player.userID === socket.userID) {
            player.present = false;
            break;
        }
    }
    messages.start_game.notifyGameConnected(data);

    // Set their "seated" and "playing" variables to false, which control the checkboxes in the lobby
    socket.seated = false;
    socket.playing = false;
    messages.join_table.notifyAllUserChange(socket);

    // Get the index of this player
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            data.index = i;
            break;
        }
    }

    // They got sent a "table_gone" message earlier, so send them a new table message
    socket.emit('message', {
        type: 'table',
        resp: {
            allow_spec: game.allow_spec,
            id: data.gameID,
            joined: true,
            max_players: game.max_players,
            name: game.name,
            num_players: game.players.length,
            our_turn: game.turn === data.index,
            owned: socket.userID === game.owner,
            running: game.running,
            variant: game.variant,
        },
    });
};
