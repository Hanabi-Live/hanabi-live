/*
    The HanabiCard object, which represents a single card
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
const sharedReplayIndicatorArrowColor = '#ffdf00'; // Yellow

const HanabiCard = function HanabiCard(config) {
    const self = this;

    // Cards should start off with a constant width and height
    config.width = CARDW;
    config.height = CARDH;
    config.x = CARDW / 2;
    config.y = CARDH / 2;
    config.offset = {
        x: CARDW / 2,
        y: CARDH / 2,
    };

    graphics.Group.call(this, config);

    // Card variables
    this.order = config.order;
    this.holder = config.holder;
    this.trueSuit = config.suit || undefined;
    this.trueRank = config.rank || undefined;
    // Possible suits and ranks (based on clues given) are tracked separately from
    // knowledge of the true suit and rank
    this.possibleSuits = config.suits;
    this.possibleRanks = config.ranks;
    this.tweening = false;
    this.barename = undefined;
    this.showOnlyLearned = false;
    this.numPositiveClues = 0;
    this.isDiscarded = false;
    this.turnDiscarded = null;
    this.isPlayed = false;
    this.turnPlayed = null;

    // Some short helper functions
    this.doRotations = function doRotations(inverted) {
        this.setRotation(inverted ? 180 : 0);
        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? config.width : 0);
        this.bare.setY(inverted ? config.height : 0);
    };
    this.suitKnown = function suitKnown() {
        return this.trueSuit !== undefined;
    };
    this.rankKnown = function rankKnown() {
        return this.trueRank !== undefined;
    };
    this.identityKnown = function identityKnown() {
        return this.suitKnown() && this.rankKnown();
    };
    this.isClued = function isClued() {
        return this.numPositiveClues > 0;
    };
    this.isInPlayerHand = function isInPlayerHand() {
        return globals.elements.playerHands.indexOf(this.parent.parent) !== -1;
    };
    this.hideClues = function hideClues() {
        this.cluedBorder.hide();
    };

    // Create the "bare" card image, which is a gray card with all the pips
    this.bare = new graphics.Image({
        width: config.width,
        height: config.height,
    });
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

    // The card will get a border when it becomes clued
    this.cluedBorder = new graphics.Rect({
        x: 3,
        y: 3,
        width: config.width - 6,
        height: config.height - 6,
        cornerRadius: 6,
        strokeWidth: 16,
        stroke: '#ffdf00', // Yellow
        visible: false,
        listening: false,
    });
    this.add(this.cluedBorder);

    // Initialize various elements/features of the card
    this.initPips(config);
    this.setBareImage();
    this.initIndicatorArrow(config);
    this.initNote(config);
    this.initEmpathy();

    // Define the clue log mouse handlers
    this.on('mousemove tap', function cardClueLogMousemoveTap() {
        globals.elements.clueLog.showMatches(this);
        globals.layers.UI.batchDraw();
    });
    this.on('mouseout', () => {
        globals.elements.clueLog.showMatches(null);
        globals.layers.UI.batchDraw();
    });

    // Define the other mouse handlers
    this.on('click tap', this.click);
    this.on('mousedown', this.clickSpeedrun);
};

graphics.Util.extend(HanabiCard, graphics.Group);

HanabiCard.prototype.setBareImage = function setBareImage() {
    let prefix = 'Card';

    const learnedCard = globals.learnedCards[this.order];

    const rank = (!this.showOnlyLearned && this.trueRank);
    const empathyPastRankUncertain = this.showOnlyLearned && this.possibleRanks.length > 1;

    const suit = (!this.showOnlyLearned && this.trueSuit);
    const empathyPastSuitUncertain = this.showOnlyLearned && this.possibleSuits.length > 1;

    let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
    if (empathyPastSuitUncertain) {
        suitToShow = SUIT.GRAY;
    }

    // For whatever reason, "Card-Gray" is never created, so use "NoPip-Gray"
    if (suitToShow === SUIT.GRAY) {
        prefix = 'NoPip';
    }

    let name = `${prefix}-${suitToShow.name}-`;
    if (empathyPastRankUncertain) {
        name += '6';
    } else {
        name += rank || learnedCard.rank || '6';
    }

    this.barename = name;
};

// This initializes both the suit pips and the black squares
HanabiCard.prototype.initPips = function initPips(config) {
    this.suitPips = new graphics.Group({
        x: 0,
        y: 0,
        width: Math.floor(CARDW),
        height: Math.floor(CARDH),
        visible: !this.suitKnown(),
    });
    this.add(this.suitPips);
    this.rankPips = new graphics.Group({
        x: 0,
        y: Math.floor(CARDH * 0.85),
        width: CARDW,
        height: Math.floor(CARDH * 0.15),
        visible: !this.rankKnown(),
    });
    this.add(this.rankPips);

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

            // Transform polar to Cartesian coordinates
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
            sceneFunc: (ctx) => {
                cardDraw.drawSuitShape(suit, i)(ctx);
                ctx.closePath();
                ctx.fillStrokeShape(suitPip);
            },
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

        // Reduce opacity of eliminated suits and outline remaining suits
        if (!globals.learnedCards[this.order].possibleSuits.includes(suit)) {
            suitPip.setOpacity(0.4);
        } else {
            suitPip.setStrokeWidth(5);
        }

        this.suitPips.add(suitPip);
    }
};

HanabiCard.prototype.initIndicatorArrow = function initIndicatorArrow(config) {
    this.indicatorGroup = new graphics.Group({
        x: 0,
        y: -config.height * 0.25,
        width: config.width,
        height: config.height,
        visible: false,
        listening: false,
    });
    if (this.holder === globals.playerUs && globals.lobby.settings.showBGAUI) {
        // In BGA mode, our hand is the one closest to the top
        // So, invert the arrows so that it is easier to see them
        this.indicatorGroup.setRotation(180);
        this.indicatorGroup.setX(config.width);
        this.indicatorGroup.setY(config.height * 1.18);
    }
    this.add(this.indicatorGroup);
    this.indicatorGroup.originalX = this.indicatorGroup.getX();
    this.indicatorGroup.originalY = this.indicatorGroup.getY();

    this.indicatorArrowBorder = new graphics.Arrow({
        points: [
            config.width / 2,
            0,
            config.width / 2,
            config.height / 2.5,
        ],
        pointerLength: 20,
        pointerWidth: 20,
        fill: 'black',
        stroke: 'black',
        strokeWidth: 40,
        shadowBlur: 75,
        shadowOpacity: 1,
        visible: true,
        listening: false,
    });
    this.indicatorGroup.add(this.indicatorArrowBorder);

    this.indicatorArrowBorderEdge = new graphics.Line({
        points: [
            (config.width / 2) - 20,
            0,
            (config.width / 2) + 20,
            0,
        ],
        fill: 'black',
        stroke: 'black',
        strokeWidth: 15,
    });
    this.indicatorGroup.add(this.indicatorArrowBorderEdge);

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
    if (
        (this.holder === globals.playerUs && !globals.lobby.settings.showBGAUI)
        || (this.holder !== globals.playerUs && globals.lobby.settings.showBGAUI)
    ) {
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

    // Hide the indicator arrows when a user begins to drag a card in their hand
    this.on('mousedown', (event) => {
        if (
            event.evt.which !== 1 // Dragging uses left click
            || this.holder !== globals.playerUs
            || globals.inReplay
            || globals.replay
            || globals.spectating
            || !this.indicatorArrow.isVisible()
            || !this.parent.getDraggable()
            || this.isPlayed
            || this.isDiscarded
        ) {
            return;
        }

        globals.lobby.ui.showClueMatch(-1);
    });
};

HanabiCard.prototype.initNote = function initNote(config) {
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

    this.on('mousemove', function cardMouseMove() {
        // Don't do anything if there is not a note on this card
        if (!this.noteGiven.visible()) {
            return;
        }

        // If we are spectating and there is an new note, mark it as seen
        if (this.noteGiven.rotated) {
            this.noteGiven.rotated = false;
            this.noteGiven.rotate(-15);
            globals.layers.card.batchDraw();
        }

        // Don't open any more note tooltips if the user is currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        globals.activeHover = this;
        notes.show(this); // We supply the card as the argument
    });

    this.on('mouseout', function cardMouseOut() {
        // Don't close the tooltip if we are currently editing a note
        if (notes.vars.editing !== null) {
            return;
        }

        const tooltip = $(`#tooltip-card-${this.order}`);
        tooltip.tooltipster('close');
    });
};

HanabiCard.prototype.initEmpathy = function initEmpathy() {
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
            event.evt.which !== empathyMouseButton // Only do Empathy for left-clicks
            // Disable Empathy if a modifier key is pressed
            // (unless we are in a speedrun, because then Empathy is mapped to Ctrl + left click)
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
        endHolderViewOnCard(toggledPips);
    });
};

HanabiCard.prototype.setIndicator = function setIndicator(visible, giver, target, clue) {
    if (visible) {
        if (clue === null) {
            // This is a shared replay arrow, so don't draw the circle
            this.indicatorCircle.setVisible(false);
            this.indicatorText.setVisible(false);
            const color = sharedReplayIndicatorArrowColor;
            this.indicatorArrow.setStroke(color);
            this.indicatorArrow.setFill(color);
        } else {
            // Clue arrows are white with a circle that shows the type of clue given
            this.indicatorCircle.setVisible(true);
            if (this.numPositiveClues >= 2) {
                // We change the color of the arrow to signify that
                // this is not a "freshly touched" card
                const color = '#a6a6a6'; // Gray
                this.indicatorArrow.setStroke(color);
                this.indicatorArrow.setFill(color);
            }
            if (clue.type === constants.CLUE_TYPE.RANK) {
                this.indicatorCircle.setFill('black');
                this.indicatorText.setText(clue.value.toString());
                this.indicatorText.setVisible(true);
            } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                this.indicatorCircle.setFill(clue.value.hexCode);
                this.indicatorText.setVisible(false);
            }

            if (this.indicatorTween) {
                this.indicatorTween.destroy();
            }

            // Fix the bug where the arrows can be hidden by other cards
            // in certain specific circumstances
            // TODO: this doesn't work??
            // game 20595 turn 8 from Cory's perspective
            this.moveToTop();
            this.getParent().moveToTop();

            if (globals.animateFast) {
                // Just set the arrow in position
                this.indicatorGroup.setX(this.indicatorGroup.originalX);
                this.indicatorGroup.setY(this.indicatorGroup.originalY);
            } else if (giver !== null) {
                // Animate the arrow flying from the player who gave the clue to the cards
                const playerHand = globals.elements.playerHands[giver];
                const pos = playerHand.getAbsolutePosition();
                const handW = playerHand.getWidth();
                const handH = playerHand.getHeight();
                // This comes in radians from Konva but we need to convert it to degrees
                const rot = playerHand.rotation / 180 * Math.PI;
                // Dividing by pi here is a complete hack; I don't know why the hand dimensions
                // and indicator group dimensions are scaled differently by a factor of pi
                const indW = this.indicatorGroup.getWidth() / Math.PI;
                // The angle has to account for the whole card reflection business
                // in other players' hands
                let indRadians = this.parent.parent.rotation;
                if (target !== globals.playerUs) {
                    indRadians += 180;
                }
                const indTheta = indRadians / 180 * Math.PI;
                pos.x += handW / 2 * Math.cos(rot) - handH / 2 * Math.sin(rot);
                pos.y += handW / 2 * Math.sin(rot) + handH / 2 * Math.cos(rot);

                // Now, "pos" is equal to the exact center of the hand
                // We need to now adjust it to account for the size of the indicator arrow group
                pos.x -= indW / 2 * Math.cos(indTheta);
                pos.y -= indW / 2 * Math.sin(indTheta);
                this.indicatorGroup.setAbsolutePosition(pos);

                // Set the rotation so that the arrow will start off by pointing towards the card
                // that it is travelling to
                const originalRotation = this.indicatorGroup.getRotation();
                // this.indicatorGroup.setRotation(90);
                // TODO NEED LIBSTERS HELP

                this.indicatorTween = new graphics.Tween({
                    node: this.indicatorGroup,
                    duration: 0.5,
                    x: this.indicatorGroup.originalX,
                    y: this.indicatorGroup.originalY,
                    rotation: originalRotation,
                    runonce: true,
                }).play();
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
        // Don't mark unclued cards in your own hand with true suit or rank,
        // so that they don't display a non-gray card face
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
        // Don't mark unclued cards in your own hand with true suit or rank,
        // so that they don't display a non-gray card face
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

HanabiCard.prototype.toggleSharedReplayIndicator = function setSharedReplayIndicator() {
    // Either show or hide the arrow (if it is already visible)
    const visible = !(
        this.indicatorGroup.visible()
        && this.indicatorArrow.getFill() === sharedReplayIndicatorArrowColor
    );
    // (if the arrow is showing but is a different kind of arrow,
    // then just overwrite the existing arrow)
    globals.lobby.ui.showClueMatch(-1);
    this.setIndicator(visible, null, null, null);
};

HanabiCard.prototype.click = function click(event) {
    // Disable all click events if the card is tweening
    if (this.tweening) {
        return;
    }

    // Speedrunning overrides the normal card clicking behavior
    // (but don't use the speedrunning behavior if
    // we are in a solo replay / shared replay / spectating)
    if (globals.speedrun && !globals.replay && !globals.spectating) {
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
        && !globals.replay
        && !globals.spectating
    ) {
        this.setNote(notes.vars.lastNote);
        return;
    }

    // Shift + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (
        !event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.replay
        && !globals.spectating
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
        && !globals.replay
        && !globals.spectating
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
        && !globals.replay
        && !globals.spectating
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
    if (
        // Speedrunning overrides the normal card clicking behavior
        // (but don't use the speedrunning behavior if
        // we are in a solo replay / shared replay / spectating)
        (!globals.speedrun || globals.replay || globals.spectating)
        || this.tweening // Disable all click events if the card is tweening
        || this.isPlayed // Do nothing if we accidentally clicked on a played card
        || this.isDiscarded // Do nothing if we accidentally clicked on a discarded card
    ) {
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

    // Ctrl + right-click is the normal note popup
    if (
        event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        notes.openEditTooltip(this);
        return;
    }

    // Shift + right-click is a "f" note
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

HanabiCard.prototype.isCritical = function isCritical() {
    if (
        !this.identityKnown
        || this.isPlayed
        || this.isDiscarded
        || !needsToBePlayed(this.trueSuit, this.trueRank)
    ) {
        return false;
    }

    const num = getSpecificCardNum(this.trueSuit, this.trueRank);
    return num.total === num.discarded + 1;
};

module.exports = HanabiCard;

/*
    Misc. functions
*/

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

// needsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
// (this mirrors the server function in "card.go")
const needsToBePlayed = (suit, rank) => {
    // First, check to see if a copy of this card has already been played
    for (const card of globals.deck) {
        if (card.trueSuit === suit && card.trueRank === rank && card.isPlayed) {
            return false;
        }
    }

    // Determining if the card needs to be played in the "Up or Down" variants is more complicated
    if (globals.variant.name.startsWith('Up or Down')) {
        return false;
    }

    // Second, check to see if it is still possible to play this card
    // (the preceding cards in the suit might have already been discarded)
    for (let i = 1; i < rank; i++) {
        const num = getSpecificCardNum(suit, i);
        if (num.total === num.discarded) {
            // The suit is "dead", so this card does not need to be played anymore
            return false;
        }
    }

    // By default, all cards not yet played will need to be played
    return true;
};

// getSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
// (this DOES NOT mirror the server function in "game.go",
// because the client does not have the full deck)
const getSpecificCardNum = (suit, rank) => {
    // First, find out how many of this card should be in the deck, based on the rules of the game
    let total = 0;
    if (rank === 1) {
        total = 3;
        if (globals.variant.name.startsWith('Up or Down')) {
            total = 1;
        }
    } else if (rank === 5) {
        total = 1;
    } else if (rank === 7) { // The "START" card
        total = 1;
    } else {
        total = 2;
    }
    if (suit.oneOfEach) {
        total = 1;
    }

    // Second, search through the deck to find the total amount of discarded cards that match
    let discarded = 0;
    for (const card of globals.deck) {
        if (card.trueSuit === suit && card.trueRank === rank && card.isDiscarded) {
            discarded += 1;
        }
    }

    return { total, discarded };
};
