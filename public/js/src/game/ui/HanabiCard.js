/*
    The HanabiCard object represents a single card
*/

// Imports
const constants = require('../../constants');
const convert = require('./convert');
const drawCards = require('./drawCards');
const globals = require('./globals');
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
    // We also keep track of every possible card that it could be
    this.possibleCards = globals.cardList.slice();
    this.tweening = false;
    this.bareName = undefined;
    this.showOnlyLearned = false;
    this.numPositiveClues = 0;
    this.hasPositiveColorClue = false;
    this.hasPositiveRankClue = false;
    // We have to add one to the turn drawn because
    // the "draw" command comes before the "turn" command
    // However, if it was part of the initial deal, then it will correctly be set as turn 0
    this.turnDrawn = globals.turn === 0 ? 0 : globals.turn + 1;
    this.isDiscarded = false;
    this.turnDiscarded = null;
    this.isPlayed = false;
    this.turnPlayed = null;
    this.isMisplayed = false;

    // Some short helper functions
    this.isRevealed = function isRevealed() {
        return this.trueSuit && this.trueRank;
    };
    this.doRotations = function doRotations(inverted) {
        this.setRotation(inverted ? 180 : 0);
        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? config.width : 0);
        this.bare.setY(inverted ? config.height : 0);
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
        drawCards.scaleCardImage(
            context,
            self.bareName,
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
    this.initPossibilities();
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
    const learnedCard = globals.learnedCards[this.order];

    // Find out the suit to display
    // ("Gray" is a colorless suit used for unclued cards)
    const suit = !this.showOnlyLearned && this.trueSuit;
    const empathyPastSuitUncertain = this.showOnlyLearned && this.possibleSuits.length > 1;

    let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
    if (empathyPastSuitUncertain) {
        suitToShow = SUIT.GRAY;
    }
    if (!learnedCard.revealed && !this.hasPositiveColorClue) {
        suitToShow = SUIT.GRAY;
    }

    // For whatever reason, "Card-Gray" is never created, so use "NoPip-Gray"
    let prefix = 'Card';
    if (suitToShow === SUIT.GRAY) {
        prefix = 'NoPip';
    }

    // Find out the rank to display
    // (6 is a used for unclued cards)
    const rank = !this.showOnlyLearned && this.trueRank;
    const empathyPastRankUncertain = this.showOnlyLearned && this.possibleRanks.length > 1;

    let rankToShow;
    if (empathyPastRankUncertain) {
        rankToShow = 6;
    } else {
        rankToShow = rank || learnedCard.rank || 6;
    }
    if (!learnedCard.revealed && !this.hasPositiveRankClue) {
        rankToShow = '6';
    }

    // Set the name
    this.bareName = `${prefix}-${suitToShow.name}-${rankToShow}`;
};

HanabiCard.prototype.initPips = function initPips(config) {
    // Initialize the suit pips, which are colored shapes
    this.suitPips = new graphics.Group({
        x: 0,
        y: 0,
        width: Math.floor(CARDW),
        height: Math.floor(CARDH),
        visible: !this.trueSuit,
    });
    this.add(this.suitPips);

    const { suits } = config;
    const nSuits = suits.length;
    for (let i = 0; i < suits.length; i++) {
        const suit = suits[i];

        // Set the pip at the middle of the card
        const x = Math.floor(CARDW * 0.5);
        const y = Math.floor(CARDH * 0.5);
        const scale = { // Scale numbers are magic
            x: 0.4,
            y: 0.4,
        };
        // Transform polar to Cartesian coordinates
        // The magic number added to the offset is needed to center things properly
        // We don't know why it's needed; perhaps something to do with the shape functions
        const offset = {
            x: Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25), // eslint-disable-line
            y: Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3), // eslint-disable-line
        };
        let fill = suit.fillColors.hexCode;
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
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
            name: suit.name, // We set a name so that we can use "suitPips.find()" later on
            listening: false,
            sceneFunc: (ctx) => {
                drawCards.drawSuitShape(suit, i)(ctx);
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
        this.suitPips.add(suitPip);

        // Also create the X that will show when a certain suit can be ruled out
        const suitPipX = new graphics.Shape({
            x,
            y,
            scale,
            offset,
            fill: 'black',
            stroke: 'black',
            name: `${suit.name}-x`, // We set a name so that we can use "suitPips.find()" later on
            listening: false,
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 50;
                const xx = Math.floor((CARDW * 0.25) - (width * 0.45));
                const xy = Math.floor((CARDH * 0.25) - (width * 0.05));
                drawX(ctx, shape, xx, xy, 50, width);
            },
        });
        this.suitPips.add(suitPipX);

        // Reduce opacity of eliminated suits and outline remaining suits
        if (!globals.learnedCards[this.order].possibleSuits.includes(suit)) {
            suitPip.setOpacity(0.4);
            suitPip.setStrokeWidth(1);
            suitPipX.setOpacity(0.1);
        }
    }

    // Initialize the rank pips, which are black squares along the bottom of the card
    this.rankPips = new graphics.Group({
        x: 0,
        y: Math.floor(CARDH * 0.85),
        width: CARDW,
        height: Math.floor(CARDH * 0.15),
        visible: !this.trueRank,
    });
    this.add(this.rankPips);

    for (const rank of config.ranks) {
        const x = Math.floor(CARDW * (rank * 0.19 - 0.14));
        const y = 0;
        const rankPip = new graphics.Rect({
            x,
            y,
            width: Math.floor(CARDW * 0.15),
            height: Math.floor(CARDH * 0.10),
            fill: 'black',
            stroke: 'black',
            name: rank.toString(), // We set a name so that we can use "rankPips.find()" later on
            listening: false,
            cornerRadius: 0.02 * CARDH,
        });
        this.rankPips.add(rankPip);

        // Also create the X that will show when a certain rank can be ruled out
        const rankPipX = new graphics.Shape({
            x,
            y,
            fill: '#e6e6e6',
            stroke: 'black',
            strokeWidth: 2,
            name: `${rank}-x`, // We set a name so that we can use "rankPips.find()" later on
            listening: false,
            opacity: 0.8,
            visible: false,
            sceneFunc: (ctx, shape) => {
                const width = 20;
                const xx = Math.floor(CARDW * 0.04);
                const xy = Math.floor(CARDH * 0.05);
                drawX(ctx, shape, xx, xy, 12, width);
            },
        });
        this.rankPips.add(rankPipX);

        // Reduce opacity of eliminated suits and outline remaining suits
        if (!globals.learnedCards[this.order].possibleRanks.includes(rank)) {
            rankPip.setOpacity(0.3);
            rankPipX.setOpacity(0.1);
        }
    }

    // Hide the pips if we have full knowledge of the suit / rank
    const cardPresentKnowledge = globals.learnedCards[this.order];
    if (cardPresentKnowledge.revealed) {
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
    }
};

HanabiCard.prototype.initPossibilities = function initPossibilities() {
    // We want to remove all of the currently seen cards from the list of possibilities
    for (const card of globals.deck) {
        // We don't know what this card is yet
        if (!card.isRevealed()) {
            continue;
        }

        // If the card is still in the player's hand,
        // then we can't remove it from the list of possibilities,
        // because they don't know what it is yet
        if (
            card.holder === this.holder
            && !card.isPlayed
            && !card.isDiscarded
            && card.possibleSuits.length !== 1
            && card.possibleRanks.length !== 1
        ) {
            continue;
        }

        this.removePossibility(card.trueSuit, card.trueRank);
    }
};

HanabiCard.prototype.initIndicatorArrow = function initIndicatorArrow(config) {
    this.indicatorGroup = new graphics.Group({
        width: config.width,
        height: config.height,
        visible: false,
        listening: false,
    });
    this.initArrowLocation();
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
            || (this.holder !== globals.playerUs && !globals.hypothetical)
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

HanabiCard.prototype.initArrowLocation = function initArrowLocation() {
    this.indicatorGroup.setX(0);
    this.indicatorGroup.setY(-this.getHeight() * 0.25);
    this.indicatorGroup.setRotation(0);
    if (
        this.holder === globals.playerUs
        && globals.lobby.settings.showBGAUI
        && !this.isPlayed
        && !this.isDiscarded
    ) {
        // In BGA mode, our hand is the one closest to the top
        // So, invert the arrows so that it is easier to see them
        // We also need to move the arrow slightly so that
        // it does not cover the third box on the bottom of the card
        this.indicatorGroup.setX(this.getWidth());
        this.indicatorGroup.setY(this.getHeight() * 1.4); // 1.18 is the "normal" height
        this.indicatorGroup.setRotation(180);
    }
};

HanabiCard.prototype.initNote = function initNote(config) {
    // Define the note indicator image
    const noteX = 0.78;
    const noteY = 0.03;
    const size = 0.2 * config.width;
    this.noteGiven = new graphics.Image({
        x: noteX * config.width,
        // If the cards have triangles on the corners that show the color composition,
        // the images will overlap
        // Thus, we move it downwards if this is the case
        y: (globals.variant.offsetCardIndicators ? noteY + 0.1 : noteY) * config.height,
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

        const tooltip = $(`#tooltip-card-${this.order}`);
        tooltip.tooltipster('close');
    });
};

HanabiCard.prototype.initEmpathy = function initEmpathy() {
    // Click on a teammate's card to have the card show as it would to that teammate
    // (or, in a replay, show your own card as it appeared at that moment in time)
    // Pips visibility state is tracked so it can be restored for your own hand during a game
    const toggleHolderViewOnCard = (card, enabled, togglePips) => {
        const toggledPips = [0, 0];
        if (card.rankPips.visible() !== enabled && togglePips[0] === 1) {
            card.rankPips.setVisible(enabled);
            toggledPips[0] = 1;
        }
        if (card.suitPips.visible() !== enabled && togglePips[1] === 1) {
            card.suitPips.setVisible(enabled);
            toggledPips[1] = 1;
        }
        card.showOnlyLearned = enabled;
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

HanabiCard.prototype.setIndicator = function setIndicator(visible, giver, target, clue) {
    if (visible) {
        if (clue === null) {
            // This is a shared replay arrow, so don't draw the circle
            this.indicatorCircle.hide();
            this.indicatorText.hide();
            const color = sharedReplayIndicatorArrowColor;
            this.indicatorArrow.setStroke(color);
            this.indicatorArrow.setFill(color);
        } else {
            // Change the color of the arrow
            let color;
            if (this.numPositiveClues >= 2) {
                // "Non-freshly touched" cards use a different color
                color = '#737373'; // Dark gray
            } else {
                // "Freshly touched" cards use the default arrow color
                color = 'white'; // The default color
            }
            this.indicatorArrow.setStroke(color);
            this.indicatorArrow.setFill(color);

            // Clue arrows are white with a circle that shows the type of clue given
            if (globals.variant.name.startsWith('Duck')) {
                // Don't show the circle in Duck variants,
                // since the clue types are supposed to be hidden
                this.indicatorCircle.hide();
            } else {
                this.indicatorCircle.show();
                if (clue.type === constants.CLUE_TYPE.RANK) {
                    this.indicatorCircle.setFill('black');
                    this.indicatorText.setText(clue.value.toString());
                    this.indicatorText.show();
                } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                    this.indicatorCircle.setFill(clue.value.hexCode);
                    this.indicatorText.hide();
                }
            }

            if (this.indicatorTween) {
                this.indicatorTween.destroy();
            }
            if (globals.animateFast) {
                // Just set the arrow in position
                this.indicatorGroup.setX(this.indicatorGroup.originalX);
                this.indicatorGroup.setY(this.indicatorGroup.originalY);
            } else if (giver !== null) {
                /*
                    Animate the arrow flying from the player who gave the clue to the cards
                */

                // Get the center position of the clue giver's hand
                const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();

                // We need to adjust it to account for the size of the indicator arrow group
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
                centerPos.x -= indW / 2 * Math.cos(indTheta);
                centerPos.y -= indW / 2 * Math.sin(indTheta);

                this.indicatorGroup.setAbsolutePosition(centerPos);

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

        if (this.isDiscarded) {
            // The cards in the discard pile are packed together tightly
            // So, if the arrows are hovering over a card, it will not be clear which card the arrow
            // is pointing to
            // Thus, move the arrow to be flush with the card
            this.indicatorGroup.setY(-this.getHeight() / 2 + 0.02 * globals.stage.getHeight());
        } else {
            // Fix the bug where the arrows can be hidden by other cards
            // (but ignore the discard pile because it has to be in a certain order)
            this.getParent().getParent().moveToTop();
        }
    }

    this.indicatorGroup.setVisible(visible);
    if (!globals.animateFast) {
        globals.layers.card.batchDraw();
    }
};

HanabiCard.prototype.applyClue = function applyClue(clue, positive) {
    if (globals.variant.name.startsWith('Duck')) {
        return;
    }

    if (clue.type === CLUE_TYPE.RANK) {
        const clueRank = clue.value;
        const findPipElement = rank => this.rankPips.find(`.${rank}`);
        const findPipElementX = rank => this.rankPips.find(`.${rank}-x`);
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
        removed.forEach((rank) => {
            findPipElement(rank).hide();
            findPipElementX(rank).hide();
        });

        if (this.possibleRanks.length === 1) {
            [this.trueRank] = this.possibleRanks;
            globals.learnedCards[this.order].rank = this.trueRank;

            // Don't hide the pips if the card is unclued
            if (!this.isInPlayerHand() || this.isClued()) {
                findPipElement(this.trueRank).hide();
                this.rankPips.hide();
            }
        }

        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleRanks,
            s => this.possibleRanks.includes(s),
        );
    } else if (clue.type === CLUE_TYPE.COLOR) {
        const clueColor = clue.value;
        const findPipElement = suit => this.suitPips.find(`.${suit.name}`);
        const findPipElementX = suit => this.suitPips.find(`.${suit.name}-x`);
        const removed = filterInPlace(
            this.possibleSuits,
            suit => suit.clueColors.includes(clueColor) === positive,
        );
        removed.forEach((suit) => {
            findPipElement(suit).hide();
            findPipElementX(suit).hide();
        });

        if (this.possibleSuits.length === 1) {
            [this.trueSuit] = this.possibleSuits;
            globals.learnedCards[this.order].suit = this.trueSuit;

            // Don't hide the pips if the card is unclued
            if (!this.isInPlayerHand() || this.isClued()) {
                findPipElement(this.trueSuit).hide();
                this.suitPips.hide();
            }
        }

        // Ensure that the learned card data is not overwritten with less recent information
        filterInPlace(
            globals.learnedCards[this.order].possibleSuits,
            s => this.possibleSuits.includes(s),
        );
    } else {
        console.error('Clue type invalid.');
    }

    // Update the list of possible cards that this card could be
    // We go in reverse to avoid splicing bugs:
    // https://stackoverflow.com/questions/16217333/remove-items-from-array-with-splice-in-for-loop
    for (let i = this.possibleCards.length - 1; i >= 0; i--) {
        const card = this.possibleCards[i];

        // This logic will work for both positive and negative clues
        if (!this.possibleRanks.includes(card.rank) || !this.possibleSuits.includes(card.suit)) {
            this.possibleCards.splice(i, 1);
            continue;
        }
    }

    // Since information was added to this card,
    // we might have enough information to cross out some pips
    if (!this.isRevealed()) {
        this.checkPipPossibilities();
    }
};

// Check to see if we can put an X over any of the shown pips
HanabiCard.prototype.checkPipPossibilities = function checkPipPossibilities() {
    for (const suit of globals.variant.suits) {
        // Get the corresponding pip
        const suitPip = this.suitPips.find(`.${suit.name}`)[0];
        if (!suitPip.getVisible()) {
            continue;
        }

        let stillPossible = false;
        for (const card of this.possibleCards) {
            if (card.suit === suit) {
                stillPossible = true;
                break;
            }
        }
        if (!stillPossible) {
            // All the cards of this suit are seen, so put an X over the suit pip
            const x = this.suitPips.find(`.${suit.name}-x`)[0];
            x.setVisible(true);
        }
    }

    for (let rank = 1; rank <= 5; rank++) {
        // Get the corresponding pip
        const rankPip = this.rankPips.find(`.${rank}`)[0];
        if (!rankPip.getVisible()) {
            continue;
        }

        let stillPossible = false;
        for (const card of this.possibleCards) {
            if (card.rank === rank) {
                stillPossible = true;
                break;
            }
        }
        if (!stillPossible) {
            // All the cards of this rank are seen, so put an X over the rank pip
            const x = this.rankPips.find(`.${rank}-x`)[0];
            x.setVisible(true);
        }
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

    // No actions in this function use modifiers other than Alt
    if (event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
    }

    if (event.altKey) {
        // Alt + clicking a card goes to the turn it was drawn
        gotoTurn(this.turnDrawn, this.order);
    } else if (this.isPlayed) {
        // Clicking on played cards goes to the turn immediately before they were played
        gotoTurn(this.turnPlayed, this.order);
    } else if (this.isDiscarded) {
        // Clicking on discarded cards goes to the turn immediately before they were discarded
        gotoTurn(this.turnDiscarded, this.order);
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
    // in case someone is pushing their push-to-talk hotkey while highlighting cards)
    if (
        globals.sharedReplay
        && globals.amSharedReplayLeader
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
    // Even if they are not a leader in a shared replay,
    // a user might still want to draw an arrow on a card for demonstration purposes
    // However, we don't want this functionality in shared replays because
    // it could be misleading as to who the real replay leader is
    if (
        event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && globals.sharedReplay === false
    ) {
        this.toggleSharedReplayIndicator();
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
    if (globals.amSharedReplayLeader) {
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
        // Disable all click events if the card is tweening from the deck to the hand
        // (the second condition looks to see if it is the first card in the hand)
        || (this.tweening && this.parent.index === this.parent.parent.children.length - 1)
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
        globals.preCluedCard = this.order;

        // A card may be cluable by more than one color, so we need to figure out which color to use
        const clueButton = globals.elements.clueTypeButtonGroup.getPressed();
        const cardColors = this.trueSuit.clueColors;
        let color;
        if (
            // If a clue type button is selected
            clueButton
            // If a color clue type button is selected
            && clueButton.clue.type === constants.CLUE_TYPE.COLOR
            // If the selected color clue is actually one of the possibilies for the card
            && cardColors.findIndex(cardColor => cardColor === clueButton.clue.value) !== -1
        ) {
            // Use the color of the currently selected button
            color = clueButton.clue.value;
        } else {
            // Otherwise, just use the first possible color
            // e.g. for rainbow cards, use blue
            [color] = cardColors;
        }

        const value = globals.variant.clueColors.findIndex(variantColor => variantColor === color);
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
        globals.preCluedCard = this.order;
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

HanabiCard.prototype.reveal = function reveal(suit, rank) {
    // Local variables
    suit = convert.msgSuitToSuit(suit, globals.variant);

    // Update the possibilities for the player who played/discarded this card
    // (but we don't need to do anything if the card was already fully-clued)
    if (!this.trueSuit || !this.trueRank) {
        const hand = globals.elements.playerHands[this.holder];
        for (const layoutChild of hand.children) {
            const card = layoutChild.children[0];
            if (card.order === this.order) {
                // There is no need to update the card that is being revealed
                continue;
            }
            card.removePossibility(suit, rank);
        }
    }

    // Set the true suit/rank on the card
    this.showOnlyLearned = false;
    this.trueSuit = suit;
    this.trueRank = rank;

    // Keep track of what this card is (so that we can show faded pips, etc.)
    globals.learnedCards[this.order] = {
        suit,
        rank,
        possibleSuits: [suit],
        possibleRanks: [rank],
        revealed: true,
    };

    // Redraw the card
    this.suitPips.hide();
    this.rankPips.hide();
    this.setBareImage();

    // Hide any existing arrows on all cards
    globals.lobby.ui.showClueMatch(-1);

    // Unflip the arrow, if it is flipped
    this.initArrowLocation();
};

HanabiCard.prototype.removeFromParent = function removeFromParent() {
    // Remove the card from the player's hand in preparation of adding it to either
    // the play stacks or the discard pile
    const layoutChild = this.parent;
    if (!layoutChild.parent) {
        // If a tween is destroyed in the middle of animation, it can cause a card to be orphaned
        return;
    }
    const pos = layoutChild.getAbsolutePosition();
    layoutChild.setRotation(layoutChild.parent.getRotation());
    layoutChild.remove();
    layoutChild.setAbsolutePosition(pos);
};

HanabiCard.prototype.animateToPlayStacks = function animateToPlayStacks() {
    const playStack = globals.elements.playStacks.get(this.trueSuit);
    playStack.add(this.parent); // This is the LayoutChild
    playStack.moveToTop();
};

HanabiCard.prototype.animateToDiscardPile = function animateToDiscardPile() {
    globals.elements.discardStacks.get(this.trueSuit).add(this.parent); // This is the LayoutChild

    // We need to bring the discarded card to the top so that when it tweens to the discard pile,
    // it will fly on top of the play stacks and other player's hands
    // However, if we use "globals.elements.discardStacks.get(suit).moveToTop()" like we do in the
    // "animateToPlayStacks()" function,
    // then the discard stacks will not be arranged in the correct order
    // Thus, move all of the discord piles to the top in order so that they will be properly
    // overlapping (the bottom-most stack should have priority over the top)
    for (const discardStack of globals.elements.discardStacks) {
        // Since "discardStacks" is a Map(),
        // "discardStack" is an array containing a Suit and CardLayout
        if (discardStack[1]) {
            discardStack[1].moveToTop();
        }
    }
};

HanabiCard.prototype.setNote = function setNote(note) {
    notes.set(this.order, note);
    notes.update(this);
    notes.show(this);
};

HanabiCard.prototype.getSlotNum = function getSlotNum() {
    const numCardsInHand = this.parent.parent.children.length;
    for (let i = 0; i < numCardsInHand; i++) {
        const layoutChild = this.parent.parent.children[i];
        if (layoutChild.children[0].order === this.order) {
            return numCardsInHand - i;
        }
    }

    return -1;
};

HanabiCard.prototype.isCritical = function isCritical() {
    if (
        !this.isRevealed()
        || this.isPlayed
        || this.isDiscarded
        || !needsToBePlayed(this.trueSuit, this.trueRank)
    ) {
        return false;
    }

    const num = getSpecificCardNum(this.trueSuit, this.trueRank);
    return num.total === num.discarded + 1;
};

HanabiCard.prototype.isPotentiallyPlayable = function isPotentiallyPlayable() {
    // Don't bother calculating this for Up or Down variants
    if (globals.variant.name.startsWith('Up or Down')) {
        return true;
    }

    let potentiallyPlayable = false;
    for (const card of this.possibleCards) {
        const nextRankNeeded = globals.elements.playStacks.get(card.suit).children.length + 1;
        if (card.rank === nextRankNeeded) {
            potentiallyPlayable = true;
            break;
        }
    }
    return potentiallyPlayable;
};

HanabiCard.prototype.removePossibility = function removePossibility(suit, rank) {
    // Every card has a possibility list that contains each card in the game that it could be
    // Remove one possibility for this card
    let removedSomething = false;
    for (let i = 0; i < this.possibleCards.length; i++) {
        const possibleCard = this.possibleCards[i];
        if (possibleCard.suit === suit && possibleCard.rank === rank) {
            removedSomething = true;
            this.possibleCards.splice(i, 1);
            break;
        }
    }

    if (removedSomething) {
        this.checkPipPossibilities();
    }
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

const gotoTurn = (turn, order) => {
    if (globals.replay) {
        replay.checkDisableSharedTurns();
    } else {
        replay.enter();
    }
    replay.goto(turn, true);

    // Also indicate the card to make it easier to find
    // (we have to use "globals.deck" instead of "this" because the card will get overwritten)
    globals.deck[order].toggleSharedReplayIndicator();
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
