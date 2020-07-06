import Konva from 'konva';
import { LABEL_COLOR } from '../../constants';
import * as deck from '../rules/deck';
import * as variantRules from '../rules/variant';
import { STACK_BASE_RANK } from '../types/constants';
import { suitToSuitIndex } from './convert';
import drawCards from './drawCards';
import drawUI from './drawUI';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as keyboard from './keyboard';
import LayoutChild from './LayoutChild';
import pause from './pause';

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
  const loadingLayer = new Konva.Layer();

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

  // Construct a list of all of the cards in the deck
  initCardsMap();

  // Build all of the reusable card objects
  initCards();

  // Draw the user interface
  drawUI();

  // Keyboard hotkeys can only be initialized once the clue buttons are drawn
  keyboard.init();

  // If the game is paused, darken the background
  pause();

  // Tell the server that we are finished loading the UI and
  // we now need the specific actions that have taken place in this game so far
  globals.lobby.conn!.send('getGameInfo2', {
    tableID: globals.lobby.tableID,
  });
};

const initCardsMap = () => {
  for (const suit of globals.variant.suits) {
    if (variantRules.isUpOrDown(globals.variant)) {
      // 6 is an unknown rank, so we use 7 to represent a "START" card
      const key = `${suit.name}7`;
      globals.cardsMap.set(key, 1);
    }
    for (let rank = 1; rank <= 5; rank++) {
      const key = `${suit.name}${rank}`;
      globals.cardsMap.set(key, deck.numCopiesOfCard(globals.variant, rank, suit));
    }
  }
};

const initCards = () => {
  globals.deckSize = deck.totalCards(globals.variant);
  for (let order = 0; order < globals.deckSize; order++) {
    // Create the "learned" card object
    // (this must be done before creating the HanabiCard object)
    globals.learnedCards.push({
      suitIndex: null,
      rank: null,
    });

    // Create the notes for this card
    // (this must be done before creating the HanabiCard object)
    globals.ourNotes.push('');
    globals.allNotes.push([]);

    // Create the HanabiCard object
    const card = new HanabiCard({
      order,
    });
    globals.deck.push(card);

    // Create the LayoutChild that will be the parent of the card
    const child = new LayoutChild();
    child.addCard(card);
  }

  // Also create objects for the stack bases
  for (const suit of globals.variant.suits) {
    const suitIndex = suitToSuitIndex(suit, globals.variant);
    globals.learnedCards.push({
      suitIndex,
      rank: STACK_BASE_RANK,
    });

    globals.ourNotes.push('');
    globals.allNotes.push([]);
  }
};
