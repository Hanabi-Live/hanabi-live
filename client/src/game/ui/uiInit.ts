import Konva from 'konva';
import { LABEL_COLOR } from '../../constants';
import * as deck from '../rules/deck';
import drawCards from './drawCards';
import drawUI from './drawUI';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as keyboard from './keyboard';

// When the HanabiUI object is instantiated,
// we do not know how many players are in the game or what the variant is
// Now that the server has sent us that information, we can initialize the UI
export default function uiInit() {
  if (globals.lobby.imageLoader === null) {
    throw new Error('The "globals.lobby.imageLoader" object was never instantiated upon reaching the "uiInit()" function.');
  }

  // Once the initial page (e.g. the login screen / lobby) is finished loading and ready,
  // all of the images relating to the game screen start to get pre-loaded by the "Loader" class
  // Copy the reference to the existing "Loader" object to our UI globals (for convenience)
  globals.imageLoader = globals.lobby.imageLoader;

  if (globals.imageLoader.finished) {
    // The user has spent enough time in the lobby before joining a game such that all of the
    // game-related images have had time to fully download
    // This means we do not have to show the loading screen; skip directly to the next step
    finishedDownloadingImages();
    return;
  }

  // We have joined a game very soon after reaching the lobby,
  // so there has not been enough time for all of the game-related images to be downloaded
  // Show the loading screen so that the user can see how many images are left to download

  // The Loader object was not instantiated without a progress callback or a finished callback,
  // so attach those now
  globals.imageLoader.progressCallback = (done: number, total: number) => {
    progressLabel.text(`${done}/${total}`);
    loadingLayer.batchDraw();
  };
  globals.imageLoader.finishedCallback = finishedDownloadingImages;

  // Local variables
  const winW = globals.stage.width();
  const winH = globals.stage.height();

  // Draw the loading screen
  const loadingLayer = new Konva.Layer({
    listening: false,
  });

  const loadingLabel = new Konva.Text({
    fill: LABEL_COLOR,
    stroke: '#747278',
    strokeWidth: 0.001056 * winH,
    text: 'Loading...',
    align: 'center',
    x: 0,
    y: 0.7 * winH,
    width: winW,
    height: 0.05 * winH,
    fontFamily: 'Arial',
    fontStyle: 'bold',
    fontSize: 0.05 * winH,
    listening: false,
  });
  loadingLayer.add(loadingLabel);

  const progressLabel = new Konva.Text({
    fill: LABEL_COLOR,
    stroke: '#747278',
    strokeWidth: 0.001056 * winH,
    text: '0 / 0',
    align: 'center',
    x: 0,
    y: 0.8 * winH,
    width: winW,
    height: 0.05 * winH,
    fontFamily: 'Arial',
    fontStyle: 'bold',
    fontSize: 0.05 * winH,
    listening: false,
  });
  loadingLayer.add(progressLabel);

  globals.stage.add(loadingLayer);
}

const finishedDownloadingImages = () => {
  // Build images for every card
  // (with respect to the variant that we are playing
  // and whether or not we have the colorblind UI feature enabled)
  globals.cardImages = drawCards(
    globals.variant,
    globals.lobby.settings.colorblindMode,
    globals.lobby.settings.styleNumbers,
  );

  // Build all of the reusable card objects
  initCards();

  // Draw the user interface
  drawUI();

  // Keyboard hotkeys can only be initialized once the clue buttons are drawn
  keyboard.init();

  // Tell the server that we are finished loading the UI and
  // we now need the specific actions that have taken place in this game so far
  globals.lobby.conn!.send('getGameInfo2', {
    tableID: globals.lobby.tableID,
  });
};

const initCards = () => {
  const deckSize = deck.totalCards(globals.variant);
  for (let order = 0; order < deckSize; order++) {
    // Create the notes for this card
    // (this must be done before creating the HanabiCard object)
    globals.ourNotes.push('');
    globals.allNotes.push([]);

    // Create the HanabiCard object
    const card = new HanabiCard({
      order,
    });
    globals.deck.push(card);
  }

  // Also create objects for the stack bases
  for (let i = 0; i < globals.variant.suits.length; i++) {
    globals.ourNotes.push('');
    globals.allNotes.push([]);
  }
};
