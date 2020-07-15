// This object contains global variables for the game UI
// Every class variable must also be reset in the "reset()" function

import Konva from 'konva';
import * as Redux from 'redux';
import { Globals as LobbyGlobals } from '../../globals';
import Loader from '../../Loader';
import { VARIANTS } from '../data/gameData';
import { GameExports } from '../main';
import { GameAction, ActionIncludingHypothetical, Action } from '../types/actions';
import CardIdentity from '../types/CardIdentity';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import Options from '../types/Options';
import SpectatorNote from '../types/SpectatorNote';
import StackDirection from '../types/StackDirection';
import State from '../types/State';
import Variant from '../types/Variant';
import Elements from './Elements';
import HanabiCard from './HanabiCard';
import Layers from './Layers';
import StateObserver from './reactive/StateObserver';

export class Globals {
  // Objects sent upon UI initialization
  lobby: LobbyGlobals = new LobbyGlobals();
  game: GameExports | null = null;

  // The UI is instantiated before all the images are necessarily downloaded
  // and before we know enough information to draw all the UI elements
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
  characterAssignments: Array<number | null> = [];
  characterMetadata: number[] = [];
  characterRememberedCards: CardIdentity[] = [];

  // Game constants (set upon first initialization)
  deck: HanabiCard[] = [];
  stackBases: HanabiCard[] = [];

  // Game state variables (reset when rewinding in a replay)
  turn: number = 0;
  currentPlayerIndex: number | null = 0;
  ourTurn: boolean = false;
  deckSize: number = 0;
  playStackDirections: StackDirection[] = [];

  // UI elements
  imageLoader: Loader | null = null;
  stage: Konva.Stage = new Konva.Stage({ container: 'game' });
  layers: Layers = new Layers();
  elements: Elements = new Elements();
  activeHover: Konva.Node | null = null; // The element that the mouse cursor is currently over
  cardImages: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();
  scaledCardImages: Map<string, HTMLCanvasElement[]> = new Map<string, HTMLCanvasElement[]>();

  // Replay feature
  inReplay: boolean = false; // Whether or not the replay controls are currently showing
  replayLog: GameAction[] = []; // Contains all of the "action" messages for the game
  replayPos: number = 0; // The current index of the "globals.replayLog" array
  replayTurn: number = 0; // The current game turn
  // Used to keep track of when the game ends (before the "gameOver" command has arrived)
  gameOver: boolean = false;
  finalReplayPos: number = 0;
  finalReplayTurn: number = 0;

  // Shared replay feature
  sharedReplayLeader: string = ''; // Equal to the username of the leader
  amSharedReplayLeader: boolean = false;
  sharedReplayTurn: number = -1;
  useSharedTurns: boolean = false;
  sharedReplayLoading: boolean = false; // This is used to not animate cards when loading in
  hypothetical: boolean = false; // Whether or not we are in a hypothetical
  hypoActions: ActionIncludingHypothetical[] = []; // Actions in the current hypothetical
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
  actionOccurred: boolean = false;
  lastNote: string = ''; // Equal to the last note entered

  // Timer feature
  timerID: number | null = null;
  playerTimes: number[] = [];
  // "activeIndex" must be tracked separately from the "currentPlayerIndex" because
  // the current player may change in an in-game replay
  activeIndex: number = -1; // Legacy variable, kill this and use state.currentPlayerIndex instead
  timeTaken: number = 0;
  startingTurnTime: number = 0;
  lastTimerUpdateTimeMS: number = 0;

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

  // State information
  store: Redux.Store<State, Action> | null = null;
  stateObserver: StateObserver | null = null;
  cardSubscriptions: Redux.Unsubscribe[] = [];
  cardIdentitySubscriptions: Redux.Unsubscribe[] = [];

  // TEMP: accessors to minimize churn while we don't re-architect user input
  get clues() {
    return this.store!.getState().visibleState!.clueTokens!;
  }

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
    this.turn = 0;
    this.currentPlayerIndex = 0;
    this.ourTurn = false;
    this.deckSize = 0;
    this.playStackDirections = [];
    this.imageLoader = null;
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
    this.gameOver = false;
    this.finalReplayPos = 0;
    this.finalReplayTurn = 0;
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
    this.actionOccurred = false;
    this.lastNote = '';
    this.timerID = null;
    this.playerTimes = [];
    this.activeIndex = -1; // Legacy variable
    this.timeTaken = 0;
    this.startingTurnTime = 0;
    this.lastTimerUpdateTimeMS = 0;
    this.paused = false;
    this.pausePlayer = '';
    this.pauseQueued = false;
    this.animateFast = true;
    this.postAnimationLayout = null;
    this.UIClickTime = 0;
    this.spectators = [];

    this.stateObserver?.unregisterObservers();
    this.stateObserver = null;
    this.cardSubscriptions.forEach((u: Redux.Unsubscribe) => u());
    this.cardSubscriptions = [];
    this.store = null;
  }
}

const globals = new Globals();
export default globals;

// Allow TypeScript to modify the browser's "window" object
declare global {
  interface Window {
    globals: Globals;
  }
}

// Make the globals available from the JavaScript console (for debugging purposes)
if (typeof window !== 'undefined') {
  window.globals = globals;
}
