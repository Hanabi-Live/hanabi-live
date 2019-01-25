// Configuration
const debug = true;

// Exported global variables
const globals = {
    debug,

    // Objects sent upon UI initialization
    lobby: null,
    game: null,

    // Game settings
    // (sent in the "init" message)
    playerNames: [],
    variant: constants.VARIANTS['No Variant'],
    playerUs: -1,
    spectating: false,
    replay: false,
    sharedReplay: false,

    // Optional game settings
    // (sent in the "init" message)
    timed: false,
    deckPlays: false,
    emptyClues: false,
    characterAssignments: [],
    // This is the "Detrimental Character Assignments" for each player, if enabled
    // (it is either an empty array or an array of integers)
    characterMetadata: [],
    // This is extra information about each player's "Detrimental Character Assignments", if enabled
    // (it is either an empty array or an array of integers)

    // Game state variables
    ready: false,
    deck: [],
    deckSize: 0,
    turn: 0,
    score: 0,
    clues: 0,
    spectators: [],

    // Efficiency variables
    cardsGotten: 0,
    cluesSpentPlusStrikes: 0,

    // Replay variables
    inReplay: false, // Whether or not the replay controls are currently showing
    replayLog: [],
    replayPos: 0,
    replayTurn: 0,
    replayMax: 0,

    // Shared replay variables
    sharedReplayLeader: '', // Equal to the username of the leader
    sharedReplayTurn: -1,

    // UI elements
    elements: {
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        timer1: null,
        timer2: null,
    },
    layers: {
        timer: null,
    },
};
module.exports = globals;

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
window.globals2 = globals;
