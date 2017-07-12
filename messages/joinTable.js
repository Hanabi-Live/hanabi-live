'use strict';

// Sent when the user clicks on the "Join" button in the lobby
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const models  = require('../models');
const notify  = require('../notify');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    data.userID = socket.userID;
    data.gameID = data.table_id;

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        return;
    }

    // Join the table
    models.gameParticipants.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.gameParticipants.create failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    logger.info('User "' + socket.username + '" joined game: #' + data.gameID + ' (' + game.name + ')');

    // Keep track of the user that joined
    game.players.push({
        hand: [],
        userID: socket.userID,
        username: socket.username,
        present: true,
        socket: socket,
        time: globals.startingTime, // In milliseconds
    });
    socket.status = 'In Pre-Game';
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: false,
    };

    // Let the client know they successfully joined the table
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });

    notify.allUserChange(socket);
    notify.allTableChange(data);
    notify.gameMemberChange(data);
}
