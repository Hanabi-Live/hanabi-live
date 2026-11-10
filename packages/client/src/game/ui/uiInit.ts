import { assertDefined } from "complete-common";
import Konva from "konva";
import * as modals from "../../modals";
import { getCanvasColors } from "../../theme";
import { globals } from "./UIGlobals";
import { LABEL_COLOR, RANK_FONT_FAMILY, STROKE_WIDTH_UNIT } from "./constants";
import { drawCards } from "./drawCards";
import * as drawCardsBrowser from "./drawCardsBrowser";
import { drawUI } from "./drawUI";
import * as keyboard from "./keyboard";

/**
 * The labels of the loading screen, in fractions of the stage height. Their height is also their
 * font size, and the progress count sits below the loading label.
 */
const LOADING_LABEL = {
  h: 0.05,
  loadingY: 0.7,
  progressY: 0.8,
} as const;

// When the HanabiUI object is instantiated, we do not know how many players are in the game or what
// the variant is. Now that the server has sent us that information, we can initialize the UI.
export function uiInit(): void {
  assertDefined(
    globals.lobby.imageLoader,
    "Failed to find the image loader when initializing the user interface.",
  );

  // Once the initial page (e.g. the login screen / lobby) is finished loading and ready, all of the
  // images relating to the game screen start to get pre-loaded by the "Loader" class. Copy the
  // reference to the existing "Loader" object to our UI globals (for convenience).
  globals.imageLoader = globals.lobby.imageLoader;

  if (globals.imageLoader.failed) {
    showImageLoadError([...globals.imageLoader.failedFiles][0]!);
    return;
  }

  if (globals.imageLoader.finished) {
    // The user has spent enough time in the lobby before joining a game such that all of the
    // game-related images have had time to fully download. This means we do not have to show the
    // loading screen; skip directly to the next step.
    finishedDownloadingImages();
    return;
  }

  // We have joined a game very soon after reaching the lobby, so there has not been enough time for
  // all of the game-related images to be downloaded. Show the loading screen so that the user can
  // see how many images are left to download.

  // The Loader object was not instantiated without a progress callback or a finished callback, so
  // attach those now.
  globals.imageLoader.progressCallback = (done: number, total: number) => {
    progressLabel.text(`${done}/${total}`);
    loadingLayer.batchDraw();
  };
  globals.imageLoader.finishedCallback = finishedDownloadingImages;
  globals.imageLoader.failedCallback = showImageLoadError;

  const winW = globals.stage.width();
  const winH = globals.stage.height();

  // Draw the loading screen.
  const loadingLayer = new Konva.Layer({
    listening: false,
  });

  const labelHeight = LOADING_LABEL.h * winH;
  const labelConfig = {
    fill: LABEL_COLOR,
    stroke: getCanvasColors().loadingLabelStroke,
    strokeWidth: STROKE_WIDTH_UNIT * winH,
    align: "center",
    x: 0,
    width: winW,
    height: labelHeight,
    fontFamily: RANK_FONT_FAMILY,
    fontStyle: "bold",
    fontSize: labelHeight,
    listening: false,
  } as const;

  const loadingLabel = new Konva.Text({
    ...labelConfig,
    text: "Loading...",
    y: LOADING_LABEL.loadingY * winH,
  });
  loadingLayer.add(loadingLabel);

  const progressLabel = new Konva.Text({
    ...labelConfig,
    text: "0 / 0",
    y: LOADING_LABEL.progressY * winH,
  });
  loadingLayer.add(progressLabel);

  globals.stage.add(loadingLayer);

  // Images may have loaded before this UI subscribed to progress updates.
  globals.imageLoader.progress();
}

function showImageLoadError(filePath: string) {
  modals.showError(
    `Failed to download the game image "${filePath}". Please reload the page to retry.`,
  );
}

function finishedDownloadingImages() {
  // Build images for every card (with respect to the variant that we are playing and whether or not
  // we have the colorblind UI feature enabled).
  globals.cardImages = drawCards(
    globals.variant,
    globals.lobby.settings.colorblindMode,
    globals.lobby.settings.styleNumbers,
    true,
    drawCardsBrowser.cardRendererBackend,
  );

  // Draw the user interface.
  drawUI();

  // Keyboard hotkeys can only be initialized once the clue buttons are drawn.
  keyboard.init();

  // Tell the server that we are finished loading the UI and we now need the specific actions that
  // have taken place in this game so far.
  globals.lobby.conn!.send("getGameState", {
    tableID: globals.lobby.tableID,
  });
}
