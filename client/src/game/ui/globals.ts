// This object contains global variables for the game UI
// Every class variable must also be reset in the "reset()" function

// Imports
import Konva from 'konva';
import { Globals as LobbyGlobals } from '../../globals';
import { VARIANTS } from '../data/gameData';
import { GameExports } from '../main';
import { Action } from '../types/actions';
import { ClientAction } from '../types/ClientAction';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import Options from '../types/Options';
import { SimpleCard } from '../types/SimpleCard';
import StackDirection from '../types/StackDirection';
import State from '../types/State';
import Variant from '../types/Variant';
import Elements from './Elements';
import HanabiCard from './HanabiCard';
import Layers from './Layers';
import LearnedCard from './LearnedCard';
import Loader from './Loader';
import SpectatorNote from './SpectatorNote';

export class Globals {
  // Objects sent upon UI initialization
  lobby: LobbyGlobals = new LobbyGlobals();
  game: GameExports | null = null;
  loading: boolean = true;

  // Game settings
  // (sent in the "init" message)
  playerNames: string[] = [];
  variant: Variant = VARIANTS.get(DEFAULT_VARIANT_NAME)!;
  playerUs: number = -1;
  spectating: boolean = false;
  replay: boolean = false; // True if in a solo replay or a shared replay
  sharedReplay: boolean = false;
  databaseID: number = 0;
  seed: string = '';
  seeded: boolean = false;
  datetimeStarted: Date = new Date();
  datetimeFinished: Date = new Date();

  // Optional game settings
  // (sent in the "init" message)
  options: Options = new Options();

  // Character settings
  characterAssignments: string[] = [];
  characterMetadata: number[] = [];
  characterRememberedCards: SimpleCard[] = [];

  // Game constants (set upon first initialization)
  deck: HanabiCard[] = [];
  stackBases: HanabiCard[] = [];
  cardsMap: Map<string, number> = new Map<string, number>();

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
  stackDirections: StackDirection[] = [];
  numCardsPlayed: number = 0; // For "Throw It in a Hole" variants

  // UI elements
  ImageLoader: Loader | null = null;
  stage: Konva.Stage = new Konva.Stage({ container: 'game' });
  layers: Layers = new Layers();
  elements: Elements = new Elements();
  activeHover: Konva.Node | null = null; // The element that the mouse cursor is currently over
  cardImages: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();
  scaledCardImages: Map<string, HTMLCanvasElement[]> = new Map<string, HTMLCanvasElement[]>();

  // Replay feature
  inReplay: boolean = false; // Whether or not the replay controls are currently showing
  replayLog: Action[] = []; // Contains all of the "action" messages for the game
  replayPos: number = 0; // The current index of the "globals.replayLog" array
  replayTurn: number = 0; // The current game turn
  replayMax: number = 0; // The maximum turn recorded so fast
  // Used to keep track of when the game ends (before the "gameOver" command has arrived)
  gameOver: boolean = false;
  finalReplayPos: number = 0;
  finalReplayTurn: number = 0;
  // In replays, we can show information about a card that was not known at the time,
  // but is known now; these are cards we have "learned"
  learnedCards: LearnedCard[] = [];
  deckOrder: SimpleCard[] = []; // Sent when the game ends

  // Shared replay feature
  sharedReplayLeader: string = ''; // Equal to the username of the leader
  amSharedReplayLeader: boolean = false;
  sharedReplayTurn: number = -1;
  useSharedTurns: boolean = false;
  sharedReplayLoading: boolean = false; // This is used to not animate cards when loading in
  hypothetical: boolean = false; // Whether or not we are in a hypothetical
  hypoActions: Action[] = []; // An array of the actions in the current hypothetical
  hypoRevealed: boolean = true; // Whether or not drawn cards should be revealed when drawn
  hypoFirstDrawnIndex: number = 0; // The index of the first card drawn in a hypothetical

  // Notes feature
  ourNotes: string[] = []; // Indexed by card order
  // An array containing objects, indexed by card order;
  // It represents the notes of every player & spectator
  allNotes: SpectatorNote[][] = [];
  // Used to keep track of which card the user is editing;
  // users can only update one note at a time to prevent bugs
  // Equal to the card order number or null
  editingNote: number | null = null;
  // Equal to true if something happened when the note box happens to be open
  actionOccured: boolean = false;
  lastNote: string = ''; // Equal to the last note entered

  // Timer feature
  timerID: number | null = null;
  playerTimes: number[] = [];
  // "activeIndex" must be tracked separately from the "currentPlayerIndex" because
  // the current player may change in an in-game replay
  activeIndex: number = -1;
  timeTaken: number = 0;
  startingTurnTime: number = 0;
  lastTimerUpdateTimeMS: number = 0;

  // Pre-move feature
  queuedAction: ClientAction | null = null;
  preCluedCardOrder: number | null = null;

  // Pause feature
  paused: boolean = false; // Whether or not the game is currently paused
  pausePlayer: string = ''; // The name of the player who paused the game
  pauseQueued: boolean = false; // Whether or not we have requested a queued pause

  // Miscellaneous
  animateFast: boolean = true;
  // A function called after an action from the server moves cards
  postAnimationLayout: (() => void) | null = null;
  UIClickTime: number = 0; // Used to prevent accidental double clicks
  spectators: string[] = [];
  chatUnread: number = 0;

  // State information
  state: State = new State(this.variant, this.playerNames.length); // The current state
  states: State[] = []; // The state for each turn

  // We provide a method to reset every class variable to its initial value
  // This is called when the user goes into a new game
  // We cannot just create a new instantiation of the class,
  // because then the references in the other files would point to the outdated version
  reset() {
    this.lobby = new LobbyGlobals();
    this.game = null;
    this.loading = true;
    this.playerNames = [];
    this.variant = VARIANTS.get(DEFAULT_VARIANT_NAME)!;
    this.playerUs = -1;
    this.spectating = false;
    this.replay = false;
    this.sharedReplay = false;
    this.databaseID = 0;
    this.seed = '';
    this.datetimeStarted = new Date();
    this.datetimeFinished = new Date();
    this.options = new Options();
    this.characterAssignments = [];
    this.characterMetadata = [];
    this.characterRememberedCards = [];
    this.deck = [];
    this.stackBases = [];
    this.cardsMap = new Map<string, number>();
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
    this.numCardsPlayed = 0;
    this.ImageLoader = null;
    this.stage = new Konva.Stage({ container: 'game' });
    this.layers = new Layers();
    this.elements = new Elements();
    this.activeHover = null;
    this.cardImages = new Map<string, HTMLCanvasElement>();
    this.scaledCardImages = new Map<string, HTMLCanvasElement[]>();
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
    this.hypoRevealed = true;
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
    this.preCluedCardOrder = 0;
    this.paused = false;
    this.pausePlayer = '';
    this.pauseQueued = false;
    this.animateFast = true;
    this.postAnimationLayout = null;
    this.UIClickTime = 0;
    this.spectators = [];
    this.chatUnread = 0;
    this.state = new State(this.variant, this.playerNames.length);
    this.states = [];
    this.deckOrder = [];
  }
}

const globals = new Globals();
export default globals;

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
