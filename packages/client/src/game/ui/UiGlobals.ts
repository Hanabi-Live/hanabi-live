import type { ServerCommandData } from "@hanabi-live/data";
import type {
  GameAction,
  GameMetadata,
  Options,
  PlayerIndex,
} from "@hanabi-live/game";
import { getDefaultVariant } from "@hanabi-live/game";
import { ReadonlyMap } from "complete-common";
import Konva from "konva";
import type * as Redux from "redux";
import { Globals as LobbyGlobals } from "../../Globals.ts";
import type { Loader } from "../../Loader.ts";
import type { GameTooltipName } from "../../tooltips.ts";
import type { GameExports } from "../main.ts";
import type { State } from "../types/State.ts";
import type { Action } from "../types/actions.ts";
import { Elements } from "./Elements.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import { Layers } from "./Layers.ts";
import * as cursor from "./cursor.ts";
import type { StateObserver } from "./reactive/StateObserver.ts";

// Konva 9 moved text lower within its bounds; keep the positions that the layout was designed for.
Konva.legacyTextRendering = true;

/**
 * This object contains global variables for the game UI. Each game gets a new instance from
 * "resetGlobals()".
 */
export class UiGlobals {
  // Objects sent upon UI initialization.
  lobby: LobbyGlobals = new LobbyGlobals();
  game: GameExports | undefined = undefined;

  /**
   * The UI is instantiated before all the images are necessarily downloaded and before we know
   * enough information to draw all the UI elements.
   */
  loading = true;

  // Game constants (set upon first initialization).
  deck: HanabiCard[] = [];
  stackBases: HanabiCard[] = [];

  // UI elements
  imageLoader: Loader | undefined = undefined;
  stage: Konva.Stage = newStage();

  layers: Layers = new Layers();
  elements: Elements = new Elements();

  /** The element that the mouse cursor is currently over. */
  activeHover: Konva.Node | undefined = undefined;

  cardImages = new ReadonlyMap<string, HTMLCanvasElement>();
  scaledCardImages = new Map<string, HTMLCanvasElement[]>();

  // Replay feature

  /** Contains all of the "gameEvent" messages for the game. */
  replayLog: GameAction[] = [];

  /**
   * Used to keep track of which card the user is editing. Users can only update one note at a time
   * to prevent bugs. Equal to the name of the card's tooltip or undefined.
   */
  editingNote: GameTooltipName | undefined = undefined;

  /** Equal to true if something happened when the note box happens to be open. */
  actionOccurred = false;

  lastNote = ""; // Equal to the last note entered

  // Timer feature
  timerId: number | undefined = undefined;
  playerTimes: number[] = [];

  /**
   * The player whose clock is running, from the last "clock" message. `undefined` when no clock is
   * running. It indexes `playerTimes` from the same message, so it is not read from the game state.
   */
  clockPlayerIndex: PlayerIndex | undefined = undefined;

  timeTaken = 0;
  startingTurnTime = 0;
  lastTimerUpdateTimeMs = 0;

  // Miscellaneous
  animateFast = true;

  /** Used to prevent accidental double clicks. */
  uiClickTime = 0;

  restartPending = false;

  /** The votes to end the game, as the server last sent them. */
  terminationVotes: ServerCommandData["gameState"]["votes"] = undefined;

  globalEmpathyEnabled = false;

  /** Whether the global empathy view also applies our notes (Ctrl + Space). */
  globalEmpathyIncludesNotes = false;

  isResizing = false;

  /**
   * Whether the game started just now, so its first state should play the turn sound. It is false
   * after a refresh or when joining a game in progress.
   */
  playStartSound = false;

  // State information
  store: Redux.Store<State, Action> | undefined = undefined;
  stateObserver: StateObserver | undefined = undefined;
  cardSubscriptions: Redux.Unsubscribe[] = [];

  get state(): State {
    return this.store!.getState();
  }

  get metadata(): GameMetadata {
    return this.state.metadata;
  }

  /**
   * The variant of the current game is stored in the state metadata as a string. Provide a helper
   * for the variant object that corresponds to this (initialized in the "initStateStore()"
   * function).
   */
  variant = getDefaultVariant();

  get options(): Options {
    return this.state.metadata.options;
  }
}

function newStage(): Konva.Stage {
  const stage = new Konva.Stage({
    container: "game",
    listening: true,
  });
  stage.on("mouseenter mouseleave", () => {
    cursor.set("default");
  });

  return stage;
}

// Importers read this live binding, so they see the new object after "resetGlobals()".
// eslint-disable-next-line import-x/no-mutable-exports -- "resetGlobals()" replaces it for each game.
export let globals = new UiGlobals();

/** Releases the previous game's subscriptions and replaces the globals for a new game. */
export function resetGlobals(): void {
  globals.stateObserver?.unregisterObservers();
  for (const unsubscribeFunc of globals.cardSubscriptions) {
    unsubscribeFunc();
  }

  globals = new UiGlobals();
  window.globals = globals; // eslint-disable-line unicorn/prefer-global-this
}

// Also make the globals available to the window (so that we can access them from the JavaScript
// console for debugging purposes).
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    globals: UiGlobals;
  }
}
window.globals = globals; // eslint-disable-line unicorn/prefer-global-this
