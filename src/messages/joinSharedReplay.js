// The "joinSharedReplay" message is not actually sent by the client;
// we just store the logic here for organizational purposes
// "data" example:
/*
    {
        gameID: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;

    // Validation was performed in the previous function (spectateTable)
    const game = globals.currentGames[data.gameID];

    logger.info(`User "${socket.username}" joined shared replay: #${data.gameID}`);

    // Add them to the spectators object
    game.spectators[socket.userID] = socket;
    notify.allTableChange(data);
    notify.gameMemberChange(data);
    notify.gameSpectators(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Shared Replay';
    notify.allUserChange(socket);

    // Send them a "gameStart" message
    notify.playerGameStart(socket);
};
