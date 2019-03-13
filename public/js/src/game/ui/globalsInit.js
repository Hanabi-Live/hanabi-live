// Imports
const globals = require('./globals');

// Configuration
const debug = true;
const tooltipDelay = 400; // In milliseconds

// We modify the individual properties instead of replacing the entire globals object
// If we did that, the references in the other files would point to the outdated version
module.exports = () => {
    // Constants
    globals.debug = debug;
    globals.tooltipDelay = tooltipDelay;

    // Objects sent upon UI initialization
    globals.lobby = null;
    globals.game = null;

    // Game settings
    // (sent in the "init" message)
    globals.playerNames = [];
    globals.variant = null;
    globals.playerUs = -1;
    globals.spectating = false;
    globals.replay = false; // True if we are in a solo or shared replay
    globals.sharedReplay = false;

    // Optional game settings
    // (sent in the "init" message in "websocket.js")
    globals.timed = false;
    globals.baseTime = null;
    globals.timePerTurn = null;
    globals.speedrun = false;
    globals.deckPlays = false;
    globals.emptyClues = false;
    globals.characterAssignments = [];
    // This is the "Detrimental Character Assignments" for each player, if enabled
    // (it is either an empty array or an array of integers)
    globals.characterMetadata = [];
    // This is extra information about each player's "Detrimental Character Assignments",
    // if enabled (it is either an empty array or an array of integers)

    // Game state variables
    globals.deck = [];
    globals.deckSize = 0;
    globals.turn = 0;
    globals.endTurn = null; // Set when the final card is drawn
    globals.score = 0;
    globals.clues = 0;
    globals.spectators = [];
    globals.deckOrder = null; // Sent when the game ends

    // Efficiency variables
    globals.cardsGotten = 0;
    globals.cluesSpentPlusStrikes = 0;

    // Replay variables
    globals.inReplay = false; // Whether or not the replay controls are currently showing
    globals.replayLog = [];
    globals.replayPos = 0;
    globals.replayTurn = 0;
    globals.replayTurnMemory = -1; // Used for the "Back to Turn #" button
    globals.replayMax = 0;
    // In replays, we can show information about a card that was not known at the time,
    // but is known now; these are cards we have "learned"
    globals.learnedCards = [];

    // Shared replay variables
    globals.sharedReplayLeader = ''; // Equal to the username of the leader
    globals.amSharedReplayLeader = false;
    globals.sharedReplayTurn = -1;
    globals.useSharedTurns = true;
    globals.sharedReplayLoading = true; // This is used to not animate cards when loading in
    globals.hypothetical = false; // Whether or not we are in a hypothetical
    globals.hypoActions = []; // An array of the actions in the current hypothetical

    // UI elements
    globals.ImageLoader = null;
    globals.stage = null;
    globals.layers = {
        background: null,
        UI: null,
        timer: null,
        card: null,
        UI2: null, // We need some UI elements to be on top of cards
        overtop: null, // A layer drawn overtop everything else
    };
    globals.elements = {
        // The main screen
        stageFade: null,
        playArea: null,
        playStacks: new Map(),
        suitLabelTexts: [],
        discardArea: null,
        discardStacks: new Map(),
        playerHands: [],
        nameFrames: [],
        messagePrompt: null, // The truncated action log
        replayButton: null,
        chatButton: null,
        lobbyButtonSmall: null,
        lobbyButtonBig: null,
        killButton: null,
        restartButton: null,
        drawDeck: null,
        deckTurnsRemainingLabel1: null,
        deckTurnsRemainingLabel2: null,
        deckPlayAvailableLabel: null,

        // Extra elements on the right-hand side + the bottom
        clueLog: null,
        paceNumberLabel: null,
        efficiencyNumberLabel: null,
        efficiencyNumberLabelMinNeeded: null,
        noDiscardLabel: null,
        noDoubleDiscardLabel: null,
        scoreArea: null,
        turnNumberLabel: null,
        scoreNumberLabel: null,
        cluesNumberLabel: null,
        strikes: [],
        strikeSquares: [],
        spectatorsLabel: null,
        spectatorsNumLabel: null,
        sharedReplayLeaderLabel: null,
        sharedReplayLeaderCircle: null,
        sharedReplayLeaderLabelPulse: null,

        // The clue UI
        clueArea: null,
        clueTargetButtonGroup: null,
        clueTypeButtonGroup: null,
        rankClueButtons: null,
        suitClueButtons: null,
        giveClueButton: null,
        noClueBox: null,
        noClueLabel: null,

        // The replay screen
        replayArea: null,
        replayShuttleShared: null,
        replayShuttle: null,
        replayBackFullButton: null,
        replayBackButton: null,
        replayForwardButton: null,
        replayForwardFullButton: null,
        replayExitButton: null,
        toggleSharedTurnButton: null,
        backToTurnButton: null,
        toggleHypoButton: null,
        hypoCircle: null,

        // Other screens
        msgLogGroup: null, // The full action log

        // Other optional elements
        timer1: null,
        timer2: null,
        sharedReplayForward: null,
        sharedReplayForwardTween: null,
        sharedReplayBackward: null,
        sharedReplayBackwardTween: null,
    };
    globals.activeHover = null; // The element that the mouse cursor is currently over
    globals.cardImages = {};
    globals.scaleCardImages = {};

    // Pre-move feature
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
