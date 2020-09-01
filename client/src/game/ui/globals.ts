// This object contains global variables for the game UI
// Every class variable must also be reset in the "reset()" function

import Konva from 'konva';
import * as Redux from 'redux';
import { Globals as LobbyGlobals } from '../../globals';
import Loader from '../../Loader';
import { VARIANTS } from '../data/gameData';
import { GameExports } from '../main';
import { GameAction, Action } from '../types/actions';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import SpectatorNote from '../types/SpectatorNote';
import State from '../types/State';
import Variant from '../types/Variant';
import * as cursor from './cursor';
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

  // Game constants (set upon first initialization)
  deck: HanabiCard[] = [];
  stackBases: HanabiCard[] = [];

  // UI elements
  imageLoader: Loader | null = null;
  stage: Konva.Stage = new Konva.Stage({
    container: 'game',
    listening: false,
  });

  layers: Layers = new Layers();
  elements: Elements = new Elements();
  activeHover: Konva.Node | null = null; // The element that the mouse cursor is currently over
  cardImages: Map<string, HTMLCanvasElement> = new Map<string, HTMLCanvasElement>();
  scaledCardImages: Map<string, HTMLCanvasElement[]> = new Map<string, HTMLCanvasElement[]>();

  // Replay feature
  replayLog: GameAction[] = []; // Contains all of the "action" messages for the game
  finalReplayPos: number = 0;
  finalReplayTurn: number = 0;

  // Notes feature
  ourNotes: Map<number, string> = new Map<number, string>(); // Indexed by card order
  // "allNotes" is indexed by card order
  // It represents the notes of every player & spectator
  allNotes: Map<number, SpectatorNote[]> = new Map<number, SpectatorNote[]>();
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
  // Legacy variable, kill this and use state.currentPlayerIndex instead
  activePlayerIndex: number = -1;
  timeTaken: number = 0;
  startingTurnTime: number = 0;
  lastTimerUpdateTimeMS: number = 0;

  // Miscellaneous
  animateFast: boolean = true;
  UIClickTime: number = 0; // Used to prevent accidental double clicks
  globalEmpathyEnabled: boolean = false;

  // State information
  store: Redux.Store<State, Action> | null = null;
  stateObserver: StateObserver | null = null;
  cardSubscriptions: Redux.Unsubscribe[] = [];
  cardIdentitySubscriptions: Redux.Unsubscribe[] = [];

  get state() {
    return this.store!.getState();
  }

  get metadata() {
    return this.state.metadata;
  }

  // The variant of the current game is stored in the state metadata as a string
  // Provide a helper for the variant object that corresponds to this
  // (initialized in the "initStateStore()" function)
  variant: Variant = VARIANTS.get(DEFAULT_VARIANT_NAME)!;

  get options() {
    return this.state.metadata.options;
  }

  // We provide a method to reset every class variable to its initial value
  // This is called when the user goes into a new game
  // We cannot just create a new instantiation of the class,
  // because then the references in the other files would point to the outdated version
  reset() {
    this.lobby = new LobbyGlobals();
    this.game = null;
    this.loading = true;
    this.variant = VARIANTS.get(DEFAULT_VARIANT_NAME)!;
    this.deck = [];
    this.stackBases = [];
    this.imageLoader = null;
    this.stage = new Konva.Stage({
      container: 'game',
      listening: true,
    });
    this.stage.on('mouseenter mouseleave', () => {
      cursor.set('default');
    });
    this.layers = new Layers();
    this.elements = new Elements();
    this.activeHover = null;
    this.cardImages = new Map<string, HTMLCanvasElement>();
    this.scaledCardImages = new Map<string, HTMLCanvasElement[]>();
    this.replayLog = [];
    this.finalReplayPos = 0;
    this.finalReplayTurn = 0;
    this.ourNotes.clear();
    this.allNotes.clear();
    this.editingNote = null;
    this.actionOccurred = false;
    this.lastNote = '';
    this.timerID = null;
    this.playerTimes = [];
    this.activePlayerIndex = -1; // Legacy variable
    this.timeTaken = 0;
    this.startingTurnTime = 0;
    this.lastTimerUpdateTimeMS = 0;
    this.animateFast = true;
    this.UIClickTime = 0;
    this.globalEmpathyEnabled = false;

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
if (window !== undefined) {
  window.globals = globals;
}
