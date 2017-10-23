// Server configuration
const port = process.env.PORT || 3000; // In Heroku, the PORT environment variable will be specified
const startingTime = 5 * 60 * 1000; // In milliseconds
const extraTurnTime = 10 * 1000; // In milliseconds

// The object that contains all of the global variables
module.exports = {
    connectedUsers: {}, // Indexed by ID
    currentGames: {}, // Indexed by ID
    extraTurnTime,
    startingTime,
    suits: [
        'Blue',
        'Green',
        'Yellow',
        'Red',
        'Purple',
        'Black',
        'Rainbow',
        'White',
    ],
    mixedSuits: [
        'Green',
        'Magenta',
        'Navy',
        'Orange',
        'Tan',
        'Burgundy',
    ],
    mixedClues: [
        'Blue',
        'Yellow',
        'Red',
        'Black',
    ],
    mmSuits: [
        'Teal',
        'Lime',
        'Orange',
        'Cardinal',
        'Indigo',
        'Rainbow',
    ],
    crazySuits: [
        'Green',
        'Magenta',
        'Orange',
        'White',
        'Rainbow',
        'Black',
    ],
    port,
    variants: [
        'None',
        'Black Suit',
        'Black Suit (one of each rank)',
        'Rainbow Suit (all colors)',
        'Dual-color Suits',
        'Dual-color & Rainbow Suits',
        'White Suit (colorless) & Rainbow Suit',
        'Wild and Crazy',
    ],
    wordList: null, // Set in the "index.js" file
};
