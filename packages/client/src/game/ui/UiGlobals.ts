import type { GameMetadata, Options, Variant } from "@hanabi-live/game";
import { ReadonlyMap } from "complete-common";
import Konva from "konva";
import { store } from "../../store.ts";
import type { GameTooltipName } from "../../tooltips.ts";
import { currentState, currentVariant } from "../gameSession.ts";
import { gameCleared } from "../gameSlice.ts";
import type { State } from "../types/State.ts";
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
  private stageInstance: Konva.Stage | undefined = undefined;

  // Game constants (set upon first initialization).
  deck: HanabiCard[] = [];
  stackBases: HanabiCard[] = [];

  // UI elements
  layers: Layers = new Layers();
  elements: Elements = new Elements();

  /** The element that the mouse cursor is currently over. */
  activeHover: Konva.Node | undefined = undefined;

  cardImages = new ReadonlyMap<string, HTMLCanvasElement>();
  scaledCardImages = new Map<string, HTMLCanvasElement[]>();

  /**
   * Used to keep track of which card the user is editing. Users can only update one note at a time
   * to prevent bugs. Equal to the name of the card's tooltip or undefined.
   */
  editingNote: GameTooltipName | undefined = undefined;

  /** Equal to true if something happened when the note box happens to be open. */
  actionOccurred = false;

  // Miscellaneous
  animateFast = true;

  /** Used to prevent accidental double clicks. */
  uiClickTime = 0;

  globalEmpathyEnabled = false;

  /** Whether the global empathy view also applies our notes (Ctrl + Space). */
  globalEmpathyIncludesNotes = false;

  isResizing = false;

  // State information
  stateObserver: StateObserver | undefined = undefined;
  cardSubscriptions: Array<() => void> = [];

  /** The classic screen's canvas, made when the classic screen first uses it. */
  get stage(): Konva.Stage {
    this.stageInstance ??= newStage();
    return this.stageInstance;
  }

  /** The game's state, which exists once the server has answered "gameInitLoad". */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- It reads the store.
  get state(): State {
    return currentState();
  }

  get metadata(): GameMetadata {
    return this.state.metadata;
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- It reads the store.
  get variant(): Variant {
    return currentVariant();
  }

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

/** Stops the classic screen's views from observing the game's state. */
export function releaseSubscriptions(): void {
  globals.stateObserver?.unregisterObservers();
  for (const unsubscribeFunc of globals.cardSubscriptions) {
    unsubscribeFunc();
  }
  globals.cardSubscriptions = [];
}

/**
 * Releases the previous game's subscriptions and state, and replaces the globals for a new game.
 */
export function resetGlobals(): void {
  releaseSubscriptions();
  store.dispatch(gameCleared());
  globals = new UiGlobals();
  // eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-global-object-property-assignment
  window.globals = globals;
}

// Also make the globals available to the window (so that we can access them from the JavaScript
// console for debugging purposes).
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    globals: UiGlobals;
  }
}
// eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-global-object-property-assignment
window.globals = globals;
