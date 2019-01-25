// Configuration
const debug = true;

// Exported global variables
const globals = {
    debug,

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
    deck: [],

    // Replay variables
    inReplay: false, // Whether or not the replay controls are currently showing
    replayLog: [],
    replayPos: 0,
    replayTurn: 0,
    replayMax: 0,

    // Shared replay variables
    sharedReplayLeader: '', // Equal to the username of the leader
    sharedReplayTurn: -1,
};
module.exports = globals;
