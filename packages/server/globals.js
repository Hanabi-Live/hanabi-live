// Server configuration
const baseTimeMinutes = 5;
const timePerTurnSeconds = 10;
const baseTimeDefault = baseTimeMinutes * 60 * 1000; // In milliseconds
const timePerTurnDefault = timePerTurnSeconds * 1000; // In milliseconds

// The object that contains all of the global variables
module.exports = {
    // Data structures and variables
    connectedUsers: {}, // Indexed by ID
    currentGames: {}, // Indexed by ID
    wordList: null, // Set in the "index.js" file
    id: 1, // Start at 1 and increment for every game created

    // Configuration constants
    baseTimeDefault,
    timePerTurnDefault,

    // Text definitions
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
        'Purple',
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
        'Purple',
        'Orange',
        'White',
        'Rainbow',
        'Black',
    ],
    variants: [
        'No Variant',
        'Black Suit',
        'Black Suit 1OE',
        'Rainbow Suit',
        'Dual-color Suits',
        'Dual-color & Rainbow Suits',
        'White Suit & Rainbow Suit',
        'Wild & Crazy',
    ],
};
