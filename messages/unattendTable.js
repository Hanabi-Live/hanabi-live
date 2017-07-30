// Sent when the user clicks on the "Lobby" button while they are in the middle
// of a game
// "data" is empty

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;

    // Set their status
    const oldStatus = socket.status;
    socket.status = 'Lobby';
    notify.allUserChange(socket);

    // Validate that this table exists
    if (!(data.gameID in globals.currentGames)) {
        // Since games are deleted when they end, it is normal behavior for
        // players to click the "Lobby" button and get to this point
        logger.info('(Table does not exist.)');
        return;
    }
    const game = globals.currentGames[data.gameID];

    // Check to see if they are a spectator
    if (oldStatus === 'Spectating' || oldStatus === 'Shared Replay') {
        if (!(socket.userID in game.spectators)) {
            logger.error(`User "${socket.username}" tried to unattend game #${data.gameID}, but they were not in the spectators list.`);
            return;
        }

        // We only want to reset this for players who are not in the actual game
        socket.currentGame = -1;

        delete game.spectators[socket.userID];
        notify.gameMemberChange(data);
        notify.gameSpectators(data);

        if (game.sharedReplay) {
            if (Object.keys(game.spectators).length === 0) {
                // This was the last person to leave the shared replay, so
                // delete it
                logger.info(`Ended shared replay #${data.gameID} because everyone left.`);
                delete globals.currentGames[data.gameID];

                // Notify everyone that the table was deleted
                notify.allTableGone(data);
            } else {
                // Since the number of spectators is the number of players for
                // shared replays, we need to notify everyone that this player
                // left
                notify.allTableChange(data);
            }
        }

        return;
    }

    // Set their "present" variable to false, which will turn their name red
    // (or set them to "AWAY" if the game has not started yet)
    for (const player of game.players) {
        if (player.userID === socket.userID) {
            player.present = false;
            break;
        }
    }
    if (game.running) {
        notify.gameConnected(data);
    } else {
        notify.gameMemberChange(data);
    }

    // They got sent a "tableGone" message earlier (if the game started), so
    // send them a new table message
    notify.playerTable(socket, data);
};
