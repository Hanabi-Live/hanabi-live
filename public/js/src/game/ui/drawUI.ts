/*
    This function draws the UI when going into a game for the first time
*/

// Imports
import Konva from 'konva';
import Arrow from './Arrow';
import * as arrows from './arrows';
import backToLobby from './backToLobby';
import Button from './Button';
import ButtonGroup from './ButtonGroup';
import ClickArea from './ClickArea';
import * as clues from './clues';
import CurrentPlayerArea from './CurrentPlayerArea';
import Deck from './Deck';
import CardLayout from './CardLayout';
import Clue from './Clue';
import ClueLog from './ClueLog';
import ColorButton from './ColorButton';
import {
    ACTION,
    CLUE_TYPE,
    LABEL_COLOR,
    REPLAY_ACTION_TYPE,
    REPLAY_ARROW_ORDER,
    STACK_BASE_RANK,
} from '../../constants';
import drawHands from './drawHands';
import drawReplayArea from './drawReplayArea';
import FitText from './FitText';
import FullActionLog from './FullActionLog';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as hypothetical from './hypothetical';
import LayoutChild from './LayoutChild';
import MultiFitText from './MultiFitText';
import PlayerButton from './PlayerButton';
import PlayStack from './PlayStack';
import RankButton from './RankButton';
import * as replay from './replay';
import * as stats from './stats';
import StrikeX from './StrikeX';
import * as timer from './timer';
import TimerDisplay from './TimerDisplay';
import * as tooltips from './tooltips';
import RectWithTooltip from './RectWithTooltip';
import StrikeSquare from './StrikeSquare';
import ImageWithTooltip from './ImageWithTooltip';

interface Values {
    x: number,
    y: number,
    w?: number,
    h?: number,
}

// Variables
let winW: number;
let winH: number;
let basicTextLabel: Konva.Text;
let basicNumberLabel: Konva.Text;
let actionLogValues: Values;
let playAreaValues: Values;
let cardWidth;
let cardHeight;
let bottomLeftButtonValues: Values;
let deckValues: Values;
let scoreAreaValues: Values;
let clueAreaValues: Values;
let clueLogValues: Values;
let spectatorsLabelValues: Values;

export default () => {
    // Constants
    winW = globals.stage!.width();
    winH = globals.stage!.height();

    // Create the various Konva layers upon which all graphic elements reside
    initLayers();
    drawBackground();

    // We can reuse some UI elements
    initReusableObjects();

    // The top-left
    drawActionLog();
    drawPlayStacks();

    // The bottom-left
    drawBottomLeftButtons();
    drawDeck();
    drawScoreArea();
    drawSpectators();
    drawSharedReplay();

    // The middle column
    drawHands(winW, winH);

    // The right column
    drawClueLog();
    drawStatistics();
    drawDiscardArea();
    drawDiscardStacks();

    // Conditional elements
    drawArrows();
    drawTimers();
    drawClueArea();
    drawClueAreaDisabled();
    drawCurrentPlayerArea();
    drawPreplayArea();
    drawReplayArea(winW, winH);
    drawHypotheticalArea();
    drawPauseArea();
    drawExtraAnimations();

    if (globals.inReplay) {
        globals.elements.replayArea!.show();
    }

    for (const [, layer] of globals.layers) {
        globals.stage!.add(layer);
    }
};

const initLayers = () => {
    // Just in case, delete all existing layers
    for (const layer of globals.stage!.getLayers().toArray()) {
        layer.remove();
    }

    // Define the layers
    // They are added to the stage later on at the end of this function
    // We don't want to add too many layers; the Konva documentation states that 3-5 is max:
    // https://konvajs.org/docs/performance/Layer_Management.html
    const layers = [
        'UI',
        'timer', // The timer gets its own layer since it is being constantly updated
        'card',
        'sparkle', // Sparkles get their own layer since they are constantly animating
        'arrow',
        'UI2', // We need some UI elements to be on top of cards
    ];
    for (const layerName of layers) {
        const layer = new Konva.Layer({
            // Disable "listening" for every layer/element by default to increase performance
            // https://konvajs.org/docs/performance/Listening_False.html
            // This means that we have to explicitly set "listening: true" for every element that
            // we want to bind events to (for clicking, dragging, hovering, etc.)
            listening: false,
        });
        globals.layers.set(layerName, layer);
    }
};

const drawBackground = () => {
    // Draw a green background behind everything
    const background = new Konva.Image({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        image: globals.ImageLoader!.get('background')!,
    });
    globals.layers.get('UI')!.add(background);

    // The dark overlay that appears when you click the action log is clicked,
    // when a player's name is clicked, when the game is paused, etc.
    globals.elements.stageFade = new Konva.Rect({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        opacity: 0.3,
        fill: 'black',
        visible: false,
        listening: true,
    });
    globals.layers.get('UI2')!.add(globals.elements.stageFade);
};

const initReusableObjects = () => {
    // Create some default objects
    basicTextLabel = new Konva.Text({
        x: 0.01 * winW,
        y: 0.01 * winH,
        width: 0.11 * winW,
        height: 0.03 * winH,
        fontSize: 0.026 * winH,
        fontFamily: 'Verdana',
        align: 'left',
        text: 'Placeholder text',
        fill: LABEL_COLOR,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });
    basicNumberLabel = basicTextLabel.clone();
    basicNumberLabel.text('0');
    basicNumberLabel.width(0.03 * winW);
};

const drawActionLog = () => {
    if (!globals.lobby.settings.get('keldonMode')) {
        actionLogValues = {
            x: 0.01,
            y: 0.01,
            h: 0.25,
        };
    } else {
        actionLogValues = {
            x: 0.2,
            y: 0.235,
            h: 0.098,
        };
    }
    actionLogValues.w = 0.4;

    const actionLogGroup = new Konva.Group({
        x: actionLogValues.x * winW,
        y: actionLogValues.y * winH,
    });
    globals.layers.get('UI')!.add(actionLogGroup);

    // The faded rectangle around the action log
    const actionLogRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: actionLogValues.w * winW,
        height: actionLogValues.h! * winH,
        fill: 'black',
        opacity: 0.3,
        cornerRadius: 0.01 * winH,
        listening: true,
    });
    actionLogGroup.add(actionLogRect);
    actionLogRect.on('click tap', () => {
        globals.elements.fullActionLog!.show();
        globals.elements.stageFade!.show();
        globals.layers.get('UI2')!.batchDraw();

        globals.elements.stageFade!.on('click tap', () => {
            globals.elements.stageFade!.off('click tap');
            globals.elements.fullActionLog!.hide();
            globals.elements.stageFade!.hide();
            globals.layers.get('UI2')!.batchDraw();
        });
    });

    // The action log
    let maxLines = 8;
    if (globals.lobby.settings.get('keldonMode')) {
        maxLines = 3;
    }
    globals.elements.actionLog = new MultiFitText({
        align: 'center',
        fontSize: 0.028 * winH,
        fontFamily: 'Verdana',
        fill: LABEL_COLOR,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        x: 0.01 * winW,
        y: 0.003 * winH,
        width: (actionLogValues.w - 0.02) * winW,
        height: (actionLogValues.h! - 0.003) * winH,
    }, maxLines);
    actionLogGroup.add(globals.elements.actionLog as any);

    // The full action log (that appears when you click on the action log)
    globals.elements.fullActionLog = new FullActionLog(winW, winH);
    globals.layers.get('UI2')!.add(globals.elements.fullActionLog as any);
};

const drawPlayStacks = () => {
    // Local variables
    let yOffset;

    if (globals.variant.suits.length === 6 || globals.variant.showSuitNames) {
        cardWidth = 0.06;
        cardHeight = 0.151;
        yOffset = 0.019;
    } else { // 3, 4, or 5 stacks
        cardWidth = 0.075;
        cardHeight = 0.189;
        yOffset = 0;
    }
    const playStackValues = {
        x: 0.183,
        y: 0.345 + yOffset,
        w: 0, // Is set below
        spacing: 0.015,
    };
    if (globals.variant.showSuitNames) {
        playStackValues.y -= 0.018;
    }
    if (!globals.lobby.settings.get('keldonMode')) {
        playStackValues.x = actionLogValues.x;
        playStackValues.y = actionLogValues.y + actionLogValues.h! + 0.02;
        if (globals.variant.suits.length > 4) {
            playStackValues.spacing = actionLogValues.w!;
            playStackValues.spacing -= cardWidth * globals.variant.suits.length;
            playStackValues.spacing /= globals.variant.suits.length - 1;
        } else {
            playStackValues.spacing = 0.006;
        }
    }
    playStackValues.w = cardWidth * globals.variant.suits.length;
    playStackValues.w += playStackValues.spacing * (globals.variant.suits.length - 1);

    // Variants with less than 5 stacks will be left-aligned instead of centered
    // unless we manually adjust them
    if (
        (globals.variant.suits.length === 4 && !globals.variant.showSuitNames)
        || (
            globals.variant.suits.length === 5
            && globals.variant.showSuitNames
            && globals.lobby.settings.get('keldonMode')
        )
    ) {
        playStackValues.x += (cardWidth + playStackValues.spacing) / 2;
    } else if (globals.variant.suits.length === 4 && globals.variant.showSuitNames) {
        playStackValues.x += cardWidth + playStackValues.spacing;
    } else if (globals.variant.suits.length === 3 && !globals.variant.showSuitNames) {
        playStackValues.x += ((cardWidth + playStackValues.spacing) / 2) * 2;
    } else if (globals.variant.suits.length === 3 && globals.variant.showSuitNames) {
        playStackValues.x += (cardWidth + playStackValues.spacing) * 1.5;
    }

    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];

        // Make the play stack for this suit
        const playStackX = playStackValues.x + ((cardWidth + playStackValues.spacing) * i);
        const playStack = new PlayStack({
            x: playStackX * winW,
            y: playStackValues.y * winH,
            width: cardWidth * winW,
            height: cardHeight * winH,
        });
        globals.elements.playStacks.set(suit, playStack);
        globals.layers.get('card')!.add(playStack as any);

        // Add the stack base to the play stack
        const stackBase = new HanabiCard({
            // Stack bases use card orders after the final card in the deck
            order: stats.getTotalCardsInTheDeck(globals.variant) + i,
        });
        globals.stackBases.push(stackBase);
        stackBase.refresh();
        stackBase.suit = suit;
        stackBase.rank = STACK_BASE_RANK;

        // Create the LayoutChild that will be the parent of the stack base
        const child = new LayoutChild();
        child.addCard(stackBase);
        playStack.addChild(child);

        // Draw the suit name next to each suit
        // (a text description of the suit)
        if (globals.variant.showSuitNames) {
            let text = suit.name;
            if (
                globals.lobby.settings.get('colorblindMode')
                && suit.clueColors.length === 2
            ) {
                const colorList = suit.clueColors.map((color) => color.abbreviation).join('/');
                text += ` [${colorList}]`;
            }
            if (globals.variant.name.startsWith('Up or Down')) {
                text = '';
            }

            const suitLabelText = new FitText({
                x: (playStackValues.x - 0.01 + ((cardWidth + playStackValues.spacing) * i)) * winW,
                y: (playStackValues.y + 0.155) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.02 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text,
                fill: LABEL_COLOR,
            });
            globals.layers.get('UI')!.add(suitLabelText);
            globals.elements.suitLabelTexts.push(suitLabelText);
        }
    }

    // Make the invisible "hole" play stack for "Throw It in a Hole" variants
    // (centered in the middle of the rest of the stacks)
    if (globals.variant.name.startsWith('Throw It in a Hole')) {
        const playStackX = playStackValues.x + (playStackValues.w / 2) - (cardWidth / 2);
        const playStack = new PlayStack({
            x: playStackX * winW,
            y: playStackValues.y * winH,
            width: cardWidth * winW,
            height: cardHeight * winH,
        });
        globals.elements.playStacks.set('hole', playStack);
        globals.layers.get('card')!.add(playStack as any);
    }

    // This is the invisible rectangle that players drag cards to in order to play them
    // Make it a little big bigger than the stacks
    const overlap = 0.03;
    let w = cardWidth * globals.variant.suits.length;
    w += playStackValues.spacing * (globals.variant.suits.length - 1);
    playAreaValues = {
        x: playStackValues.x,
        y: playStackValues.y,
        w,
        h: cardHeight,
    };
    globals.elements.playArea = new ClickArea({
        x: (playAreaValues.x - overlap) * winW,
        y: (playAreaValues.y - overlap) * winH,
        width: (playAreaValues.w! + (overlap * 2)) * winW,
        height: (playAreaValues.h! + (overlap * 2)) * winH,
    });
};

const drawDiscardStacks = () => {
    // Local variables
    let discardStackSpacing;
    if (globals.variant.suits.length === 6) {
        discardStackSpacing = 0.04;
    } else { // 3, 4, or 5 stacks
        discardStackSpacing = 0.05;
    }

    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];

        // Make the discard stack for this suit
        const discardStack = new CardLayout({
            x: 0.81 * winW,
            y: (0.61 + (discardStackSpacing * i)) * winH,
            width: 0.17 * winW,
            height: 0.17 * winH,
            listening: false,
        });
        globals.elements.discardStacks.set(suit, discardStack);
        globals.layers.get('card')!.add(discardStack as any);
    }
};

const drawBottomLeftButtons = () => {
    bottomLeftButtonValues = {
        x: 0.01,
        y: 0.8,
        w: 0.07,
        h: 0.0563, // 0.06
    };

    // The toggle in-game replay button
    const replayButton = new Button(
        {
            x: bottomLeftButtonValues.x * winW,
            y: bottomLeftButtonValues.y * winH,
            width: bottomLeftButtonValues.w! * winW,
            height: bottomLeftButtonValues.h! * winH,
            visible: !globals.replay,
        },
        [
            globals.ImageLoader!.get('replay')!,
            globals.ImageLoader!.get('replay-disabled')!,
        ],
    );
    replayButton.on('click tap', () => {
        if (!replayButton.enabled) {
            return;
        }
        if (globals.inReplay) {
            replay.exit();
        } else {
            replay.enter();
        }
    });
    globals.layers.get('UI')!.add(replayButton as any);
    replayButton.setEnabled(false);
    replayButton.tooltipName = 'replay';
    replayButton.tooltipContent = 'Toggle the in-game replay, where you can rewind the game to see what happened on a specific turn.';
    tooltips.init(replayButton, true, false);
    globals.elements.replayButton = replayButton;

    // The restart button
    // (to go into a new game with the same settings as the current shared replay)
    const restartButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: bottomLeftButtonValues.y * winH,
        width: bottomLeftButtonValues.w! * winW,
        height: bottomLeftButtonValues.h! * winH,
        text: 'Restart',
        visible: false,
    }, []);
    globals.layers.get('UI')!.add(restartButton as any);
    restartButton.on('click tap', () => {
        globals.lobby.conn.send('tableRestart');
    });
    restartButton.tooltipName = 'restart';
    restartButton.tooltipContent = 'Automatically go into a new game with the current members of the shared replay (using the same game settings as this one).';
    tooltips.init(restartButton, true, false);
    globals.elements.restartButton = restartButton;

    // The "End Hypothetical" button
    const endHypotheticalButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: bottomLeftButtonValues.y * winH,
        width: bottomLeftButtonValues.w! * winW,
        height: bottomLeftButtonValues.h! * winH,
        text: 'End Hypo',
        visible: false,
    }, []);
    globals.layers.get('UI')!.add(endHypotheticalButton as any);
    endHypotheticalButton.on('click tap', () => {
        hypothetical.end();
    });
    globals.elements.endHypotheticalButton = endHypotheticalButton;

    // The chat button
    const chatButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: (bottomLeftButtonValues.y + bottomLeftButtonValues.h! + 0.01) * winH,
        width: bottomLeftButtonValues.w! * winW,
        height: bottomLeftButtonValues.h! * winH,
        text: '💬',
        visible: !globals.replay || globals.sharedReplay,
    }, []);
    globals.layers.get('UI')!.add(chatButton as any);
    chatButton.on('click tap', () => {
        globals.game.chat.toggle();
    });
    chatButton.tooltipName = 'chat';
    chatButton.tooltipContent = 'Toggle the in-game chat.';
    tooltips.init(chatButton, true, false);
    globals.elements.chatButton = chatButton;

    const shortButtonSpacing = 0.003;

    // The lobby button (which takes the user back to the lobby)
    // There are two different versions, depending on whether the kill button is showing or not
    const lobbyButtonValues = {
        x: bottomLeftButtonValues.x,
        y: (bottomLeftButtonValues.y + (2 * bottomLeftButtonValues.h!) + 0.02),
        h: bottomLeftButtonValues.h,
    };

    const lobbyButtonSmall = new Button({
        x: lobbyButtonValues.x * winW,
        y: lobbyButtonValues.y * winH,
        width: ((bottomLeftButtonValues.w! / 2) - shortButtonSpacing) * winW,
        height: lobbyButtonValues.h! * winH,
        visible: !globals.replay && !globals.spectating,
    }, [globals.ImageLoader!.get('home')!]);
    globals.layers.get('UI')!.add(lobbyButtonSmall as any);
    lobbyButtonSmall.on('click tap', lobbyButtonClick);
    lobbyButtonSmall.tooltipName = 'lobby-small';
    lobbyButtonSmall.tooltipContent = 'Return to the lobby. (The game will not end and your teammates will have to wait for you to come back.)';
    tooltips.init(lobbyButtonSmall, true, false);
    globals.elements.lobbyButtonSmall = lobbyButtonSmall;

    const lobbyButtonBig = new Button({
        x: lobbyButtonValues.x * winW,
        y: lobbyButtonValues.y * winH,
        width: bottomLeftButtonValues.w! * winW,
        height: lobbyButtonValues.h! * winH,
        text: 'Lobby',
        visible: globals.replay || globals.spectating,
    }, []);
    globals.layers.get('UI')!.add(lobbyButtonBig as any);
    lobbyButtonBig.on('click tap', lobbyButtonClick);
    lobbyButtonBig.tooltipName = 'lobby-big';
    lobbyButtonBig.tooltipContent = 'Return to the lobby.';
    tooltips.init(lobbyButtonBig, true, false);
    globals.elements.lobbyButtonBig = lobbyButtonBig;

    // The kill button (which terminates the current game)
    const killButton = new Button({
        x: (bottomLeftButtonValues.x + (bottomLeftButtonValues.w! / 2) + shortButtonSpacing) * winW,
        y: (bottomLeftButtonValues.y + (2 * bottomLeftButtonValues.h!) + 0.02) * winH,
        width: ((bottomLeftButtonValues.w! / 2) - shortButtonSpacing) * winW,
        height: bottomLeftButtonValues.h! * winH,
        visible: !globals.replay && !globals.spectating,
    }, [globals.ImageLoader!.get('skull')!]);
    globals.layers.get('UI')!.add(killButton as any);
    killButton.on('click tap', () => {
        globals.lobby.conn.send('tableAbandon');
    });
    killButton.tooltipName = 'kill';
    killButton.tooltipContent = 'Terminate the game, ending it immediately.';
    tooltips.init(killButton, true, false);
    globals.elements.killButton = killButton;
};

const drawDeck = () => {
    deckValues = {
        x: bottomLeftButtonValues.x + bottomLeftButtonValues.w! + 0.01,
        y: bottomLeftButtonValues.y,
        w: 0.075,
        h: 0.189,
    };

    // This is the faded rectangle that is hidden until all of the deck has been depleted
    // (this has to be separate from the Deck object since it exists on a separate layer)
    const deckRect = new RectWithTooltip({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w! * winW,
        height: deckValues.h! * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.006 * winW,
        listening: true,
    });
    globals.layers.get('UI')!.add(deckRect);

    // Near the top of the deck, draw the database ID for the respective game
    // (in an ongoing game, this will not show)
    globals.elements.gameIDLabel = new FitText({
        text: `ID: ${globals.databaseID}`,
        x: deckValues.x * winW,
        y: (deckValues.y + 0.01) * winH,
        width: deckValues.w! * winW,
        fontFamily: 'Verdana',
        fill: 'white',
        align: 'center',
        fontSize: 0.02 * winH,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: globals.replay && globals.databaseID !== 0,
    });
    // We draw the label on the arrow layer because it is on top of the card but
    // not on top of the black second layer
    globals.layers.get('arrow')!.add(globals.elements.gameIDLabel);

    globals.elements.deck = new Deck({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w! * winW,
        height: deckValues.h! * winH,
        cardBack: 'deck-back',
        suits: globals.variant.suits,
    });
    globals.layers.get('card')!.add(globals.elements.deck as any);

    // Also apply the card deck tooltip to the faded background rectangle
    deckRect.tooltipName = 'deck';
    deckRect.tooltipContent = globals.elements.deck.tooltipContent;
    tooltips.init(deckRect, true, true);

    // When there are no cards left in the deck,
    // show a label that indicates how many turns are left before the game ends
    const xOffset = 0.017;
    const fontSize = 0.025;
    globals.elements.deckTurnsRemainingLabel1 = basicTextLabel.clone({
        text: 'Turns',
        x: (deckValues.x + xOffset) * winW,
        y: (deckValues.y + deckValues.h! - 0.07) * winH,
        fontSize: fontSize * winH,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.deckTurnsRemainingLabel1!);
    globals.elements.deckTurnsRemainingLabel2 = basicTextLabel.clone({
        text: 'left: #',
        x: (deckValues.x + xOffset) * winW,
        y: (deckValues.y + deckValues.h! - 0.04) * winH,
        fontSize: fontSize * winH,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.deckTurnsRemainingLabel2!);

    // This is a yellow border around the deck that will appear when only one card is left
    // (if the "Bottom-Deck Blind-Plays" game option is enabled)
    globals.elements.deckPlayAvailableLabel = new Konva.Rect({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w! * winW,
        height: deckValues.h! * winH,
        stroke: 'yellow',
        cornerRadius: 6,
        strokeWidth: 10,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.deckPlayAvailableLabel);
};

const drawScoreArea = () => {
    // The rectangle that holds the turn, score, and clue count
    scoreAreaValues = {
        x: 0.66,
        y: 0.81,
        w: 0.13,
        h: 0.18,
    };
    if (!globals.lobby.settings.get('keldonMode')) {
        scoreAreaValues.x = deckValues.x + deckValues.w! + 0.01;
        scoreAreaValues.y = 0.81;
    }
    globals.elements.scoreArea = new Konva.Group({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
    });
    globals.layers.get('UI')!.add(globals.elements.scoreArea);

    // The red border that surrounds the score area when the team is at 0 clues
    globals.elements.noClueBorder = new Konva.Rect({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
        width: scoreAreaValues.w! * winW,
        height: scoreAreaValues.h! * winH,
        stroke: '#df1c2d',
        strokeWidth: 0.003 * winW,
        cornerRadius: 0.01 * winW,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.noClueBorder);

    // The faded rectangle around the score area
    const scoreAreaRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: scoreAreaValues.w! * winW,
        height: scoreAreaValues.h! * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.elements.scoreArea.add(scoreAreaRect);

    const labelX = 0.02;
    const labelSpacing = 0.06;

    const turnTextLabel = basicTextLabel.clone({
        text: 'Turn',
        x: labelX * winW,
        y: 0.01 * winH,
        listening: true,
    });
    globals.elements.scoreArea.add(turnTextLabel);

    // We also want to be able to right-click the turn to go to a specific turn in the replay
    turnTextLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        if (event.evt.which === 3) { // Right-click
            replay.promptTurn();
        }
    });

    globals.elements.turnNumberLabel = basicNumberLabel.clone({
        text: '1',
        x: (labelX + labelSpacing) * winW,
        y: 0.01 * winH,
        listening: true,
    });
    globals.elements.scoreArea.add(globals.elements.turnNumberLabel!);

    // We also want to be able to right-click the turn to go to a specific turn in the replay
    globals.elements.turnNumberLabel!.on('click', (event) => {
        if (event.evt.which === 3) { // Right-click
            replay.promptTurn();
        }
    });

    const scoreTextLabel = basicTextLabel.clone({
        text: 'Score',
        x: labelX * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(scoreTextLabel);

    globals.elements.scoreNumberLabel = basicNumberLabel.clone({
        text: '0',
        x: (labelX + labelSpacing) * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.scoreNumberLabel!);

    globals.elements.maxScoreNumberLabel = basicNumberLabel.clone({
        text: '',
        x: (labelX + labelSpacing) * winW,
        y: 0.05 * winH,
        fontSize: 0.017 * winH,
        visible: !globals.variant.name.startsWith('Throw It in a Hole') || globals.replay,
    });
    globals.elements.scoreArea.add(globals.elements.maxScoreNumberLabel!);

    const cluesTextLabel = basicTextLabel.clone({
        text: 'Clues',
        x: labelX * winW,
        y: 0.08 * winH,
        listening: true,
    });
    globals.elements.scoreArea.add(cluesTextLabel);

    const cluesNumberLabel = basicNumberLabel.clone({
        text: '8',
        x: (labelX + labelSpacing) * winW,
        y: 0.08 * winH,
        listening: true,
    });
    globals.elements.scoreArea.add(cluesNumberLabel);
    globals.elements.cluesNumberLabel = cluesNumberLabel;

    cluesTextLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.CLUES, cluesNumberLabel);
    });
    cluesNumberLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.CLUES, cluesNumberLabel);
    });

    // Add an animation to signify that discarding at 8 clues is illegal
    globals.elements.cluesNumberLabelPulse = new Konva.Tween({
        node: cluesNumberLabel,
        fontSize: 0.04 * winH,
        fill: '#df1c2d',
        offsetX: 0.001 * winH,
        offsetY: 0.01 * winH,
        duration: 0.5,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
            if (globals.elements.cluesNumberLabelPulse) {
                globals.elements.cluesNumberLabelPulse.reverse();
            }
        },
    });
    globals.elements.cluesNumberLabelPulse.anim.addLayer(globals.layers.get('UI'));

    // Draw the 3 strike (bomb) black squares / X's
    function strikeClick(this: any) {
        if (this.turn === null) {
            return;
        }
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turn + 1, true);

        // Also highlight the card
        if (this.order !== null) {
            // Ensure that the card exists as a sanity-check
            const card = globals.deck[this.order];
            if (!card) {
                return;
            }

            arrows.toggle(card);
        }
    }
    for (let i = 0; i < 3; i++) {
        // Draw the background square
        const strikeSquare = new StrikeSquare({
            x: (0.01 + (0.04 * i)) * winW,
            y: 0.115 * winH,
            width: 0.03 * winW,
            height: 0.053 * winH,
            fill: 'black',
            opacity: 0.6,
            cornerRadius: 0.005 * winW,
            listening: true,
        });
        globals.elements.scoreArea.add(strikeSquare);

        // Draw the red X that indicates the strike
        const strikeX = new StrikeX({
            x: (0.015 + (0.04 * i)) * winW,
            y: 0.125 * winH,
            width: 0.02 * winW,
            height: 0.036 * winH,
            image: globals.ImageLoader!.get('x')!,
            opacity: 0,
            listening: true,
        });
        globals.elements.scoreArea.add(strikeX);

        // Handle the tooltips
        strikeSquare.tooltipName = 'strikes';
        strikeX.tooltipName = strikeSquare.tooltipName;
        strikeSquare.tooltipContent = 'This shows how many strikes (bombs) the team currently has.';
        strikeX.tooltipContent = strikeSquare.tooltipContent;
        tooltips.init(strikeSquare, true, false);
        tooltips.init(strikeX, true, false);

        // Click on the strike to go to the turn that the strike happened, if any
        // (and highlight the card that misplayed)
        strikeSquare.turn = null;
        strikeX.turn = null;
        strikeSquare.order = null;
        strikeX.order = null;
        strikeSquare.on('click', strikeClick);
        strikeX.on('click', strikeClick);

        globals.elements.strikeSquares[i] = strikeSquare;
        globals.elements.strikeXs[i] = strikeX;
    }
};

// The "eyes" symbol to show that one or more people are spectating the game
const drawSpectators = () => {
    // Position it to the bottom-left of the score area
    spectatorsLabelValues = {
        x: scoreAreaValues.x - 0.037,
        y: scoreAreaValues.y + 0.09,
    };
    if (!globals.lobby.settings.get('keldonMode')) {
        // Position it to the bottom-right of the score area
        spectatorsLabelValues.x = scoreAreaValues.x + scoreAreaValues.w! + 0.01;
    }
    const imageSize = 0.02;
    const spectatorsLabel = new ImageWithTooltip({
        x: (spectatorsLabelValues.x + 0.005) * winW,
        y: spectatorsLabelValues.y * winH,
        width: imageSize * winW,
        height: imageSize * winW,
        // (this is not a typo; we want it to have the same width and height)
        align: 'center',
        image: globals.ImageLoader!.get('eyes')!,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
        listening: true,
    });
    globals.layers.get('UI')!.add(spectatorsLabel);
    spectatorsLabel.tooltipName = 'spectators';
    spectatorsLabel.tooltipContent = ''; // This will be filled in later by the "spectators" command
    tooltips.init(spectatorsLabel, false, true);
    globals.elements.spectatorsLabel = spectatorsLabel;

    globals.elements.spectatorsNumLabel = new Konva.Text({
        x: spectatorsLabelValues.x * winW,
        y: (spectatorsLabelValues.y + 0.04) * winH,
        width: 0.03 * winW,
        height: 0.03 * winH,
        fontSize: 0.03 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '0',
        fill: LABEL_COLOR,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.spectatorsNumLabel);
};

// The "crown" symbol to show that we are in a shared replay
const drawSharedReplay = () => {
    const sharedReplayLeaderLabelValues = {
        x: spectatorsLabelValues.x,
        y: spectatorsLabelValues.y - 0.06,
    };

    // A circle around the crown indicates that we are the current replay leader
    // (we want the icon to be on top of this so that it does not interfere with mouse events)
    globals.elements.sharedReplayLeaderCircle = new Konva.Circle({
        x: (sharedReplayLeaderLabelValues.x + 0.015) * winW,
        y: (sharedReplayLeaderLabelValues.y + 0.015) * winH,
        radius: 0.028 * winH,
        stroke: '#ffe03b', // Yellow
        strokeWidth: 2,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.sharedReplayLeaderCircle);

    // The crown
    const size = 0.025 * winW;
    const sharedReplayLeaderLabel = new ImageWithTooltip({
        x: (sharedReplayLeaderLabelValues.x + 0.0025) * winW,
        y: (sharedReplayLeaderLabelValues.y - 0.007) * winH,
        width: size,
        height: size,
        image: globals.ImageLoader!.get('crown')!,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
        listening: true,
    });
    globals.layers.get('UI')!.add(sharedReplayLeaderLabel);
    globals.elements.sharedReplayLeaderLabel = sharedReplayLeaderLabel;

    // Add an animation to alert everyone when shared replay leadership has been transfered
    globals.elements.sharedReplayLeaderLabelPulse = new Konva.Tween({
        node: sharedReplayLeaderLabel,
        width: size * 2,
        height: size * 2,
        offsetX: 0.025 * winH,
        offsetY: 0.025 * winH,
        duration: 0.5,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
            if (globals.elements.sharedReplayLeaderLabelPulse) {
                globals.elements.sharedReplayLeaderLabelPulse.reverse();
            }
        },
    });
    globals.elements.sharedReplayLeaderLabelPulse.anim.addLayer(globals.layers.get('UI'));

    // Tooltip for the crown
    sharedReplayLeaderLabel.tooltipName = 'leader';
    // This will get filled in later by the "replayLeader" command
    sharedReplayLeaderLabel.tooltipContent = '';
    tooltips.init(sharedReplayLeaderLabel, false, true);

    // The user can right-click on the crown to pass the replay leader to an arbitrary person
    sharedReplayLeaderLabel.on('click', (event) => {
        // Do nothing if this is not a right-click
        if (event.evt.which !== 3) {
            return;
        }

        // Do nothing if we are not the shared replay leader
        if (!globals.amSharedReplayLeader) {
            return;
        }

        let msg = 'What is the number of the person that you want to pass the replay leader to?\n\n';
        let i = 1;
        for (const spectator of globals.spectators) {
            if (spectator !== globals.lobby.username) {
                msg += `${i} - ${spectator}\n`;
                i += 1;
            }
        }
        const targetString = window.prompt(msg);
        if (targetString === null) {
            // Don't do anything if they pressed the cancel button
            return;
        }
        let target = parseInt(targetString, 10);
        if (Number.isNaN(target)) {
            // Don't do anything if they entered something that is not a number
            return;
        }
        target -= 1;
        const name = globals.spectators[target];

        // Only proceed if we chose someone else
        if (name === globals.lobby.username) {
            return;
        }

        globals.lobby.conn.send('replayAction', {
            type: REPLAY_ACTION_TYPE.LEADER_TRANSFER,
            name,
        });
    });
};

const drawClueLog = () => {
    clueLogValues = {
        x: 0.8,
        y: 0.01,
        w: 0.19,
        h: 0.51,
    };
    const clueLogRect = new Konva.Rect({
        x: clueLogValues.x * winW,
        y: clueLogValues.y * winH,
        width: clueLogValues.w! * winW,
        height: clueLogValues.h! * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.get('UI')!.add(clueLogRect);

    const spacing = 0.01;
    globals.elements.clueLog = new ClueLog({
        x: (clueLogValues.x + spacing) * winW,
        y: (clueLogValues.y + spacing) * winH,
        width: (clueLogValues.w! - (spacing * 2)) * winW,
        height: (clueLogValues.h! - (spacing * 2)) * winH,
    });
    globals.layers.get('UI')!.add(globals.elements.clueLog as any);
};

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log)
const drawStatistics = () => {
    const statsRect = new Konva.Rect({
        x: clueLogValues.x * winW,
        y: 0.53 * winH,
        width: clueLogValues.w! * winW,
        height: 0.06 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.get('UI')!.add(statsRect);

    const paceTextLabel = basicTextLabel.clone({
        text: 'Pace',
        x: 0.825 * winW,
        y: 0.54 * winH,
        fontSize: 0.02 * winH,
        listening: true,
    });
    globals.layers.get('UI')!.add(paceTextLabel);
    paceTextLabel.tooltipName = 'pace';
    let paceContent = 'Pace is a measure of how many discards can happen while<br />';
    paceContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    paceContent += 'still having a chance to get the maximum score.<br />';
    paceContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    paceContent += '(For more information, click on the "Help" button in the lobby.)';
    paceTextLabel.tooltipContent = paceContent;
    tooltips.init(paceTextLabel, true, false);

    const paceNumberLabel = basicNumberLabel.clone({
        text: '-',
        x: 0.9 * winW,
        y: 0.54 * winH,
        fontSize: 0.02 * winH,
        listening: true,
    });
    globals.layers.get('UI')!.add(paceNumberLabel);
    globals.elements.paceNumberLabel = paceNumberLabel;

    paceTextLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.PACE, paceNumberLabel);
    });
    paceNumberLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.PACE, paceNumberLabel);
    });

    const efficiencyTextLabel = basicTextLabel.clone({
        text: 'Efficiency',
        x: 0.825 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        listening: true,
    });
    globals.layers.get('UI')!.add(efficiencyTextLabel);
    efficiencyTextLabel.tooltipName = 'efficiency';
    let efficiencyContent = 'Efficiency is calculated by: <i>(number of cards played<br />';
    efficiencyContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    efficiencyContent += '+ number of unplayed cards with one or more clues "on" them) / number of clues given</i><br />';
    efficiencyContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    efficiencyContent += 'The first number is the efficiency of the current game.<br />';
    efficiencyContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    efficiencyContent += 'The second number shows the minimum possible efficiency needed to win with<br />';
    efficiencyContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    efficiencyContent += 'the current number of players and the current variant.<br />';
    efficiencyContent += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    efficiencyContent += '(For more information, click on the "Help" button in the lobby.)';
    efficiencyTextLabel.tooltipContent = efficiencyContent;
    tooltips.init(efficiencyTextLabel, true, false);

    // We want the "/" to be part of the first label since we don't want
    // to change the color of it later on
    const efficiencyNumberLabel = basicNumberLabel.clone({
        text: '- / ',
        x: 0.9 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        listening: true,
    });
    globals.layers.get('UI')!.add(efficiencyNumberLabel);
    globals.elements.efficiencyNumberLabel = efficiencyNumberLabel;

    efficiencyTextLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.EFFICIENCY, efficiencyNumberLabel);
    });
    efficiencyNumberLabel.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(event, REPLAY_ARROW_ORDER.EFFICIENCY, efficiencyNumberLabel);
    });

    const minEfficiency = stats.getMinEfficiency();
    const efficiencyNumberLabelMinNeeded = basicNumberLabel.clone({
        text: minEfficiency.toFixed(2), // Convert it to a string and round to 2 decimal places
        x: 0.918 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        // "Easy" variants use the default color (off-white)
        // "Hard" variants use pink
        fill: minEfficiency < 1.25 ? LABEL_COLOR : '#ffb2b2',
        listening: true,
    });
    globals.layers.get('UI')!.add(efficiencyNumberLabelMinNeeded);
    efficiencyNumberLabelMinNeeded.on('click', (event: Konva.KonvaPointerEvent) => {
        arrows.click(
            event,
            REPLAY_ARROW_ORDER.MIN_EFFICIENCY,
            efficiencyNumberLabelMinNeeded,
        );
    });
    globals.elements.efficiencyNumberLabelMinNeeded = efficiencyNumberLabelMinNeeded;
};

const drawDiscardArea = () => {
    // The red border that surrounds the discard pile when the team is at 8 clues
    globals.elements.noDiscardBorder = new Konva.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        stroke: '#df1c2d',
        strokeWidth: 0.005 * winW,
        cornerRadius: 0.01 * winW,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.noDiscardBorder);

    // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
    globals.elements.noDoubleDiscardBorder = new Konva.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        stroke: 'yellow',
        strokeWidth: 0.004 * winW,
        cornerRadius: 0.01 * winW,
        opacity: 0.75,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.noDoubleDiscardBorder);

    // The faded rectangle around the trash can
    const discardAreaRect = new Konva.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.get('UI')!.add(discardAreaRect);

    // The trash can icon over the discard pile
    const trashcan = new Konva.Image({
        x: 0.82 * winW,
        y: 0.62 * winH,
        width: 0.15 * winW,
        height: 0.35 * winH,
        opacity: 0.2,
        image: globals.ImageLoader!.get('trashcan')!,
    });
    globals.layers.get('UI')!.add(trashcan);

    // This is the invisible rectangle that players drag cards to in order to discard them
    globals.elements.discardArea = new ClickArea({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.2 * winW,
        height: 0.4 * winH,
    });
};

const drawArrows = () => {
    for (let i = 0; i < 5; i++) {
        const arrow = new Arrow(winW, winH);
        globals.layers.get('arrow')!.add(arrow as any);
        globals.elements.arrows.push(arrow);
    }
};

const drawTimers = () => {
    // Just in case, stop the previous timer, if any
    timer.stop();

    // We don't want the timer to show in replays or untimed games
    // (unless they have the optional setting turned on)
    if (globals.replay || (!globals.timed && !globals.lobby.settings.get('showTimerInUntimed'))) {
        return;
    }

    const timerValues = {
        x1: 0.155,
        x2: 0.565,
        y1: 0.592,
        y2: 0.592,
        w: 0.08,
        h: 0.051,
        fontSize: 0.03,
        cornerRadius: 0.05,
        spaceH: 0.01,
    };
    if (!globals.lobby.settings.get('keldonMode')) {
        timerValues.x1 = 0.352;
        timerValues.x2 = timerValues.x1;
        timerValues.y1 = 0.77;
        timerValues.y2 = 0.885;
    }

    // A circle around the timer indicates that we have queued a pause
    // (we want the timer to be on top of this so that it does not interfere with mouse events)
    globals.elements.timer1Circle = new Konva.Ellipse({
        x: (timerValues.x1 + 0.04) * winW,
        y: (timerValues.y1 + 0.035) * winH,
        radiusX: 0.05 * winW,
        radiusY: 0.07 * winH,
        stroke: '#ffe03b', // Yellow
        strokeWidth: 2,
        visible: globals.pauseQueued,
    });
    globals.layers.get('UI')!.add(globals.elements.timer1Circle);

    // The timer for "You"
    globals.elements.timer1 = new TimerDisplay({
        x: timerValues.x1 * winW,
        y: timerValues.y1 * winH,
        width: timerValues.w * winW,
        height: timerValues.h * winH,
        fontSize: timerValues.fontSize * winH,
        cornerRadius: timerValues.cornerRadius * winH,
        spaceH: timerValues.spaceH * winH,
        label: 'You',
        visible: !globals.spectating,
        listening: true,
    });
    globals.layers.get('timer')!.add(globals.elements.timer1 as any);
    globals.elements.timer1.on('click', (event) => {
        if (
            event.evt.which !== 3 // Right-click
            || !globals.timed // We don't need to pause if this is not a timed game
            || globals.paused // We don't need to pause if the game is already paused
        ) {
            return;
        }

        let value;
        if (globals.ourTurn) {
            value = 'pause';
        } else if (globals.pauseQueued) {
            value = 'pause-unqueue';
            globals.pauseQueued = false;
        } else {
            value = 'pause-queue';
            globals.pauseQueued = true;
        }
        globals.lobby.conn.send('pause', {
            value,
        });

        const wasVisible = globals.elements.timer1Circle!.visible();
        if (wasVisible !== globals.pauseQueued) {
            globals.elements.timer1Circle!.visible(globals.pauseQueued);
            globals.layers.get('UI')!.batchDraw();
        }
    });

    // The timer for the current player
    globals.elements.timer2 = new TimerDisplay({
        x: timerValues.x2 * winW,
        y: timerValues.y2 * winH,
        width: timerValues.w * winW,
        height: timerValues.h * winH,
        fontSize: timerValues.fontSize * winH,
        labelFontSize: 0.02 * winH,
        cornerRadius: timerValues.cornerRadius * winH,
        spaceH: timerValues.spaceH * winH,
        visible: false,
        listening: true,
    });
    globals.layers.get('timer')!.add(globals.elements.timer2 as any);
    if (globals.timed) {
        globals.elements.timer2.tooltipName = 'time-taken';
        // (the content will be updated in the "setTickingDownTimeCPTooltip()" function)
        tooltips.init(globals.elements.timer2, true, false);
    }
};

const drawClueArea = () => {
    // Put the clue area directly below the play stacks, with a little bit of spacing
    clueAreaValues = {
        x: playAreaValues.x,
        y: playAreaValues.y + playAreaValues.h! + 0.005,
        w: playAreaValues.w,
        h: 0.23,
    };
    if (globals.variant.showSuitNames) {
        clueAreaValues.y += 0.03;
    }
    // In BGA mode, we can afford to put a bit more spacing to make it look less packed together
    if (!globals.lobby.settings.get('keldonMode')) {
        clueAreaValues.y += 0.02;
    }
    globals.elements.clueArea = new Konva.Group({
        x: clueAreaValues.x * winW,
        y: clueAreaValues.y * winH,
        width: clueAreaValues.w! * winW,
    });

    // Player buttons
    const playerButtonW = 0.08;
    const playerButtonSpacing = 0.0075;
    const numPlayers = globals.playerNames.length;

    // This is the normal button group, which does not include us
    globals.elements.clueTargetButtonGroup = new ButtonGroup({});
    {
        const totalPlayerButtons = numPlayers - 1;
        let totalPlayerWidth = playerButtonW * totalPlayerButtons;
        totalPlayerWidth += playerButtonSpacing * (totalPlayerButtons - 1);
        let playerX = (clueAreaValues.w! * 0.5) - (totalPlayerWidth * 0.5);
        for (let i = 0; i < totalPlayerButtons; i++) {
            const j = (globals.playerUs + i + 1) % numPlayers;
            const button = new PlayerButton({
                x: playerX * winW,
                y: 0,
                width: playerButtonW * winW,
                height: 0.025 * winH,
                text: globals.playerNames[j],
            }, j);
            globals.elements.clueTargetButtonGroup!.add(button as any);
            globals.elements.clueTargetButtonGroup!.addList(button);
            playerX += playerButtonW + playerButtonSpacing;
        }
    }
    globals.elements.clueArea.add(globals.elements.clueTargetButtonGroup as any);

    // This button group includes us, which is used for hypotheticals
    globals.elements.clueTargetButtonGroup2 = new ButtonGroup({});
    {
        const totalPlayerButtons = numPlayers;
        let totalPlayerWidth = playerButtonW * totalPlayerButtons;
        totalPlayerWidth += playerButtonSpacing * (totalPlayerButtons - 1);
        let playerX = (clueAreaValues.w! * 0.5) - (totalPlayerWidth * 0.5);
        for (let i = 0; i < totalPlayerButtons; i++) {
            const j = (globals.playerUs + i + 1) % numPlayers;
            const button = new PlayerButton({
                x: playerX * winW,
                y: 0,
                width: playerButtonW * winW,
                height: 0.025 * winH,
                text: globals.playerNames[j],
            }, j);
            globals.elements.clueTargetButtonGroup2!.add(button as any);
            globals.elements.clueTargetButtonGroup2!.addList(button);
            playerX += playerButtonW + playerButtonSpacing;
        }
    }
    globals.elements.clueArea.add(globals.elements.clueTargetButtonGroup2 as any);
    globals.elements.clueTargetButtonGroup2.hide();

    // Clue type buttons
    globals.elements.clueTypeButtonGroup = new ButtonGroup({});

    const buttonW = 0.04;
    const buttonH = 0.071;
    const buttonSpacing = 0.009;

    // Color buttons
    globals.elements.colorClueButtons = [];
    let totalColorWidth = buttonW * globals.variant.clueColors.length;
    totalColorWidth += buttonSpacing * (globals.variant.clueColors.length - 1);
    const colorX = (clueAreaValues.w! * 0.5) - (totalColorWidth * 0.5);
    for (let i = 0; i < globals.variant.clueColors.length; i++) {
        const color = globals.variant.clueColors[i];
        const button = new ColorButton({
            x: (colorX + (i * (buttonW + buttonSpacing))) * winW,
            y: 0.027 * winH,
            width: buttonW * winW,
            height: buttonH * winH,
            color: color.fill,
            text: color.abbreviation,
            clue: new Clue(CLUE_TYPE.COLOR, color),
        }, globals.lobby.settings.get('colorblindMode'));

        globals.elements.clueTypeButtonGroup!.add(button as any);
        globals.elements.clueTypeButtonGroup!.addList(button);
        globals.elements.colorClueButtons.push(button);
    }

    // Rank buttons / number buttons
    globals.elements.rankClueButtons = [];
    const numRanks = globals.variant.clueRanks.length;
    let totalRankWidth = buttonW * numRanks;
    totalRankWidth += buttonSpacing * (numRanks - 1);
    const rankX = (clueAreaValues.w! * 0.5) - (totalRankWidth * 0.5);
    for (const rank of globals.variant.clueRanks) {
        const i = rank - 1;
        const button = new RankButton({
            x: (rankX + (i * (buttonW + buttonSpacing))) * winW,
            y: 0.1 * winH,
            width: buttonW * winW,
            height: buttonH * winH,
            number: rank,
            clue: new Clue(CLUE_TYPE.RANK, rank),
        });

        globals.elements.clueTypeButtonGroup!.add(button as any);
        globals.elements.clueTypeButtonGroup!.addList(button);
        globals.elements.rankClueButtons.push(button);
    }

    // Set button functionality
    globals.elements.clueTargetButtonGroup.on('change', clues.checkLegal);
    globals.elements.clueTargetButtonGroup2!.on('change', clues.checkLegal);
    globals.elements.clueTypeButtonGroup!.on('change', clues.checkLegal);

    globals.elements.clueArea.add(globals.elements.clueTypeButtonGroup as any);

    // The "Give Clue" button
    const giveClueW = 0.236;
    const giveClueX = (clueAreaValues.w! * 0.5) - (giveClueW * 0.5);
    globals.elements.giveClueButton = new Button({
        x: giveClueX * winW,
        y: 0.173 * winH,
        width: giveClueW * winW,
        height: 0.051 * winH,
        text: 'Give Clue',
    }, []);
    globals.elements.giveClueButton.setEnabled(false);
    globals.elements.clueArea.add(globals.elements.giveClueButton as any);
    globals.elements.giveClueButton.on('click tap', clues.give);

    globals.elements.clueArea.hide();
    globals.layers.get('UI')!.add(globals.elements.clueArea);
};

const drawClueAreaDisabled = () => {
    // We fade the clue area and draw a rectangle on top of it when there are no clues available
    globals.elements.clueAreaDisabled = new Konva.Group({
        x: clueAreaValues.x * winW,
        y: clueAreaValues.y * winH,
        width: clueAreaValues.w! * winW,
    });

    // A transparent rectangle to stop clicks
    const rect = new Konva.Rect({
        width: clueAreaValues.w! * winW,
        height: clueAreaValues.h! * winH,
        listening: true, // It must listen or it won't stop clicks
    });
    globals.elements.clueAreaDisabled.add(rect);

    const spacing = {
        x: 0.075,
        y: 0.03,
    };
    const lineColor = '#1a1a1a';

    // The line from top-left to bottom-right
    const line1 = new Konva.Line({
        points: [
            spacing.x * winW,
            spacing.y * winH,
            (clueAreaValues.w! - spacing.x) * winW,
            (clueAreaValues.h! - spacing.y) * winH,
        ],
        stroke: lineColor,
        strokeWidth: 5,
    });
    globals.elements.clueAreaDisabled.add(line1);

    // The line from bottom-left to top-right
    const line2 = new Konva.Line({
        points: [
            spacing.x * winW,
            (clueAreaValues.h! - spacing.y) * winH,
            (clueAreaValues.w! - spacing.x) * winW,
            spacing.y * winH,
        ],
        stroke: lineColor,
        strokeWidth: 5,
    });
    globals.elements.clueAreaDisabled.add(line2);

    // The "No clues available" text
    const noCluesText = new FitText({
        y: clueAreaValues.h! * 0.4 * winH,
        width: clueAreaValues.w! * winW,
        fontSize: 0.07 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: 'No clues',
        fill: LABEL_COLOR,
        stroke: 'black',
    });
    globals.elements.clueAreaDisabled.add(noCluesText);

    globals.elements.clueAreaDisabled.hide();
    globals.layers.get('UI')!.add(globals.elements.clueAreaDisabled);
};

const drawCurrentPlayerArea = () => {
    // The "Current player: [player name]" box
    const currentPlayerAreaWidth = 0.3; // This is big enough to fit in between the two timers
    const currentPlayerAreaValues = {
        x: clueAreaValues.x + (clueAreaValues.w! / 2) - (currentPlayerAreaWidth / 2),
        y: clueAreaValues.y + 0.015,
        w: currentPlayerAreaWidth,
        h: 0.15,
        spacing: 0.006,
    };
    globals.elements.currentPlayerArea = new CurrentPlayerArea(currentPlayerAreaValues, winW, winH);
    if (globals.replay) {
        globals.elements.currentPlayerArea.hide();
    }
    globals.layers.get('UI')!.add(globals.elements.currentPlayerArea as any);
};

const drawPreplayArea = () => {
    const w = 0.29;
    const h = 0.1;
    const x = clueAreaValues.x + (clueAreaValues.w! / 2) - (w / 2);
    const y = clueAreaValues.y + 0.05; // "clueAreaValues.h" does not exist
    globals.elements.premoveCancelButton = new Button({
        x: x * winW,
        y: y * winH,
        width: w * winW,
        height: h * winH,
        text: 'Cancel Pre-Move',
        visible: false,
    }, []);
    globals.layers.get('UI')!.add(globals.elements.premoveCancelButton as any);
    globals.elements.premoveCancelButton.on('click tap', () => {
        globals.elements.premoveCancelButton!.hide();
        globals.elements.currentPlayerArea!.show();
        globals.layers.get('UI')!.batchDraw();

        if (globals.queuedAction === null) {
            return;
        }

        // If we dragged a card, we have to put the card back in the hand
        if (
            globals.queuedAction.type === ACTION.PLAY
            || globals.queuedAction.type === ACTION.DISCARD
        ) {
            globals.elements.playerHands[globals.playerUs].doLayout();
        }

        globals.queuedAction = null;
    });
};

const drawHypotheticalArea = () => {
    // The "Hypothetical" circle that shows whether or not we are currently in a hypothetical
    globals.elements.hypoCircle = new Konva.Group({
        x: clueAreaValues.x * winW,
        y: clueAreaValues.y * winH,
        visible: false,
    });
    globals.layers.get('UI')!.add(globals.elements.hypoCircle);

    const circle = new Konva.Ellipse({
        x: (clueAreaValues.w! * 0.5) * winW,
        y: 0.105 * winH,
        radiusX: clueAreaValues.w! * 0.4 * winW,
        radiusY: 0.05 * winH,
        fill: 'black',
        opacity: 0.5,
        stroke: 'black',
        strokeWidth: 4,
    });
    globals.elements.hypoCircle.add(circle);

    const hypoValues = {
        y: 0.075,
        w: clueAreaValues.w! * 0.6,
    };
    const text = new FitText({
        name: 'text',
        x: ((clueAreaValues.w! * 0.5) - (hypoValues.w * 0.5)) * winW,
        y: 0.075 * winH,
        width: hypoValues.w * winW,
        fontSize: 0.5 * winH,
        fontFamily: 'Verdana',
        fill: LABEL_COLOR,
        align: 'center',
        text: 'Hypothetical',
    });
    globals.elements.hypoCircle.add(text);
};

const drawPauseArea = () => {
    const pauseAreaValues = {
        w: 0.5,
        h: 0.5,
    };

    globals.elements.pauseArea = new Konva.Group({
        x: 0.25 * winW,
        y: 0.25 * winH,
        visible: false,
    });
    globals.layers.get('UI2')!.add(globals.elements.pauseArea);

    const pauseRect = new Konva.Rect({
        width: pauseAreaValues.w * winW,
        height: pauseAreaValues.h * winH,
        fill: '#b3b3b3',
        cornerRadius: 0.01 * winH,
        listening: true,
    });
    globals.elements.pauseArea.add(pauseRect);

    const pauseTitle = new Konva.Text({
        y: 0.1 * winH,
        width: pauseAreaValues.w * winW,
        fontFamily: 'Verdana',
        fontSize: 0.08 * winH,
        text: 'Game Paused',
        align: 'center',
        fill: 'white',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });
    globals.elements.pauseArea.add(pauseTitle);

    globals.elements.pauseText = new Konva.Text({
        y: 0.21 * winH,
        width: pauseAreaValues.w * winW,
        fontFamily: 'Verdana',
        fontSize: 0.05 * winH,
        text: 'by: [username]',
        align: 'center',
        fill: 'white',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });
    globals.elements.pauseArea.add(globals.elements.pauseText);

    const button1W = pauseAreaValues.w * 0.40;
    const button2W = pauseAreaValues.w * 0.125;
    const buttonH = 0.33;
    const spacing = pauseAreaValues.w * 0.1;

    globals.elements.pauseButton = new Button({
        x: spacing * winW,
        y: buttonH * winH,
        width: button1W * winW,
        height: 0.1 * winH,
        text: 'Unpause',
    }, []);
    globals.elements.pauseButton.on('click tap', () => {
        globals.lobby.conn.send('pause', {
            value: 'unpause',
        });
    });
    globals.elements.pauseArea.add(globals.elements.pauseButton as any);

    const chatButton = new Button({
        x: (pauseAreaValues.w - (button2W * 2) - (spacing * 2)) * winW,
        y: buttonH * winH,
        width: button2W * winW,
        height: 0.1 * winH,
        text: '💬',
    }, []);
    globals.elements.pauseArea.add(chatButton as any);
    chatButton.on('click tap', () => {
        globals.game.chat.toggle();
    });

    const lobbyButton = new Button({
        x: (pauseAreaValues.w - button2W - (spacing * 1.5)) * winW,
        y: buttonH * winH,
        width: button2W * winW,
        height: 0.1 * winH,
    }, [globals.ImageLoader!.get('home')!]);
    globals.elements.pauseArea.add(lobbyButton as any);
    lobbyButton.on('click tap', lobbyButtonClick);
};

const drawExtraAnimations = () => {
    // These images are shown to the player to
    // indicate which direction we are moving in a shared replay
    const x = (playAreaValues.x + (playAreaValues.w! / 2) - 0.05);
    const y = (playAreaValues.y + (playAreaValues.h! / 2) - 0.05);
    const size = 0.1;

    globals.elements.sharedReplayForward = new Konva.Image({
        x: x * winW,
        y: y * winH,
        width: size * winW,
        height: size * winH,
        image: globals.ImageLoader!.get('replay-forward')!,
        opacity: 0,
    });
    globals.layers.get('UI2')!.add(globals.elements.sharedReplayForward);
    globals.elements.sharedReplayForwardTween = new Konva.Tween({
        node: globals.elements.sharedReplayForward,
        duration: 0.5,
        opacity: 1,
        onFinish: () => {
            if (globals.elements.sharedReplayForwardTween) {
                globals.elements.sharedReplayForwardTween.reverse();
            }
        },
    });

    globals.elements.sharedReplayBackward = new Konva.Image({
        x: x * winW,
        y: y * winH,
        width: size * winW,
        height: size * winH,
        image: globals.ImageLoader!.get('replay-back')!,
        opacity: 0,
    });
    globals.layers.get('UI2')!.add(globals.elements.sharedReplayBackward);
    globals.elements.sharedReplayBackwardTween = new Konva.Tween({
        node: globals.elements.sharedReplayBackward,
        duration: 0.5,
        opacity: 1,
        onFinish: () => {
            if (globals.elements.sharedReplayBackwardTween) {
                globals.elements.sharedReplayBackwardTween.reverse();
            }
        },
    });
};

// Subroutines
function lobbyButtonClick(this: Button) {
    // Unregister the click handler to ensure that the user does not double-click
    // and go to the lobby twice
    this.off('click tap');

    backToLobby();
}
