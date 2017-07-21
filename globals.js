'use strict';

// Server configuration
const port          = 3000;
const startingTime  = 5 * 60 * 1000; // In milliseconds
const extraTurnTime = 10 * 1000; // In milliseconds

// The object that contains all of the global variables
module.exports = {
    connectedUsers:   {}, // Indexed by ID
    currentGames:     {}, // Indexed by ID
    extraTurnTime:    extraTurnTime,
    startingTime:     startingTime,
    suits: [
        'Blue',
        'Green',
        'Yellow',
        'Red',
        'Purple',
        'Black',
        'Rainbow',
    ],
    mixedSuits: [
        'Teal',
        'Magenta',
        'Indigo',
        'Orange',
        'Forest',
        'Burgundy',
    ],
    mixedClues: [
        'Blue',
        'Green',
        'Red',
        'Purple',
    ],
    mmSuits: [
        'Teal',
        'Lime',
        'Orange',
        'Burgundy',
        'Indigo',
        'Rainbow',
    ],
    port: port,
};
