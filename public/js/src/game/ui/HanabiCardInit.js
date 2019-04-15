/*
    Initialization functions for the HanabiCard object
*/

// Imports
const constants = require('../../constants');
const drawCards = require('./drawCards');
const globals = require('./globals');
const graphics = require('./graphics');
const HanabiCardClick = require('./HanabiCardClick');
const HanabiCardClickSpeedrun = require('./HanabiCardClickSpeedrun');
const notes = require('./notes');
const ui = require('./ui');

exports.image = function image() {
    // Create the "bare" card image, which is the main card grahpic
    // If the card is not revealed, it will just be a gray rectangle
    // The pips and other elements of a card are drawn on top of the bare image
    this.bare = new graphics.Image({
        width: constants.CARD_W,
        height: constants.CARD_H,
    });
    const self = this;
    this.bare.setSceneFunc(function setSceneFunc(context) {
        scaleCardImage(
            context,
            self.bareName,
            this.getWidth(),
            this.getHeight(),
            this.getAbsoluteTransform(),
        );
    });
    this.add(this.bare);
};

exports.border = function border() {
    // The card will get a border when it becomes clued
    this.cluedBorder = new graphics.Rect({
        x: 3,
        y: 3,
        width: constants.CARD_W - 6,
        height: constants.CARD_H - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffdf00', // Yellow
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);
};

exports.pips = function pips() {
    // Initialize the suit pips, which are colored shapes
    this.suitPips = new graphics.Group({
        x: 0,
        y: 0,
        width: Math.floor(constants.CARD_W),
        height: Math.floor(constants.CARD_H),
        visible: false,
        listening: false,
    });
    this.add(this.suitPips);

    const { suits } = globals.variant;
    this.suitPipsMap = new Map();
    this.suitPipsXMap = new Map();
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Set the pip at the middle of the card
        const x = Math.floor(constants.CARD_W * 0.5);
        const y = Math.floor(constants.CARD_H * 0.5);
        const scale = { // Scale numbers are magic
            x: 0.4,
            y: 0.4,
        };
        // Transform polar to Cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        // We don't know why it's needed; perhaps something to do with the shape functions
        const offsetBase = constants.CARD_W * 0.7;
        const offsetTrig = ((-i / suits.length) + 0.25) * Math.PI * 2;
        const offset = {
            x: Math.floor(offsetBase * Math.cos(offsetTrig) + constants.CARD_W * 0.25),
            y: Math.floor(offsetBase * Math.sin(offsetTrig) + constants.CARD_W * 0.3),
        };
        let fill = suit.fillColors.hexCode;
        if (suit === constants.SUIT.RAINBOW || suit === constants.SUIT.DARKRAINBOW) {
            fill = undefined;
        }

        const suitPip = new graphics.Shape({
            x,
            y,
            scale,
            offset,
            fill,
            stroke: 'black',
            strokeWidth: 5,
            sceneFunc: (ctx) => {
                drawCards.drawSuitShape(suit, i)(ctx);
                ctx.closePath();
                ctx.fillStrokeShape(suitPip);
            },
            listening: false,
        });

        // Gradient numbers are magic
        if (suit === constants.SUIT.RAINBOW || suit === constants.SUIT.DARKRAINBOW) {
            suitPip.fillRadialGradientColorStops([
                0.3, suit.fillColors[0].hexCode,
                0.425, suit.fillColors[1].hexCode,
                0.65, suit.fillColors[2].hexCode,
                0.875, suit.fillColors[3].hexCode,
                1, suit.fillColors[4].hexCode,
            ]);
            suitPip.fillRadialGradientStartPoint({
                x: 75,
                y: 140,
            });
            suitPip.fillRadialGradientEndPoint({
                x: 75,
                y: 140,
            });
            suitPip.fillRadialGradientStartRadius(0);
            suitPip.fillRadialGradientEndRadius(Math.floor(constants.CARD_W * 0.25));
        }
        suitPip.rotation(0);
        this.suitPips.add(suitPip);
        this.suitPipsMap.set(suit, suitPip);

        // Also create the X that will show when a certain suit can be ruled out
        const suitPipX = new graphics.Shape({
            x,
            y,
            scale,
            offset,
            fill: 'black',
            stroke: 'black',
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 50;
                const xx = Math.floor((constants.CARD_W * 0.25) - (width * 0.45));
                const xy = Math.floor((constants.CARD_H * 0.25) - (width * 0.05));
                drawX(ctx, shape, xx, xy, 50, width);
            },
            listening: false,
        });
        this.suitPips.add(suitPipX);
        this.suitPipsXMap.set(suit, suitPipX);
    }

    // Initialize the rank pips, which are black squares along the bottom of the card
    this.rankPips = new graphics.Group({
        x: 0,
        y: Math.floor(constants.CARD_H * 0.85),
        width: constants.CARD_W,
        height: Math.floor(constants.CARD_H * 0.15),
        visible: false,
        listening: false,
    });
    this.add(this.rankPips);

    this.rankPipsMap = new Map();
    this.rankPipsXMap = new Map();
    for (const rank of globals.variant.ranks) {
        const x = Math.floor(constants.CARD_W * (rank * 0.19 - 0.14));
        const y = 0;
        const rankPip = new graphics.Rect({
            x,
            y,
            width: Math.floor(constants.CARD_W * 0.15),
            height: Math.floor(constants.CARD_H * 0.10),
            fill: 'black',
            stroke: 'black',
            cornerRadius: 0.02 * constants.CARD_H,
            listening: false,
        });
        this.rankPips.add(rankPip);
        this.rankPipsMap.set(rank, rankPip);

        // Also create the X that will show when a certain rank can be ruled out
        const rankPipX = new graphics.Shape({
            x,
            y,
            fill: '#e6e6e6',
            stroke: 'black',
            strokeWidth: 2,
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 20;
                const xx = Math.floor(constants.CARD_W * 0.04);
                const xy = Math.floor(constants.CARD_H * 0.05);
                drawX(ctx, shape, xx, xy, 12, width);
            },
            listening: false,
        });
        this.rankPips.add(rankPipX);
        this.rankPipsXMap.set(rank, rankPipX);
    }
};

exports.note = function note() {
    // Define the note indicator image
    const noteX = 0.78;
    const noteY = 0.03;
    const size = 0.2 * constants.CARD_W;
    this.noteGiven = new graphics.Image({
        x: noteX * constants.CARD_W,
        // If the cards have triangles on the corners that show the color composition,
        // the images will overlap
        // Thus, we move it downwards if this is the case
        y: (globals.variant.offsetCornerElements ? noteY + 0.1 : noteY) * constants.CARD_H,
        align: 'center',
        image: globals.ImageLoader.get('note'),
        width: size,
        height: size,
        rotation: 180,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
        listening: false,
    });
    this.noteGiven.setScale({
        x: -1,
        y: -1,
    });
    this.noteGiven.rotated = false;
    // (we might rotate it later to indicate to spectators that the note was updated)
    this.add(this.noteGiven);
    if (notes.get(this.order)) {
        this.noteGiven.show();
    }

    // If the user mouses over the card, show a tooltip that contains the note
    // (we don't use the "tooltip.init()" function because we need the extra conditions in the
    // "mousemove" event)
    this.tooltipName = `card-${this.order}`;
    this.on('mousemove', function cardMouseMove() {
        // Don't do anything if there is not a note on this card
        if (!this.noteGiven.visible()) {
            return;
        }

        // Don't open any more note tooltips if the user is currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        // If we are spectating and there is an new note, mark it as seen
        if (this.noteGiven.rotated) {
            this.noteGiven.rotated = false;
            this.noteGiven.rotate(-15);
            globals.layers.card.batchDraw();
        }

        globals.activeHover = this;
        notes.show(this); // We supply the card as the argument
    });

    this.on('mouseout', function cardMouseOut() {
        globals.activeHover = null;

        // Don't close the tooltip if we are currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        const tooltip = $(`#tooltip-${this.tooltipName}`);
        tooltip.tooltipster('close');
    });
};

exports.empathy = function empathy() {
    // Click on a teammate's card to have the card show as it would to that teammate
    // (or, in a replay, show your own card as it appeared at that moment in time)
    // Pips visibility state is tracked so it can be restored for your own hand during a game
    const toggleHolderViewOnCard = (card, enabled, togglePips) => {
        const toggledPips = [0, 0];
        if (card.rankPips.getVisible() !== enabled && togglePips[0] === 1) {
            card.rankPips.setVisible(enabled);
            toggledPips[0] = 1;
        }
        if (card.suitPips.getVisible() !== enabled && togglePips[1] === 1) {
            card.suitPips.setVisible(enabled);
            toggledPips[1] = 1;
        }
        card.empathy = enabled;
        card.setBareImage();
        return toggledPips;
    };

    // Dynamically adjusted known cards, to be restored by event
    const toggledHolderViewCards = [];

    const beginHolderViewOnCard = function beginHolderViewOnCard(cards) {
        if (toggledHolderViewCards.length > 0) {
            return undefined; // Handle race conditions with stop
        }

        toggledHolderViewCards.splice(0, 0, ...cards);
        const toggledPips = cards.map(c => toggleHolderViewOnCard(c, true, [1, 1]));
        globals.layers.card.batchDraw();
        return toggledPips;
    };
    const endHolderViewOnCard = function endHolderViewOnCard(toggledPips) {
        const cardsToReset = toggledHolderViewCards.splice(0, toggledHolderViewCards.length);
        cardsToReset.map(
            (card, index) => toggleHolderViewOnCard(card, false, toggledPips[index]),
        );
        globals.layers.card.batchDraw();
    };

    const empathyMouseButton = 1; // Left-click
    let toggledPips = [];
    this.on('mousedown', (event) => {
        if (
            event.evt.which !== empathyMouseButton // Only enable Empathy for left-clicks
            // Disable Empathy if a modifier key is pressed
            // (unless we are in a speedrun,
            // because then Empathy is mapped to Ctrl + left click)
            || (event.evt.ctrlKey && !globals.speedrun)
            || (!event.evt.ctrlKey && globals.speedrun && !globals.replay)
            || event.evt.shiftKey
            || event.evt.altKey
            || event.evt.metaKey
            || this.tweening // Disable Empathy if the card is tweening
            || this.isPlayed // Clicking on a played card goes to the turn that it was played
            // Clicking on a discarded card goes to the turn that it was discarded
            || this.isDiscarded
            // Disable Empathy on our own hand
            // (unless we are in an in-game replay or we are a spectator)
            || (this.holder === globals.playerUs && !globals.inReplay && !globals.spectating)
            // Disable Empathy if we in a hypothetical and are the shared replay leader
            || (globals.hypothetical && globals.amSharedReplayLeader)
        ) {
            return;
        }

        globals.activeHover = this;
        const cards = this.parent.parent.children.map(c => c.children[0]);
        toggledPips = beginHolderViewOnCard(cards);
    });
    this.on('mouseup mouseout', (event) => {
        if (event.type === 'mouseup' && event.evt.which !== empathyMouseButton) {
            return;
        }
        globals.activeHover = null;
        endHolderViewOnCard(toggledPips);
    });
};

exports.click = function click() {
    // Define the clue log mouse handlers
    this.on('mousemove tap', () => {
        globals.elements.clueLog.showMatches(this);
        globals.layers.UI.batchDraw();
    });
    this.on('mouseout', () => {
        globals.elements.clueLog.showMatches(null);
        globals.layers.UI.batchDraw();
    });

    // Define the other mouse handlers
    this.on('click tap', HanabiCardClick);
    this.on('mousedown', HanabiCardClickSpeedrun);
    this.on('mousedown', (event) => {
        // Hide any visible arrows when a user begins to drag a card in their hand
        if (
            event.evt.which !== 1 // Dragging uses left click
            || (this.holder !== globals.playerUs && !globals.hypothetical)
            || globals.inReplay
            || globals.replay
            || globals.spectating
            || !this.parent.getDraggable()
            || this.isPlayed
            || this.isDiscarded
        ) {
            return;
        }

        ui.hideAllArrows();
    });
};

exports.possibilities = function possibilities() {
    if (globals.lobby.settings.realLifeMode) {
        return;
    }

    // We want to remove all of the currently seen cards from the list of possibilities
    for (let i = 0; i < globals.indexOfLastDrawnCard; i++) {
        const card = globals.deck[i];

        // Don't do anything if this is one of our cards
        if (card.trueSuit === null || card.trueRank === null) {
            continue;
        }

        // Don't do anything if this player does not know what this card is yet
        if (card.holder === this.holder) {
            continue;
        }

        // If the card is still in the player's hand,
        // then we can't remove it from the list of possibilities,
        // because they don't know what it is yet
        // TODO
        /*
        if (
            card.holder === this.holder
            && !card.isPlayed
            && !card.isDiscarded
            && card.possibleSuits.length !== 1
            && card.possibleRanks.length !== 1
        ) {
            continue;
        }
        */

        this.removePossibility(card.trueSuit, card.trueRank, false);
    }
};

/*
    Misc. functions
*/

const scaleCardImage = (context, name, width, height, am) => {
    let src = globals.cardImages[name];

    if (!src) {
        console.error(`The image "${name}" was not generated.`);
        return;
    }

    const dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
    const dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

    if (dw < 1 || dh < 1) {
        return;
    }

    let sw = width;
    let sh = height;
    let steps = 0;

    if (!globals.scaledCardImages[name]) {
        globals.scaledCardImages[name] = [];
    }

    // This code was written by Keldon;
    // scaling the card down in steps of half in each dimension presumably improves the scaling
    while (dw < sw / 2) {
        let scaleCanvas = globals.scaledCardImages[name][steps];
        sw = Math.floor(sw / 2);
        sh = Math.floor(sh / 2);

        if (!scaleCanvas) {
            scaleCanvas = document.createElement('canvas');
            scaleCanvas.width = sw;
            scaleCanvas.height = sh;

            const scaleContext = scaleCanvas.getContext('2d');
            scaleContext.drawImage(src, 0, 0, sw, sh);
            globals.scaledCardImages[name][steps] = scaleCanvas;
        }

        src = scaleCanvas;
        steps += 1;
    }

    context.drawImage(src, 0, 0, width, height);
};

const drawX = (ctx, shape, x, y, size, width) => {
    // Start at the top left corner and draw an X
    ctx.beginPath();
    x -= size;
    y -= size;
    ctx.moveTo(x, y);
    x += width / 2;
    y -= width / 2;
    ctx.lineTo(x, y);
    x += size;
    y += size;
    ctx.lineTo(x, y);
    x += size;
    y -= size;
    ctx.lineTo(x, y);
    x += width / 2;
    y += width / 2;
    ctx.lineTo(x, y);
    x -= size;
    y += size;
    ctx.lineTo(x, y);
    x += size;
    y += size;
    ctx.lineTo(x, y);
    x -= width / 2;
    y += width / 2;
    ctx.lineTo(x, y);
    x -= size;
    y -= size;
    ctx.lineTo(x, y);
    x -= size;
    y += size;
    ctx.lineTo(x, y);
    x -= width / 2;
    y -= width / 2;
    ctx.lineTo(x, y);
    x += size;
    y -= size;
    ctx.lineTo(x, y);
    x -= size;
    y -= size;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();
    ctx.fillStrokeShape(shape);
};
