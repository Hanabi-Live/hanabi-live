'use strict';

// The object that contains all of the global variables
module.exports = {
    connectedUsers: {}, // Indexed by ID
    currentGames: {}, // Indexed by ID
    extraTurnTime: 10 * 1000, // In milliseconds
    startingTime: 5 * 60 * 1000, // In milliseconds
    suits: ['Blue', 'Green', 'Yellow', 'Red', 'Purple', 'Black', 'Rainbow'],
};
