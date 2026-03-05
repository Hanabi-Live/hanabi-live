// The object that comprises the entire game UI. It is re-created every time when going into a new
// game (and destroyed when going to the lobby).

import type { Globals as LobbyGlobals } from "../../Globals";
import { Screen } from "../../lobby/types/Screen";
import * as tooltips from "../../tooltips";
import type { GameExports } from "../main";
import * as cursor from "./cursor";
import { drawUI } from "./drawUI";
import * as keyboard from "./keyboard";
import * as cardsView from "./reactive/views/cardsView";
import * as cluesView from "./reactive/views/cluesView";
import { setGlobalEmpathy } from "./setGlobalEmpathy";
import * as timer from "./timer";
import type { UIGlobals } from "./UIGlobals";
import { globals } from "./UIGlobals";

export class HanabiUI {
  globals: UIGlobals;
  private readonly resizeHandler: () => void;
  private resizeRAF: number | null = null;
  private resizeFrame = 0;
  private lastResizeEventFrame = 0;
  private liveResizeActive = false;
  private liveResizeBaseWidth = 0;
  private liveResizeBaseHeight = 0;
  private liveResizeScale = 1;

  constructor(lobby: LobbyGlobals, game: GameExports) {
    // Since the "HanabiUI" object is being reinstantiated, we need to explicitly reinitialize all
    // globals variables (or else they will retain their old values).
    globals.reset();

    // Expose the globals to functions in the "game" directory.
    this.globals = globals;

    // Store references to the parent objects for later use.
    globals.lobby = lobby; // This is the "Globals" object in the root of the "src" directory
    // We name it "lobby" here to distinguish it from the UI globals; after more refactoring, we
    // will eventually merge these objects to make it less confusing.
    globals.game = game; // This is the "gameExports" from the "/src/game/main.ts" file
    // We should also combine this with the UI object in the future.

    initStageSize();
    cursor.set("default");

    // Add a window resize listener.
    this.resizeHandler = () => {
      if (
        this.globals.lobby.currentScreen !== Screen.Game
        || this.globals.loading
      ) {
        return;
      }

      if (!this.liveResizeActive) {
        console.log("[resize-v4] css-scale during drag, rebuild on settle");
        tooltips.closeAllTooltips();
        this.globals.isResizing = true;
        this.globals.animateFast = true;
        this.liveResizeActive = true;
        this.liveResizeBaseWidth = this.globals.stage.width();
        this.liveResizeBaseHeight = this.globals.stage.height();
        this.liveResizeScale = 1;
        this.resizeFrame = 0;
        this.lastResizeEventFrame = 0;
        this.scheduleResizeFrame();
      }

      this.lastResizeEventFrame = this.resizeFrame;
    };
    window.addEventListener("resize", this.resizeHandler);

    // The HanabiUI object is now instantiated, but none of the actual UI elements are drawn yet. We
    // must wait for the "init" message from the server in order to know how many players are in the
    // game and what the variant is. Only then can we start drawing the UI.
  }

  // The following methods are called from various parent functions.

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  updateChatLabel(): void {
    if (globals.elements.chatButton === null) {
      return;
    }

    let text = "";
    if (globals.lobby.zenModeEnabled) {
      text += "☯️";
    } else {
      text += "💬";
      if (globals.lobby.chatUnread > 0) {
        text += ` (${globals.lobby.chatUnread})`;
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
    if (this.resizeRAF !== null) {
      cancelAnimationFrame(this.resizeRAF);
      this.resizeRAF = null;
    }
    keyboard.destroy();
    timer.stop();
    globals.stage.destroy();
  }

  private scheduleResizeFrame(): void {
    this.resizeRAF = requestAnimationFrame(() => {
      this.resizeRAF = null;
      this.resizeFrame++;

      this.applyLiveResizeScale();

      // Wait for two full frames with no resize events before rebuilding.
      if (this.resizeFrame - this.lastResizeEventFrame >= 2) {
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
    const stageContainer = this.globals.stage.container();
    stageContainer.style.transformOrigin = "top left";
    stageContainer.style.willChange = "transform";
    stageContainer.style.transform = `scale(${stageScale})`;
  }

  private finishResize(): void {
    const stageContainer = this.globals.stage.container();
    stageContainer.style.transform = "";
    stageContainer.style.transformOrigin = "";
    stageContainer.style.willChange = "";

    // Snap back before rebuilding at the new native size.
    this.globals.stage.scale({ x: 1, y: 1 });
    this.globals.stage.position({ x: 0, y: 0 });
    initStageSize();

    // We must also clear the card-related globals or else we will have duplicates.
    const { visibleState } = this.globals.state;
    this.globals.deck = [];
    for (const unsubscribe of this.globals.cardSubscriptions) {
      unsubscribe();
    }
    this.globals.cardSubscriptions = [];

    drawUI();

    // Re-subscribe the cards to the state store.
    if (visibleState !== null) {
      cardsView.onCardsPossiblyAdded(visibleState.deck.length);
    }

    // Re-register the state observers to bind them to the new UI elements.
    if (this.globals.stateObserver !== null && this.globals.store !== null) {
      this.globals.stateObserver.registerObservers(this.globals.store);
    }
    cluesView.refreshArrows(false);

    this.globals.layers.UI.draw();
    this.globals.layers.timer.draw();
    this.globals.layers.card.draw();
    this.globals.layers.UI2.draw();
    this.globals.layers.arrow.draw();
    timer.resumeAfterResize();

    this.liveResizeActive = false;
    this.globals.isResizing = false;
    this.globals.animateFast = false;
  }
}

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
  const ratio = 16 / 9;

  let ww = windowWidth;
  let wh = windowHeight;

  if (ww < 240) {
    // The stage seems to break for widths of around 235 px or less.
    ww = 240;
  }
  if (wh < 135) {
    wh = 135;
  }

  let width: number;
  let height: number;
  if (ww < wh * ratio) {
    width = ww;
    height = ww / ratio;
  } else {
    height = wh;
    width = wh * ratio;
  }

  width = Math.floor(width);
  height = Math.floor(height);

  if (width > 0.98 * ww) {
    width = ww;
  }
  if (height > 0.98 * wh) {
    height = wh;
  }

  return {
    width,
    height,
  };
}
