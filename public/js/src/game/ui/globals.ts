/*
    This object contains global variables for the game UI
    Every class variable must also be reset in the "reset()" function
*/

// Imports
import Konva from 'konva';
import { Action } from './actions';
import Elements from './Elements';
import LearnedCard from './LearnedCard';
import Loader from './Loader';
import HanabiCard from './HanabiCard';
import SpectatorNote from './SpectatorNote';
import SimpleCard from './SimpleCard';
import State from './State';
import Variant from '../../Variant';
import { VARIANTS } from '../../constants';

export class Globals {
    // Objects sent upon UI initialization
    lobby: any = null;
    game: any = null;
    loading: boolean = false;

    // Game settings
    // (sent in the "init" message)
    playerNames: Array<string> = [];
    variant: Variant = VARIANTS.get('No Variant')!;
    playerUs: number = -1;
    spectating: boolean = false;
    replay: boolean = false;
    sharedReplay: boolean = false;
    databaseID: number = 0;

    // Optional game settings
    // (sent in the "init" message)
    timed: boolean = false;
    baseTime: number = 0;
    timePerTurn: number = 0;
    speedrun: boolean = false;
    cardCycle: boolean = false;
    deckPlays: boolean = false;
    emptyClues: boolean = false;
    characterAssignments: Array<string> = [];
    characterMetadata: Array<number> = [];

    // Game constants (set upon first initialization)
    deck: Array<HanabiCard> = [];
    stackBases: Array<HanabiCard> = [];
    cardsMap: Map<string, number> = new Map();

    // Game state variables (reset when rewinding in a replay)
    turn: number = 0;
    currentPlayerIndex: number = 0;
    ourTurn: boolean = false;
    endTurn: number | null = null;
    deckSize: number = 0;
    indexOfLastDrawnCard: number = 0;
    score: number = 0;
    maxScore: number = 0;
    clues: number = 0;
    cardsGotten: number = 0;
    cluesSpentPlusStrikes: number = 0;
    stackDirections: Array<number> = [];

    // UI elements
    ImageLoader: Loader | null = null;
    stage: Konva.Stage | null = null;
    layers: Map<string, Konva.Layer> = new Map();
    elements: Elements = new Elements();
    activeHover: any = null; // The element that the mouse cursor is currently over
    cardImages: Map<string, HTMLCanvasElement> = new Map();
    scaledCardImages: Map<string, Array<HTMLCanvasElement>> = new Map();

    // Replay feature
    inReplay: boolean = false; // Whether or not the replay controls are currently showing
    replayLog: Array<any> = []; // Contains all of the "notify" messages for the game
    replayPos: number = 0; // The current index of the "globals.replayLog" array
    replayTurn: number = 0; // The current game turn
    replayMax: number = 0; // The maximum turn recorded so fast
    // Used to keep track of when the game ends (before the "gameOver" command has arrived)
    gameOver: boolean = false;
    finalReplayPos: number = 0;
    finalReplayTurn: number = 0;
    // In replays, we can show information about a card that was not known at the time,
    // but is known now; these are cards we have "learned"
    learnedCards: Array<LearnedCard> = [];

    // Shared replay feature
    sharedReplayLeader: string = ''; // Equal to the username of the leader
    amSharedReplayLeader: boolean = false;
    sharedReplayTurn: number = -1;
    useSharedTurns: boolean = false;
    sharedReplayLoading: boolean = false; // This is used to not animate cards when loading in
    hypothetical: boolean = false; // Whether or not we are in a hypothetical
    hypoActions: Array<any> = []; // An array of the actions in the current hypothetical

    // Notes feature
    ourNotes: Array<string> = []; // An array containing strings, indexed by card order
    // An array containing objects, indexed by card order;
    // It represents the notes of every player & spectator
    allNotes: Array<Array<SpectatorNote>> = [];
    // Used to keep track of which card the user is editing;
    // users can only update one note at a time to prevent bugs
    // Equal to the card order number or null
    editingNote = null;
    // Equal to true if something happened when the note box happens to be open
    actionOccured: boolean = false;
    lastNote: string = ''; // Equal to the last note entered

    // Timer feature
    timerID: any = null;
    playerTimes: Array<number> = [];
    // "activeIndex" must be tracked separately from the "currentPlayerIndex" because
    // the current player may change in an in-game replay
    activeIndex: number = -1;
    timeTaken: number = 0;
    startingTurnTime: number = 0;
    lastTimerUpdateTimeMS: number = 0;

    // Pre-move feature
    queuedAction: Action | null = null;
    preCluedCard: number | null = null;

    // Pause feature
    paused: boolean = false; // Whether or not the game is currently paused
    pausePlayer: string = ''; // The name of the player who paused the game
    pauseQueued: boolean = false; // Whether or not we have requested a queued pause

    // Miscellaneous
    animateFast: boolean = true;
    // A function called after an action from the server moves cards
    postAnimationLayout: (() => void) | null = null;
    UIClickTime: number = 0; // Used to prevent accidental double clicks
    spectators: Array<string> = [];
    chatUnread: number = 0;

    // State information
    state: State = new State(); // The current state
    states: Array<State> = []; // The state for each turn
    // We also keep track of the strikes outside of the state object so that we can show a faded X
    strikes: Array<StateStrike> = [];
    deckOrder: Array<SimpleCard> = []; // Sent when the game ends

    // We provide a method to reset every class variable to its initial value
    // This is called when the user goes into a new game
    // We cannot just create a new instantiation of the class,
    // because then the references in the other files would point to the outdated version
    reset() {
        this.lobby = null;
        this.game = null;
        this.loading = false;
        this.playerNames = [];
        this.variant = VARIANTS.get('No Variant')!;
        this.playerUs = -1;
        this.spectating = false;
        this.replay = false;
        this.sharedReplay = false;
        this.databaseID = 0;
        this.timed = false;
        this.baseTime = 0;
        this.timePerTurn = 0;
        this.speedrun = false;
        this.cardCycle = false;
        this.deckPlays = false;
        this.emptyClues = false;
        this.characterAssignments = [];
        this.characterMetadata = [];
        this.deck = [];
        this.stackBases = [];
        this.cardsMap = new Map();
        this.turn = 0;
        this.currentPlayerIndex = 0;
        this.ourTurn = false;
        this.endTurn = null;
        this.deckSize = 0;
        this.indexOfLastDrawnCard = 0;
        this.score = 0;
        this.maxScore = 0;
        this.clues = 0;
        this.cardsGotten = 0;
        this.cluesSpentPlusStrikes = 0;
        this.stackDirections = [];
        this.ImageLoader = null;
        this.stage = null;
        this.layers = new Map();
        this.elements = new Elements();
        this.activeHover = null;
        this.cardImages = new Map();
        this.scaledCardImages = new Map();
        this.inReplay = false;
        this.replayLog = [];
        this.replayPos = 0;
        this.replayTurn = 0;
        this.replayMax = 0;
        this.gameOver = false;
        this.finalReplayPos = 0;
        this.finalReplayTurn = 0;
        this.learnedCards = [];
        this.sharedReplayLeader = '';
        this.amSharedReplayLeader = false;
        this.sharedReplayTurn = -1;
        this.useSharedTurns = true;
        this.sharedReplayLoading = true;
        this.hypothetical = false;
        this.hypoActions = [];
        this.ourNotes = [];
        this.allNotes = [];
        this.editingNote = null;
        this.actionOccured = false;
        this.lastNote = '';
        this.timerID = null;
        this.playerTimes = [];
        this.activeIndex = -1;
        this.timeTaken = 0;
        this.startingTurnTime = 0;
        this.lastTimerUpdateTimeMS = 0;
        this.queuedAction = null;
        this.preCluedCard = 0;
        this.paused = false;
        this.pausePlayer = '';
        this.pauseQueued = false;
        this.animateFast = true;
        this.postAnimationLayout = null;
        this.UIClickTime = 0;
        this.spectators = [];
        this.chatUnread = 0;
        this.state = new State();
        this.states = [];
        this.strikes = [];
        this.deckOrder = [];
    }
}

const globals = new Globals();
export default globals;

// TODO move this somewhere, probably to a separate file
interface StateStrike {
    order: number;
    turn: number;
}

// Also make it available to the window so that we can access global variables
// from the JavaScript console (for debugging purposes)
declare global {
    interface Window {
        globals: Globals;
    }
}
if (typeof window !== 'undefined') {
    window.globals = globals;
}
