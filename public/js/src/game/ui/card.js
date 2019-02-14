/*
    The HanabiCard object, which represts a single card
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const cardDraw = require('./cardDraw');
const graphics = require('./graphics');
const notes = require('./notes');
const replay = require('./replay');

// Constants
const {
    CARDH,
    CARDW,
    CLUE_TYPE,
    SUIT,
} = constants;

const HanabiCard = function HanabiCard(config) {
    const self = this;

    config.width = CARDW;
    config.height = CARDH;
    config.x = CARDW / 2;
    config.y = CARDH / 2;
    config.offset = {
        x: CARDW / 2,
        y: CARDH / 2,
    };

    graphics.Group.call(this, config);

    this.tweening = false;

    this.bare = new graphics.Image({
        width: config.width,
        height: config.height,
    });

    this.doRotations = function doRotations(inverted = false) {
        this.setRotation(inverted ? 180 : 0);

        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? config.width : 0);
        this.bare.setY(inverted ? config.height : 0);
    };

    this.bare.setSceneFunc(function setSceneFunc(context) {
        cardDraw.scaleCardImage(
            context,
            self.barename,
            this.getWidth(),
            this.getHeight(),
            this.getAbsoluteTransform(),
        );
    });
    this.add(this.bare);

    this.holder = config.holder;

    this.trueSuit = config.suit || undefined;
    this.trueRank = config.rank || undefined;
    this.suitKnown = function suitKnown() {
        return this.trueSuit !== undefined;
    };
    this.rankKnown = function rankKnown() {
        return this.trueRank !== undefined;
    };
    this.identityKnown = function identityKnown() {
        return this.suitKnown() && this.rankKnown();
    };
    this.order = config.order;
    // Possible suits and ranks (based on clues given) are tracked separately from knowledge of
    // the true suit and rank
    this.possibleSuits = config.suits;
    this.possibleRanks = config.ranks;

    this.rankPips = new graphics.Group({
        x: 0,
        y: Math.floor(CARDH * 0.85),
        width: CARDW,
        height: Math.floor(CARDH * 0.15),
        visible: !this.rankKnown(),
    });
    this.suitPips = new graphics.Group({
        x: 0,
        y: 0,
        width: Math.floor(CARDW),
        height: Math.floor(CARDH),
        visible: !this.suitKnown(),
    });
    this.add(this.rankPips);
    this.add(this.suitPips);

    const cardPresentKnowledge = globals.learnedCards[this.order];
    if (cardPresentKnowledge.rank) {
        this.rankPips.visible(false);
    }
    if (cardPresentKnowledge.suit) {
        this.suitPips.visible(false);
    }
    if (globals.replay) {
        this.rankPips.visible(false);
        this.suitPips.visible(false);
    }

    for (const i of config.ranks) {
        const rankPip = new graphics.Rect({
            x: Math.floor(CARDW * (i * 0.19 - 0.14)),
            y: 0,
            width: Math.floor(CARDW * 0.15),
            height: Math.floor(CARDH * 0.10),
            fill: 'black',
            stroke: 'black',
            name: i.toString(),
            listening: false,
        });
        if (!globals.learnedCards[this.order].possibleRanks.includes(i)) {
            rankPip.setOpacity(0.3);
        }
        this.rankPips.add(rankPip);
    }

    const { suits } = config;
    const nSuits = suits.length;
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        let fill = suit.fillColors.hexCode;
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
            fill = undefined;
        }

        const suitPip = new graphics.Shape({
            x: Math.floor(CARDW * 0.5),
            y: Math.floor(CARDH * 0.5),

            // Scale numbers are magic
            scale: {
                x: 0.4,
                y: 0.4,
            },

            // Transform polar to cartesian coordinates
            // The magic number added to the offset is needed to center things properly;
            // We don't know why it's needed;
            // perhaps something to do with the shape functions
            offset: {
                x: Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25), // eslint-disable-line
                y: Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3), // eslint-disable-line
            },
            fill,
            stroke: 'black',
            name: suit.name,
            listening: false,
            /* eslint-disable no-loop-func */
            sceneFunc: (ctx) => {
                cardDraw.drawSuitShape(suit, i)(ctx);
                ctx.closePath();
                ctx.fillStrokeShape(suitPip);
            },
            /* eslint-enable no-loop-func */
        });

        // Gradient numbers are magic
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
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
            suitPip.fillRadialGradientEndRadius(Math.floor(CARDW * 0.25));
        }
        suitPip.rotation(0);

        // Reduce opactity of eliminated suits and outline remaining suits
        if (!globals.learnedCards[this.order].possibleSuits.includes(suit)) {
            suitPip.setOpacity(0.4);
        } else {
            suitPip.setStrokeWidth(5);
        }

        this.suitPips.add(suitPip);
    }

    this.barename = undefined;
    this.showOnlyLearned = false;

    this.setBareImage();

    this.cluedBorder = new graphics.Rect({
        x: 3,
        y: 3,
        width: config.width - 6,
        height: config.height - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffbb00', // Orange
        // (it will turn to a different color after it is no longer freshly clued)
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);

    this.turnClued = null;
    this.isClued = function isClued() {
        return this.turnClued !== null;
    };
    this.isDiscarded = false;
    this.turnDiscarded = null;
    this.isPlayed = false;
    this.turnPlayed = null;

    this.indicatorGroup = new graphics.Group({
        y: -config.height / 4,
        width: config.width,
        height: 0.5 * config.height,
        visible: false,
        listening: false,
    });
    this.add(this.indicatorGroup);

    this.indicatorArrow = new graphics.Arrow({
        points: [
            config.width / 2,
            0,
            config.width / 2,
            config.height / 2.5,
        ],
        pointerLength: 20,
        pointerWidth: 20,
        fill: 'white',
        stroke: 'white',
        strokeWidth: 25,
        shadowColor: 'black',
        shadowBlur: 75,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 1,
        visible: true,
        listening: false,
    });
    this.indicatorGroup.add(this.indicatorArrow);

    this.indicatorCircle = new graphics.Circle({
        x: 0.5 * config.width,
        y: 0.15 * config.height,
        radius: 45,
        fill: 'black',
        stroke: 'white',
        strokeWidth: 5,
        listening: false,
    });
    this.indicatorGroup.add(this.indicatorCircle);

    let x;
    let y;
    let rotation;
    if (this.holder === globals.playerUs) {
        rotation = 0;
        x = (0.5 * config.width) - (this.indicatorCircle.getAttr('width') / 2);
        y = (0.15 * config.height) - (this.indicatorCircle.getAttr('height') / 2.75);
    } else {
        rotation = 180;
        x = (0.82 * config.width) - (this.indicatorCircle.getAttr('width') / 2);
        y = (0.31 * config.height) - (this.indicatorCircle.getAttr('height') / 2.75);
    }
    this.indicatorText = new graphics.Text({
        x,
        y,
        width: this.indicatorCircle.getAttr('width'),
        height: this.indicatorCircle.getAttr('height'),
        fontSize: 0.175 * config.height,
        fontFamily: 'Verdana',
        fill: 'white',
        stroke: 'white',
        strokeWidth: 1,
        align: 'center',
        rotation,
        listening: false,
    });
    this.indicatorGroup.add(this.indicatorText);

    // Define the note indicator emoji (this used to be a white square)
    const noteX = 0.78;
    const noteY = 0.06;
    this.noteGiven = new graphics.Text({
        x: noteX * config.width,
        // If the cards have triangles on the corners that show the color composition,
        // the note emoji will overlap
        // Thus, we move it downwards if this is the case
        y: (globals.variant.offsetCardIndicators ? noteY + 0.1 : noteY) * config.height,
        fontSize: 0.1 * config.height,
        fontFamily: 'Verdana',
        align: 'center',
        text: '📝',
        rotation: 180,
        fill: '#ffffff',
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

    /*
        Define event handlers
        Multiple handlers may set activeHover
    */

    this.on('mousemove', function cardMouseMove() {
        // Don't do anything if there is not a note on this card
        if (!self.noteGiven.visible()) {
            return;
        }

        // If we are spectating and there is an new note, mark it as seen
        if (self.noteGiven.rotated) {
            self.noteGiven.rotated = false;
            self.noteGiven.rotate(-15);
            globals.layers.card.batchDraw();
        }

        // Don't open any more note tooltips if the user is currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        globals.activeHover = this;
        notes.show(self); // We supply the card as the argument
    });

    this.on('mouseout', () => {
        // Don't close the tooltip if we are currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        const tooltip = $(`#tooltip-card-${self.order}`);
        tooltip.tooltipster('close');
    });

    this.on('mousemove tap', () => {
        globals.elements.clueLog.showMatches(self);
        globals.layers.UI.draw();
    });

    this.on('mouseout', () => {
        globals.elements.clueLog.showMatches(null);
        globals.layers.UI.draw();
    });

    this.on('click tap', this.click);
    this.on('mousedown', this.clickSpeedrun);

    // Hide clue arrows ahead of user dragging their card
    if (this.holder === globals.playerUs && !globals.replay && !globals.spectating) {
        this.on('mousedown', (event) => {
            if (
                event.evt.which !== 1 // Dragging uses left click
                || globals.inReplay
                || !this.indicatorArrow.isVisible()
                || !this.parent.getDraggable()
                || this.isPlayed
                || this.isDiscarded
            ) {
                return;
            }

            globals.lobby.ui.showClueMatch(-1);
            // Do not prevent default since there can be more than one mousedown event
        });
    }

    /*
        Empathy feature
    */

    // Click on a teammate's card to have the card show as it would to that teammate
    // (or, in a replay, show your own card as it appeared at that moment in time)
    // Pips visibility state is tracked so it can be restored for your own hand during a game
    const toggleHolderViewOnCard = (c, enabled, togglePips) => {
        const toggledPips = [0, 0];
        if (c.rankPips.visible() !== enabled && togglePips[0] === 1) {
            c.rankPips.setVisible(enabled);
            toggledPips[0] = 1;
        }
        if (c.suitPips.visible() !== enabled && togglePips[1] === 1) {
            c.suitPips.setVisible(enabled);
            toggledPips[1] = 1;
        }
        c.showOnlyLearned = enabled;
        c.setBareImage();
        return toggledPips;
    };

    // Dynamically adjusted known cards, to be restored by event
    const toggledHolderViewCards = [];
    const endHolderViewOnCard = function endHolderViewOnCard(toggledPips) {
        const cardsToReset = toggledHolderViewCards.splice(0, toggledHolderViewCards.length);
        cardsToReset.map(
            (card, index) => toggleHolderViewOnCard(card, false, toggledPips[index]),
        );
        globals.layers.card.batchDraw();
    };
    const beginHolderViewOnCard = function beginHolderViewOnCard(cards) {
        if (toggledHolderViewCards.length > 0) {
            return undefined; // Handle race conditions with stop
        }

        toggledHolderViewCards.splice(0, 0, ...cards);
        const toggledPips = cards.map(c => toggleHolderViewOnCard(c, true, [1, 1]));
        globals.layers.card.batchDraw();
        return toggledPips;
    };
    if (this.holder !== globals.playerUs || globals.inReplay || globals.spectating) {
        const mouseButton = 1; // Left-click
        let toggledPips = [];
        this.on('mousedown', (event) => {
            if (
                event.evt.which !== mouseButton // Only do Empathy for left-clicks
                || this.tweening // Disable Empathy if the card is tweening
                || this.isPlayed // Clicking on a played card goes to the turn that it was played
                // Clicking on a discarded card goes to the turn that it was discarded
                || this.isDiscarded
                // Disable Empathy if a modifier key is pressed
                || event.shiftKey || event.altKey || event.metaKey
                || (globals.speedrun && !event.ctrlKey) // Empathy in speedruns uses Ctrl
                || (!globals.speedrun && event.ctrlKey)
            ) {
                return;
            }

            globals.activeHover = this;
            const cards = this.parent.parent.children.map(c => c.children[0]);
            toggledPips = beginHolderViewOnCard(cards);
        });
        this.on('mouseup mouseout', (event) => {
            if (event.type === 'mouseup' && event.evt.which !== mouseButton) {
                return;
            }
            endHolderViewOnCard(toggledPips);
        });
    }
};

graphics.Util.extend(HanabiCard, graphics.Group);

HanabiCard.prototype.setBareImage = function setBareImage() {
    this.barename = imageName(this);
};

HanabiCard.prototype.setIndicator = function setIndicator(visible, clue) {
    if (visible) {
        if (clue === null) {
            // This is a shared replay arrow, so don't draw the circle
            this.indicatorCircle.setVisible(false);
            const color = '#ffdf00'; // Yellow
            this.indicatorArrow.setStroke(color);
            this.indicatorArrow.setFill(color);
        } else {
            // Clue arrows are white with a circle that shows the type of clue given
            this.indicatorCircle.setVisible(true);
            const color = 'white';
            this.indicatorArrow.setStroke(color);
            this.indicatorArrow.setFill(color);
            if (clue.type === constants.CLUE_TYPE.RANK) {
                this.indicatorCircle.setFill('black');
                this.indicatorText.setText(clue.value.toString());
                this.indicatorText.setVisible(true);
            } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                this.indicatorCircle.setFill(clue.value.hexCode);
                this.indicatorText.setVisible(false);
            }
        }
    }
    this.indicatorGroup.setVisible(visible);
    this.getLayer().batchDraw();
};

HanabiCard.prototype.applyClue = function applyClue(clue, positive) {
    if (clue.type === CLUE_TYPE.RANK) {
        const clueRank = clue.value;
        const findPipElement = rank => this.rankPips.find(`.${rank}`);
        let removed;
        if (globals.variant.name.startsWith('Multi-Fives')) {
            removed = filterInPlace(
                this.possibleRanks,
                rank => (rank === clueRank || rank === 5) === positive,
            );
        } else {
            removed = filterInPlace(
                this.possibleRanks,
                rank => (rank === clueRank) === positive,
            );
        }
        removed.forEach(rank => findPipElement(rank).hide());
        // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
        // display a non-grey card face
        if (this.possibleRanks.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
            [this.trueRank] = this.possibleRanks;
            findPipElement(this.trueRank).hide();
            this.rankPips.hide();
            globals.learnedCards[this.order].rank = this.trueRank;
        }
        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleRanks,
            s => this.possibleRanks.includes(s),
        );
    } else if (clue.type === CLUE_TYPE.COLOR) {
        const clueColor = clue.value;
        const findPipElement = suit => this.suitPips.find(`.${suit.name}`);
        const removed = filterInPlace(
            this.possibleSuits,
            suit => suit.clueColors.includes(clueColor) === positive,
        );
        removed.forEach(suit => findPipElement(suit).hide());
        // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
        // display a non-grey card face
        if (this.possibleSuits.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
            [this.trueSuit] = this.possibleSuits;
            findPipElement(this.trueSuit).hide();
            this.suitPips.hide();
            globals.learnedCards[this.order].suit = this.trueSuit;
        }
        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleSuits,
            s => this.possibleSuits.includes(s),
        );
    } else {
        console.error('Clue type invalid.');
    }
};

HanabiCard.prototype.hideClues = function hideClues() {
    this.cluedBorder.hide();
};

HanabiCard.prototype.isInPlayerHand = function isInPlayerHand() {
    return globals.elements.playerHands.indexOf(this.parent.parent) !== -1;
};

HanabiCard.prototype.toggleSharedReplayIndicator = function setSharedReplayIndicator() {
    // Either show or hide the arrow (if it is already visible)
    const visible = !(
        this.indicatorArrow.visible()
        && this.indicatorArrow.getFill() === constants.INDICATOR.REPLAY_LEADER
    );
    // (if the arrow is showing but is a different kind of arrow,
    // then just overwrite the existing arrow)
    globals.lobby.ui.showClueMatch(-1);
    this.setIndicator(visible, null);
};

HanabiCard.prototype.click = function click(event) {
    // Disable all click events if the card is tweening
    if (this.tweening) {
        return;
    }

    // Speedrunning overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if we are in a solo or shared replay)
    if (globals.speedrun && !globals.replay) {
        return;
    }

    if (event.evt.which === 1) { // Left-click
        this.clickLeft(event.evt);
    } else if (event.evt.which === 3) { // Right-click
        this.clickRight(event.evt);
    }
};

HanabiCard.prototype.clickLeft = function clickLeft(event) {
    // The "Empathy" feature is handled above, so we don't have to worry about it here

    // No actions in this function should use any modifiers
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return;
    }

    if (this.isPlayed) {
        // Clicking on played cards goes to the turn that they were played
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turnPlayed + 1, true);
    } else if (this.isDiscarded) {
        // Clicking on discarded cards goes to the turn that they were discarded
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turnDiscarded + 1, true);
    }
};

HanabiCard.prototype.clickRight = function clickRight(event) {
    // Ctrl + shift + alt + right-click is a card morph
    if (
        event.ctrlKey
        && event.shiftKey
        && event.altKey
        && !event.metaKey
    ) {
        this.clickMorph();
        return;
    }

    // Right-click for a leader in a shared replay is an arrow
    // (we want it to work no matter what modifiers are being pressed,
    // in case someone is pushing their push to talk hotkey while highlighting cards)
    if (
        globals.sharedReplay
        && globals.sharedReplayLeader === globals.lobby.username
        && globals.useSharedTurns
    ) {
        this.clickArrow();
        return;
    }

    // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered
    // (this must be above the other note code because of the modifiers)
    if (
        event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        this.setNote(notes.vars.lastNote);
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (
        !event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (
        !event.ctrlKey
        && !event.shiftKey
        && event.altKey
        && !event.metaKey
    ) {
        this.setNote('cm');
        return;
    }

    // Ctrl + right-click is a local arrow
    // (we don't want this functionality in shared replays because
    // it could be misleading as to who the real replay leader is)
    if (
        event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && globals.sharedReplay === false
    ) {
        this.clickArrowLocal();
        return;
    }

    // A normal right-click is edit a note
    if (
        !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        notes.openEditTooltip(this);
    }
};

HanabiCard.prototype.clickArrow = function clickArrow() {
    // In a shared replay, the leader right-clicks a card to draw on arrow on it to attention to it
    // (and it is shown to all of the players in the review)
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.ARROW,
        order: this.order,
    });

    // Draw the indicator manually so that we don't have to wait for the client to server round-trip
    this.toggleSharedReplayIndicator();
};

HanabiCard.prototype.clickArrowLocal = function clickArrowLocal() {
    // Even if they are not a leader in a shared replay,
    // a user might still want to draw an arrow on a card for demonstration purposes
    this.toggleSharedReplayIndicator();
};

// Morphing cards allows for creation of hypothetical situations
HanabiCard.prototype.clickMorph = function clickMorph() {
    // Only allow this feature in replays
    if (!globals.replay) {
        return;
    }

    const card = prompt('What card do you want to morph it into?\n(e.g. "b1", "k2", "m3", "11", "65")');
    if (card === null || card.length !== 2) {
        return;
    }
    const suitLetter = card[0];
    let suit;
    if (suitLetter === 'b' || suitLetter === '1') {
        suit = 0;
    } else if (suitLetter === 'g' || suitLetter === '2') {
        suit = 1;
    } else if (suitLetter === 'y' || suitLetter === '3') {
        suit = 2;
    } else if (suitLetter === 'r' || suitLetter === '4') {
        suit = 3;
    } else if (suitLetter === 'p' || suitLetter === '5') {
        suit = 4;
    } else if (suitLetter === 'k' || suitLetter === 'm' || suitLetter === '6') {
        suit = 5;
    } else {
        return;
    }
    const rank = parseInt(card[1], 10);
    if (Number.isNaN(rank)) {
        return;
    }

    // Tell the server that we are doing a hypothetical
    if (globals.sharedReplayLeader === globals.lobby.username) {
        globals.lobby.conn.send('replayAction', {
            type: constants.REPLAY_ACTION_TYPE.MORPH,
            order: this.order,
            suit,
            rank,
        });
    }
};

HanabiCard.prototype.clickSpeedrun = function clickSpeedrun(event) {
    // Speedrunning overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if we are in a solo or shared replay)
    if (!globals.speedrun || globals.replay) {
        return;
    }

    // Disable all click events if the card is tweening
    if (this.tweening) {
        return;
    }

    // Do nothing if we accidentally click on a played/discarded card
    if (this.isPlayed || this.isDiscarded) {
        return;
    }

    if (event.evt.which === 1) { // Left-click
        this.clickSpeedrunLeft(event.evt);
    } else if (event.evt.which === 3) { // Right-click
        this.clickSpeedrunRight(event.evt);
    }
};

HanabiCard.prototype.clickSpeedrunLeft = function clickSpeedrunLeft(event) {
    // Left-clicking on cards in our own hand is a play action
    if (
        this.holder === globals.playerUs
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.PLAY,
                target: this.order,
            },
        });
        return;
    }

    // Left-clicking on cards in other people's hands is a color clue action
    // (but if we are holding Ctrl, then we are using Empathy)
    if (
        this.holder !== globals.playerUs
        && globals.clues !== 0
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        const color = this.trueSuit.clueColors[0];
        const colors = globals.variant.clueColors;
        const value = colors.findIndex(variantClueColor => variantClueColor === color);
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.CLUE,
                target: this.holder,
                clue: {
                    type: constants.CLUE_TYPE.COLOR,
                    value,
                },
            },
        });
    }
};

HanabiCard.prototype.clickSpeedrunRight = function clickSpeedrunRight(event) {
    // Right-clicking on cards in our own hand is a discard action
    if (
        this.holder === globals.playerUs
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        // Prevent discarding while at 8 clues
        if (globals.clues === 8) {
            return;
        }
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.DISCARD,
                target: this.order,
            },
        });
        return;
    }

    // Right-clicking on cards in other people's hands is a number clue action
    if (
        this.holder !== globals.playerUs
        && globals.clues !== 0
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.CLUE,
                target: this.holder,
                clue: {
                    type: constants.CLUE_TYPE.RANK,
                    value: this.trueRank,
                },
            },
        });
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (
        !event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (
        !event.ctrlKey
        && !event.shiftKey
        && event.altKey
        && !event.metaKey
    ) {
        this.setNote('cm');
    }
};

HanabiCard.prototype.setNote = function setNote(note) {
    notes.set(this.order, note);
    notes.update(this);
    notes.show(this);
};

module.exports = HanabiCard;

/*
    Misc. functions
*/

const imageName = (card) => {
    let prefix = 'Card';

    const learnedCard = globals.learnedCards[card.order];

    const rank = (!card.showOnlyLearned && card.trueRank);
    const empathyPastRankUncertain = card.showOnlyLearned && card.possibleRanks.length > 1;

    const suit = (!card.showOnlyLearned && card.trueSuit);
    const empathyPastSuitUncertain = card.showOnlyLearned && card.possibleSuits.length > 1;

    let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
    if (empathyPastSuitUncertain) {
        suitToShow = SUIT.GRAY;
    }

    // For whatever reason, Card-Gray is never created, so use NoPip-Gray
    if (suitToShow === SUIT.GRAY) {
        prefix = 'NoPip';
    }

    let name = `${prefix}-${suitToShow.name}-`;
    if (empathyPastRankUncertain) {
        name += '6';
    } else {
        name += rank || learnedCard.rank || '6';
    }
    return name;
};

const filterInPlace = (values, predicate) => {
    const removed = [];
    let i = values.length - 1;
    while (i >= 0) {
        if (!predicate(values[i], i)) {
            removed.unshift(values.splice(i, 1)[0]);
        }
        i -= 1;
    }
    return removed;
};
