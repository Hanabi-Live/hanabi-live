/*
    The HanabiCard object, which represts a single card
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const cardDraw = require('./cardDraw');
const notes = require('./notes');
const replay = require('./replay');

// Constants
const {
    CARDH,
    CARDW,
    CLUE_TYPE,
    INDICATOR,
    SUIT,
} = constants;

const HanabiCard = function HanabiCard(config) {
    const self = this;

    const winH = globals.stage.getHeight();

    config.width = CARDW;
    config.height = CARDH;
    config.x = CARDW / 2;
    config.y = CARDH / 2;
    config.offset = {
        x: CARDW / 2,
        y: CARDH / 2,
    };

    Kinetic.Group.call(this, config);

    this.bare = new Kinetic.Image({
        width: config.width,
        height: config.height,
    });

    this.doRotations = function doRotations(inverted = false) {
        this.setRotation(inverted ? 180 : 0);

        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? config.width : 0);
        this.bare.setY(inverted ? config.height : 0);
    };

    this.bare.setDrawFunc(function setDrawFunc(context) {
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

    this.rankPips = new Kinetic.Group({
        x: 0,
        y: Math.floor(CARDH * 0.85),
        width: CARDW,
        height: Math.floor(CARDH * 0.15),
        visible: !this.rankKnown(),
    });
    this.suitPips = new Kinetic.Group({
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
        const rankPip = new Kinetic.Rect({
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

        const suitPip = new Kinetic.Shape({
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
            drawFunc: (ctx) => {
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

    this.cluedBorder = new Kinetic.Rect({
        x: 3,
        y: 3,
        width: config.width - 6,
        height: config.height - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffdf00',
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);

    this.isClued = function isClued() {
        return this.cluedBorder.visible();
    };
    this.isDiscarded = false;
    this.turnDiscarded = null;
    this.isPlayed = false;
    this.turnPlayed = null;

    this.indicatorArrow = new Kinetic.Text({
        x: config.width * 1.01,
        y: config.height * 0.18,
        width: config.width,
        height: 0.5 * config.height,
        fontSize: 0.2 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '⬆',
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
    this.add(this.indicatorArrow);

    // Define the note indicator emoji (this used to be a white square)
    const noteX = 0.78;
    const noteY = 0.06;
    this.noteGiven = new Kinetic.Text({
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

    // Hide clue arrows ahead of user dragging their card
    if (this.holder === globals.playerUs && !globals.replay && !globals.spectating) {
        this.on('mousedown', (event) => {
            if (
                event.evt.which !== 1 // Dragging uses left click
                || globals.inReplay
                || !this.indicatorArrow.isVisible()
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
            if (event.evt.which !== mouseButton) {
                return;
            }

            // Disable Empathy if the card is tweening
            const child = this.parent; // This is the LayoutChild
            if (child.tween !== null) {
                return;
            }

            // Disable Empathy if the card is played or discarded
            // (clicking on a played/discarded card goes to the turn that it was played/discarded)
            if (this.isPlayed || this.isDiscarded) {
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

Kinetic.Util.extend(HanabiCard, Kinetic.Group);

HanabiCard.prototype.setBareImage = function setBareImage() {
    this.barename = imageName(this);
};

HanabiCard.prototype.setIndicator = function setIndicator(visible, type = INDICATOR.POSITIVE) {
    this.indicatorArrow.setStroke('#000000');
    this.indicatorArrow.setFill(type);
    this.indicatorArrow.setVisible(visible);
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
    this.setIndicator(visible, constants.INDICATOR.REPLAY_LEADER);
};

HanabiCard.prototype.click = function click(event) {
    // Disable all click events if the card is tweening
    const child = this.parent; // This is the LayoutChild
    if (child.tween !== null) {
        return;
    }

    // Speedrunning mode overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if we are in a solo or shared replay)
    if (globals.lobby.settings.speedrunMode && !globals.replay) {
        this.clickSpeedrun(event.evt.which);
        return;
    }

    if (event.evt.which === 1) { // Left-click
        this.clickLeft();
    } else if (event.evt.which === 3) { // Right-click
        this.clickRight();
    }
};

HanabiCard.prototype.clickLeft = function clickLeft() {
    // The "Empathy" feature is handled above, so we don't have to worry about it here
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

HanabiCard.prototype.clickRight = function clickRight() {
    // Ctrl + shift + alt + right-click is a card morph
    if (window.event.ctrlKey && window.event.shiftKey && window.event.altKey) {
        this.clickMorph();
        return;
    }

    // Right-click for a leader in a shared replay is an arrow
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
    if (window.event.ctrlKey && window.event.shiftKey) {
        this.setNote(notes.vars.lastNote);
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (window.event.shiftKey) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (window.event.altKey) {
        this.setNote('cm');
        return;
    }

    // Ctrl + right-click is a local arrow
    // (we don't want this functionality in shared replays because
    // it could be misleading as to who the real replay leader is)
    if (window.event.ctrlKey && globals.sharedReplay === false) {
        this.clickArrowLocal();
        return;
    }

    // A normal right-click is edit a note
    notes.openEditTooltip(this);
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

HanabiCard.prototype.clickSpeedrun = function clickSpeedrun(clickType) {
    // Do nothing if we accidentally click on a played/discarded card
    if (this.isPlayed || this.isDiscarded) {
        return;
    }

    if (clickType === 1) { // Left-click
        this.clickSpeedrunLeft();
    } else if (clickType === 3) { // Right-click
        this.clickSpeedrunRight();
    }
};

HanabiCard.prototype.clickSpeedrunLeft = function clickSpeedrunLeft() {
    if (this.holder === globals.playerUs) {
        // Left-clicking on cards in our own hand is a play action
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.PLAY,
                target: this.order,
            },
        });
        return;
    }

    if (window.event.ctrlKey) {
        // Ctrl + left-clicking on cards in other people's hands is a color clue action
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
    } else if (window.event.shiftKey) {
        // Shift + left-clicking on cards in other people's hands is a number clue action
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
    }
};

HanabiCard.prototype.clickSpeedrunRight = function clickSpeedrunRight() {
    if (this.holder === globals.playerUs) {
        // Right-clicking on cards in our own hand is a discard action
        globals.lobby.ui.endTurn({
            type: 'action',
            data: {
                type: constants.ACT.DISCARD,
                target: this.order,
            },
        });
        return;
    }

    // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered
    // (this must be above the other note code because of the modifiers)
    if (window.event.ctrlKey && window.event.shiftKey) {
        this.setNote(notes.vars.lastNote);
        return;
    }

    // Shfit + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (window.event.shiftKey) {
        this.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (window.event.altKey) {
        this.setNote('cm');
        return;
    }

    // A normal right-click is edit a note
    notes.openEditTooltip(this);
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
