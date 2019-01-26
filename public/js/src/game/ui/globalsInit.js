// Imports
const globals = require('./globals');

// Configuration
const debug = true;

// We modify the individual properties instead of replacing the entire globals object
// If we did that, the references in the other files would point to the outdated version
module.exports = () => {
    globals.debug = debug;

    // Objects sent upon UI initialization
    globals.lobby = null;
    globals.game = null;

    // Game settings
    // (sent in the "init" message)
    globals.playerNames = [];
    globals.variant = constants.VARIANTS['No Variant'];
    globals.playerUs = -1;
    globals.spectating = false;
    globals.replay = false;
    globals.sharedReplay = false;

    // Optional game settings
    // (sent in the "init" message)
    globals.timed = false;
    globals.deckPlays = false;
    globals.emptyClues = false;
    globals.characterAssignments = [];
    // This is the "Detrimental Character Assignments" for each player, if enabled
    // (it is either an empty array or an array of integers)
    globals.characterMetadata = [];
    // This is extra information about each player's "Detrimental Character Assignments",
    // if enabled (it is either an empty array or an array of integers)

    // Game state variables
    globals.ready = false;
    globals.deck = [];
    globals.deckSize = 0;
    globals.turn = 0;
    globals.score = 0;
    globals.clues = 0;
    globals.spectators = [];

    // Efficiency variables
    globals.cardsGotten = 0;
    globals.cluesSpentPlusStrikes = 0;

    // Replay variables
    globals.inReplay = false; // Whether or not the replay controls are currently showing
    globals.replayLog = [];
    globals.replayPos = 0;
    globals.replayTurn = 0;
    globals.replayMax = 0;

    // Shared replay variables
    globals.sharedReplayLeader = ''; // Equal to the username of the leader
    globals.sharedReplayTurn = -1;

    // UI elements
    globals.elements = {
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        timer1: null,
        timer2: null,
    };
    globals.layers = {
        UI: null,
        timer: null,
    };
};
