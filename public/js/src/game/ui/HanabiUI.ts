/*
    The object that comprises the entire game UI
    It is re-created every time when going into a new game
    (and destroyed when going to the lobby)
*/

// Imports
import Konva from 'konva';
import * as action from './action';
import { LABEL_COLOR, STACK_BASE_RANK } from '../../constants';
import drawCards from './drawCards';
import drawUI from './drawUI';
import globals, { Globals } from './globals';
import HanabiCard from './HanabiCard';
import * as keyboard from './keyboard';
import LayoutChild from './LayoutChild';
import Loader from './Loader';
import pause from './pause';
import * as stats from './stats';
import * as timer from './timer';

export default class HanabiUI {
    globals: Globals;

    constructor(lobby: any, game: any) {
        // Since the "HanabiUI" object is being reinstantiated,
        // we need to explicitly reinitialize all globals varaibles
        // (or else they will retain their old values)
        globals.reset();

        // Expose the globals to functions in the "game" directory
        this.globals = globals;

        // Store references to the parent objects for later use
        globals.lobby = lobby; // This is the "Globals" object in the root of the "src" directory
        // We name it "lobby" here to distinguish it from the UI globals;
        // after more refactoring, we will eventually merge these objects to make it less confusing
        globals.game = game; // This is the "gameExports" from the "/src/game/main.ts" file
        // We should also combine this with the UI object in the future

        // Initialize the stage and show the loading screen
        initStage();
        showLoadingScreen();
    }

    /*
        The following methods are called from various parent functions
    */

    updateChatLabel() { // eslint-disable-line class-methods-use-this
        let text = '💬';
        if (globals.lobby.chatUnread > 0) {
            text += ` (${globals.lobby.chatUnread})`;
        }
        globals.elements.chatButton!.text(text);
        globals.layers.get('UI')!.batchDraw();
    }

    destroy() { // eslint-disable-line class-methods-use-this
        keyboard.destroy();
        timer.stop();
        globals.stage!.destroy();
        // window.removeEventListener('resize', resizeCanvas, false);
    }

    reshowClueUIAfterWarning() { // eslint-disable-line class-methods-use-this
        action.handle();
    }
}

// Initialize and size the stage depending on the window size
const initStage = () => {
    globals.stage = new Konva.Stage({
        container: 'game',
    });

    const ratio = 16 / 9;

    let ww = window.innerWidth;
    let wh = window.innerHeight;

    if (ww < 640) {
        ww = 640;
    }
    if (wh < 360) {
        wh = 360;
    }

    let cw;
    let ch;
    if (ww < wh * ratio) {
        cw = ww;
        ch = ww / ratio;
    } else {
        ch = wh;
        cw = wh * ratio;
    }

    cw = Math.floor(cw);
    ch = Math.floor(ch);

    if (cw > 0.98 * ww) {
        cw = ww;
    }
    if (ch > 0.98 * wh) {
        ch = wh;
    }
    globals.stage.width(cw);
    globals.stage.height(ch);
};

const showLoadingScreen = () => {
    const winW = globals.stage!.width();
    const winH = globals.stage!.height();

    const loadingLayer = new Konva.Layer();

    const loadingLabel = new Konva.Text({
        fill: LABEL_COLOR,
        stroke: '#747278',
        strokeWidth: 1,
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

    const progresslabel = new Konva.Text({
        fill: LABEL_COLOR,
        stroke: '#747278',
        strokeWidth: 1,
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
    loadingLayer.add(progresslabel);

    globals.stage!.add(loadingLayer);

    const loadingProgressCallback = (done: number, total: number) => {
        progresslabel.text(`${done}/${total}`);
        loadingLayer.batchDraw();
    };
    globals.ImageLoader = new Loader(loadingProgressCallback, loadingFinishedCallback);
};

const loadingFinishedCallback = () => {
    // Build images for every card
    // (with respect to the variant that we are playing
    // and whether or not we have the colorblind UI feature enabled)
    globals.cardImages = drawCards(
        globals.variant,
        globals.lobby.settings.get('colorblindMode'),
        globals.lobby.settings.get('legibleNumbers'),
    );

    // Construct a list of all of the cards in the deck
    initCardsMap();

    // Build all of the reusuable card objects
    initCards();

    // Draw the user interface
    drawUI();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    keyboard.init();

    // If the game is paused, darken the background
    pause();

    // Tell the server that we are finished loading
    globals.lobby.conn.send('ready');
};

const initCardsMap = () => {
    for (const suit of globals.variant.suits) {
        if (globals.variant.name.startsWith('Up or Down')) {
            // 6 is an unknown rank, so we use 7 to represent a "START" card
            const key = `${suit.name}7`;
            globals.cardsMap.set(key, 1);
        }
        for (let rank = 1; rank <= 5; rank++) {
            // In a normal suit of Hanabi,
            // there are three 1's, two 2's, two 3's, two 4's, and one five
            let amountToAdd = 2;
            if (rank === 1) {
                amountToAdd = 3;
                if (globals.variant.name.startsWith('Up or Down')) {
                    amountToAdd = 1;
                }
            } else if (rank === 5) {
                amountToAdd = 1;
            }
            if (suit.oneOfEach) {
                amountToAdd = 1;
            }

            const key = `${suit.name}${rank}`;
            globals.cardsMap.set(key, amountToAdd);
        }
    }
};

const initCards = () => {
    globals.deckSize = stats.getTotalCardsInTheDeck(globals.variant);
    for (let order = 0; order < globals.deckSize; order++) {
        // Create the "learned" card object
        // (this must be done before creating the HanabiCard object)
        globals.learnedCards.push({
            suit: null,
            rank: null,
            revealed: false,
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
        globals.learnedCards.push({
            suit,
            rank: STACK_BASE_RANK,
            revealed: true,
        });

        globals.ourNotes.push('');
        globals.allNotes.push([]);
    }
};
