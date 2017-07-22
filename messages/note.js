// Sent when the user writes a note
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        order: 3,
        note: 'b1,m1',
    }
*/

// Imports
const globals = require('../globals');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;
    const game = globals.currentGames[data.gameID];

    // Get the index of this player
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            data.index = i;
            break;
        }
    }

    // Add their note to the card
    game.deck[data.order].notes[data.index] = data.note;

    // Let all of the spectators know that there is a new note
    notify.spectatorsNote(data);
};
