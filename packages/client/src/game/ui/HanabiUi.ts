// The object that comprises the entire game UI. It is re-created every time when going into a new
// game (and destroyed when going to the lobby).

import { Screen } from "../../lobby/types/Screen.ts";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import * as gameSession from "../gameSession.ts";
import { unmountClueLog } from "./clueLog/mountClueLog.tsx";
import { STAGE_ASPECT_RATIO } from "./constants.ts";
import * as cursor from "./cursor.ts";
import { drawUi } from "./drawUi.ts";
import * as keyboard from "./keyboard.ts";
import * as cardsView from "./reactive/views/cardsView.ts";
import * as cluesView from "./reactive/views/cluesView.ts";
import { setGlobalEmpathy } from "./setGlobalEmpathy.ts";
import * as timer from "./timer.ts";
import { globals, releaseSubscriptions } from "./UiGlobals.ts";

export class HanabiUi {
  private readonly resizeHandler: () => void;
  private readonly themeChangeHandler: () => void;
  private resizeRequestAnimationFrame: number | undefined = undefined;
  private resizeFrame = 0;
  private lastResizeEventFrame = 0;
  private liveResizeActive = false;
  private liveResizeBaseWidth = 0;
  private liveResizeBaseHeight = 0;
  private liveResizeScale = 1;

  /** Stops drawing the clocks. */
  private readonly stopDrawingTimers: () => void;

  constructor() {
    initStageSize();
    cursor.reset();
    this.stopDrawingTimers = timer.init();

    // Add a window resize listener.
    this.resizeHandler = () => {
      if (
        store.getState().session.screen !== Screen.Game
        || gameSession.isLoading()
      ) {
        return;
      }

      if (!this.liveResizeActive) {
        tooltips.closeAllTooltips();
        globals.isResizing = true;
        globals.animateFast = true;
        this.liveResizeActive = true;
        this.liveResizeBaseWidth = globals.stage.width();
        this.liveResizeBaseHeight = globals.stage.height();
        this.liveResizeScale = 1;
        this.resizeFrame = 0;
        this.lastResizeEventFrame = 0;
        this.scheduleResizeFrame();
      }

      this.lastResizeEventFrame = this.resizeFrame;
    };

    // On mobile, only trigger a resize when the screen orientation changes (when the user turns
    // their phone). This is a compromise to avoid resizes that occur when editing a note, which
    // shows on-screen keyboard, causing a resize event, then causing the tooltip to close.
    if ("ontouchstart" in document.documentElement) {
      window.screen.orientation.addEventListener("change", this.resizeHandler);
    } else {
      window.addEventListener("resize", this.resizeHandler);
    }

    // Rebuild the UI when the theme changes so that the canvas elements are redrawn with the new
    // colors.
    this.themeChangeHandler = () => {
      if (
        store.getState().session.screen !== Screen.Game
        || gameSession.isLoading()
        || this.liveResizeActive
      ) {
        return;
      }
      this.rebuildGameUi();
    };
    document.addEventListener("theme_change", this.themeChangeHandler);

    // The HanabiUi object is now instantiated, but none of the actual UI elements are drawn yet. We
    // must wait for the reply to "gameInitLoad" from the server in order to know how many players
    // are in the game and what the variant is. Only then can we start drawing the UI.
  }

  private scheduleResizeFrame(): void {
    this.resizeRequestAnimationFrame = requestAnimationFrame(() => {
      this.resizeRequestAnimationFrame = undefined;
      this.resizeFrame++;

      this.applyLiveResizeScale();

      if (
        this.resizeFrame - this.lastResizeEventFrame
        >= RESIZE_SETTLE_FRAMES
      ) {
        this.finishResize();
        return;
      }

      this.scheduleResizeFrame();
    });
  }

  private applyLiveResizeScale(): void {
    const dims = getStageSize(window.innerWidth, window.innerHeight);
    const scaleFromWidth =
      this.liveResizeBaseWidth === 0
        ? 1
        : dims.width / this.liveResizeBaseWidth;
    const scaleFromHeight =
      this.liveResizeBaseHeight === 0
        ? 1
        : dims.height / this.liveResizeBaseHeight;
    const stageScale = Math.min(scaleFromWidth, scaleFromHeight);

    if (stageScale === this.liveResizeScale) {
      return;
    }
    this.liveResizeScale = stageScale;

    // Use compositor scaling during drag for smoother resize; rebuild at settle for crisp layout.
    const stageContainer = globals.stage.container();
    stageContainer.style.transformOrigin = "top left";
    stageContainer.style.willChange = "transform";
    stageContainer.style.transform = `scale(${stageScale})`;
  }

  /**
   * Rebuilds the entire game UI from scratch, redrawing every element (e.g. so that canvas elements
   * pick up new theme colors or the new stage size).
   */
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  private rebuildGameUi(): void {
    const stageContainer = globals.stage.container();
    stageContainer.style.transform = "";
    stageContainer.style.transformOrigin = "";
    stageContainer.style.willChange = "";

    // Snap back before rebuilding at the new native size.
    globals.stage.scale({
      x: 1,
      y: 1,
    });
    globals.stage.position({
      x: 0,
      y: 0,
    });
    initStageSize();

    // We must also clear the card-related globals or else we will have duplicates.
    const { visibleState } = globals.state;
    globals.deck = [];
    globals.stackBases = [];
    for (const unsubscribe of globals.cardSubscriptions) {
      unsubscribe();
    }
    globals.cardSubscriptions = [];

    drawUi();

    // Re-subscribe the cards to the state store.
    if (visibleState !== undefined) {
      cardsView.onCardsPossiblyAdded(visibleState.deck.length);
    }

    // Re-register the state observers to bind them to the new UI elements.
    if (
      globals.stateObserver !== undefined
      && store.getState().game.current !== undefined
    ) {
      globals.stateObserver.registerObservers();
    }
    cluesView.refreshArrows(false);

    globals.layers.UI.draw();
    globals.layers.timer.draw();
    globals.layers.card.draw();
    globals.layers.UI2.draw();
    globals.layers.arrow.draw();
    // The timers were drawn again, so show the clocks on them.
    timer.draw();
  }

  private finishResize(): void {
    this.rebuildGameUi();

    this.liveResizeActive = false;
    globals.isResizing = false;
    globals.animateFast = false;
  }

  // The following methods are called from various parent functions.

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  updateChatLabel(): void {
    if (globals.elements.chatButton === undefined) {
      return;
    }

    let text = "";
    if (store.getState().gameChat.zen) {
      // eslint-disable-next-line complete/require-ascii
      text += "☯️";
    } else {
      // eslint-disable-next-line complete/require-ascii
      text += "💬";
      const { unread } = store.getState().gameChat;
      if (unread > 0) {
        text += ` (${unread})`;
      }
    }

    globals.elements.chatButton.text(text);
    globals.layers.UI.batchDraw();
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  focusLost(): void {
    setGlobalEmpathy(false);
    cursor.set("default");
  }

  destroy(): void {
    window.removeEventListener("resize", this.resizeHandler);
    window.screen.orientation.removeEventListener("change", this.resizeHandler);
    document.removeEventListener("theme_change", this.themeChangeHandler);
    if (this.resizeRequestAnimationFrame !== undefined) {
      cancelAnimationFrame(this.resizeRequestAnimationFrame);
      this.resizeRequestAnimationFrame = undefined;
    }
    releaseSubscriptions();
    unmountClueLog();
    keyboard.destroy();
    this.stopDrawingTimers();
    globals.elements.restartWaitingOnServerAnimation?.stop();
    globals.stage.destroy();
  }
}

/** The number of full frames with no resize events to wait for before rebuilding the stage. */
const RESIZE_SETTLE_FRAMES = 2;

/** The stage seems to break for widths of around 235 px or less. */
const MIN_STAGE_WIDTH = 240;

/** A stage that would fill at least this fraction of the window is stretched to fill it exactly. */
const FILL_WINDOW_FRACTION = 0.98;

// Initialize and size the stage depending on the window size.
function initStageSize() {
  const size = getStageSize(window.innerWidth, window.innerHeight);
  globals.stage.width(size.width);
  globals.stage.height(size.height);
}

function getStageSize(
  windowWidth: number,
  windowHeight: number,
): { width: number; height: number } {
  const ww = Math.max(windowWidth, MIN_STAGE_WIDTH);
  const wh = Math.max(windowHeight, MIN_STAGE_WIDTH / STAGE_ASPECT_RATIO);

  let width: number;
  let height: number;
  if (ww < wh * STAGE_ASPECT_RATIO) {
    width = ww;
    height = ww / STAGE_ASPECT_RATIO;
  } else {
    height = wh;
    width = wh * STAGE_ASPECT_RATIO;
  }

  width = Math.floor(width);
  height = Math.floor(height);

  if (width > FILL_WINDOW_FRACTION * ww) {
    width = ww;
  }
  if (height > FILL_WINDOW_FRACTION * wh) {
    height = wh;
  }

  return {
    width,
    height,
  };
}
