// Imports
const globals = require('./globals');

// We modify the individual properties instead of replacing the entire globals object
// If we did that, the references in the other files would point to the outdated version
module.exports = () => {
    // Objects sent upon UI initialization
    globals.lobby = null;
    globals.game = null;
    globals.loading = true;

    // Game settings
    // (sent in the "init" message in "websocket.js")
    globals.playerNames = [];
    globals.variant = null;
    globals.playerUs = -1;
    globals.spectating = false;
    globals.replay = false; // True if we are in a solo or shared replay
    globals.sharedReplay = false;
    globals.id = 0;

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

    // Game constants (set upon first initialization)
    globals.deck = []; // Contains HanabiCard objects in the order that they are dealt
    // Keys are e.g. "Blue1", values are the count of how many are left
    globals.cardsMap = new Map();
    globals.deckOrder = null; // Sent when the game ends

    // Game state variables (reset when rewinding in a replay)
    globals.turn = 0;
    globals.currentPlayerIndex = 0;
    globals.ourTurn = false;
    globals.endTurn = null; // Set when the final card is drawn
    globals.deckSize = 0; // Set in the "initCards()" function
    globals.indexOfLastDrawnCard = 0;
    globals.score = 0;
    globals.maxScore = 0;
    globals.clues = 0;
    globals.cardsGotten = 0;
    globals.cluesSpentPlusStrikes = 0;
    globals.stackDirections = [0, 0, 0, 0, 0];

    // UI elements
    globals.ImageLoader = null;
    globals.stage = null;
    globals.layers = {
        UI: null,
        timer: null,
        card: null,
        UI2: null, // We need some UI elements to be on top of cards
    };
    globals.elements = {
        // The main screen
        stageFade: null,
        playArea: null,
        playStacks: new Map(), // Keys are Suits, values are CardStacks
        suitLabelTexts: [],
        discardArea: null,
        discardStacks: new Map(), // Keys are Suits, values are CardStacks
        playerHands: [], // Contains CardLayouts
        nameFrames: [],
        actionLog: null,
        replayButton: null,
        chatButton: null,
        lobbyButtonSmall: null,
        lobbyButtonBig: null,
        killButton: null,
        restartButton: null,
        deck: null,
        gameIDLabel: null,
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

        // The current turn UI
        currentPlayerArea: null,
        currentPlayerRect1: null,
        currentPlayerText1: null,
        currentPlayerText2: null,
        currentPlayerText3: null,
        currentPlayerArrow: null,
        currentPlayerArrowTween: null,

        // The replay screen
        replayArea: null,
        replayShuttleShared: null,
        replayShuttleSharedTween: null,
        replayShuttle: null,
        replayShuttleTween: null,
        replayBackFullButton: null,
        replayBackButton: null,
        replayForwardButton: null,
        replayForwardFullButton: null,
        replayExitButton: null,
        toggleSharedTurnButton: null,
        toggleHypoButton: null,
        hypoCircle: null,

        // Other screens
        fullActionLog: null,

        // Other optional elements
        arrows: [],
        timer1: null,
        timer2: null,
        sharedReplayForward: null,
        sharedReplayForwardTween: null,
        sharedReplayBackward: null,
        sharedReplayBackwardTween: null,
    };
    globals.activeHover = null; // The element that the mouse cursor is currently over
    globals.cardImages = {};
    globals.scaledCardImages = {};

    // Replay feature
    globals.inReplay = false; // Whether or not the replay controls are currently showing
    globals.replayLog = []; // Contains all of the "notify" messages for the game
    globals.replayPos = 0; // The current index of the "globals.replayLog" array
    globals.replayTurn = 0; // The current game turn
    globals.replayMax = 0; // The maximum turn recorded so fast
    // Used to keep track of when the game ends (before the "gameOver" command has arrived)
    globals.gameOver = false;
    globals.finalReplayPos = 0;
    globals.finalReplayTurn = 0;
    // In replays, we can show information about a card that was not known at the time,
    // but is known now; these are cards we have "learned"
    globals.learnedCards = [];

    // Shared replay feature
    globals.sharedReplayLeader = ''; // Equal to the username of the leader
    globals.amSharedReplayLeader = false;
    globals.sharedReplayTurn = -1;
    globals.useSharedTurns = true;
    globals.sharedReplayLoading = true; // This is used to not animate cards when loading in
    globals.hypothetical = false; // Whether or not we are in a hypothetical
    globals.hypoActions = []; // An array of the actions in the current hypothetical

    // Notes feature
    globals.ourNotes = []; // An array containing strings, indexed by card order
    // An array containing objects, indexed by card order;
    // It represents the notes of every player & spectator
    globals.allNotes = [];
    // Used to keep track of which card the user is editing;
    // users can only update one note at a time to prevent bugs
    // Equal to the card order number or null
    globals.editingNote = null;
    // Equal to true if something happened when the note box happens to be open
    globals.actionOccured = false;
    globals.lastNote = ''; // Equal to the last note entered

    // Timer feature
    globals.timerID = null;
    globals.playerTimes = null;
    globals.activeIndex = null;
    globals.lastTimerUpdateTimeMS = null;

    // Pre-move feature
    globals.queuedAction = null;
    globals.preCluedCard = null;

    // Pause feature
    globals.paused = false; // Whether or not the game is currently paused
    globals.pausePlayer = ''; // The name of the player who paused the game
    globals.pauseQueued = false; // Whether or not we have requested a queued pause

    // Miscellaneous
    globals.animateFast = true;
    globals.savedAction = null; // Used to save new actions when in an in-game replay
    // A function called after an action from the server moves cards
    globals.postAnimationLayout = null;
    globals.lastAction = null; // Used when rebuilding the game state
    globals.accidentalClueTimer = Date.now();
    // Used to prevent giving an accidental clue after clicking the "Exit Replay" button
    globals.surprise = false;
    globals.spectators = [];
    globals.chatUnread = 0;
};
