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
    globals.variant = null;
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
    // In replays, we can show information about a card that was not known at the time,
    // but is known now; these are cards we have "learned"
    globals.learnedCards = [];

    // Shared replay variables
    globals.sharedReplayLeader = ''; // Equal to the username of the leader
    globals.sharedReplayTurn = -1;
    globals.useSharedTurns = true;

    // UI elements
    globals.ImageLoader = null;
    globals.stage = null;
    globals.layers = {
        UI: null,
        timer: null,
        overtop: null, // A layer drawn overtop everything else
    };
    globals.elements = {
        stageFade: null,
        playerHands: [],
        messagePrompt: null, // The truncated action log
        msgLogGroup: null, // The full action log
        clueTargetButtonGroup: null,
        clueButtonGroup: null,
        rankClueButtons: null,
        suitClueButtons: null,
        giveClueButton: null,
        clueLog: null,
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        chatButton: null,
        timer1: null,
        timer2: null,
        replayArea: null,
        replayShuttleShared: null,
    };
    globals.activeHover = null; // The elemnt that the mouse cursor is currently over
    globals.cardImages = {};

    // Pre-play feature
    globals.ourTurn = false;
    globals.queuedAction = null;

    // Miscellaneous
    globals.animateFast = true;
    globals.savedAction = null; // Used to save new actions when in an in-game replay
    globals.postAnimationLayout = null;
    // A function called after an action from the server moves cards
    globals.lastAction = null; // Used when rebuilding the game state
    globals.accidentalClueTimer = Date.now();
    // Used to prevent giving an accidental clue after clicking the "Exit Replay" button
    globals.chatUnread = 0;
};
