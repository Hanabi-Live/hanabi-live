// Sent when the user clicks on the "Watch Replay" button
// (the client will send a "hello" message after getting "gameStart")
// "data" example:
/*
    {
        gameID: 15103,
    }
*/

// Imports
const logger = require("../logger");
const models = require("../models");
const notify = require("../notify");

exports.step1 = (socket, data) => {
  // Validate that this game ID exists
  models.games.exists(socket, data, step2);
};

function step2(error, socket, data) {
  if (error !== null) {
    logger.error(`models.games.exists failed: ${error}`);
    return;
  }

  if (!data.exists) {
    logger.warn(`Game #${data.gameID} does not exist.`);
    data.reason = `Game #${data.gameID} does not exist.`;
    notify.playerError(socket, data);
    return;
  }

  // Set their status
  socket.currentGame = data.gameID;
  socket.status = "Replay";
  notify.allUserChange(socket);

  // Send them a "gameStart" message
  notify.playerGameStart(socket);
}
