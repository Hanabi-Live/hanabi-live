'use strict';

// Sent when the user clicks on the "Shared Replay" button
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        id: 123,
    }
*/

// Imports
const globals = require('../globals');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    data.name = `Shared replay for game #${data.id}`;
    data.owner = socket.userID;
};
