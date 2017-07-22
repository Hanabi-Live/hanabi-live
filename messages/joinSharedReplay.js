// The "join_shared_replay" message is not actually sent by the client;
// we just store the logic here for organizational purposes
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;
    data.gameID = data.table_id;

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`Game #${data.gameID} does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerDenied(socket, data);
        return;
    }

    logger.info(`User "${socket.username}" joined shared replay: #${data.gameID}`);

    // Add them to the spectators object
    game.spectators[socket.userID] = socket;
    notify.allTableChange(data);
    notify.gameMemberChange(data);
    notify.gameNumSpec(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Shared Replay';
    notify.allUserChange(socket);

    // Send them a "game_start" message
    notify.playerGameStart(socket);
};
