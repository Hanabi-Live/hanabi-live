/*
    Miscellaneous helper functions that apply to the entire UI generally
*/

// Imports
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const graphics = require('./graphics');
const hypothetical = require('./hypothetical');
const notes = require('./notes');
const notify = require('./notify');
const timer = require('./timer');

exports.handleAction = (data) => {
    globals.savedAction = data;

    if (globals.inReplay) {
        return;
    }

    if (data.canClue) {
        // Reset and show the clue UI
        if (globals.playerNames.length === 2) {
            // In 2-player games,
            // default the clue recipient button to the only other player available
            // Otherwise, leave the last player selected
            globals.elements.clueTargetButtonGroup.list[0].setPressed(true);
        }
        globals.elements.clueTypeButtonGroup.clearPressed();
        globals.elements.clueArea.show();
        globals.elements.currentPlayerArea.hide();
    }
    globals.layers.UI.batchDraw();

    // Set our hand to being draggable
    if (
        // This is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable
        !globals.lobby.settings.speedrunPreplay
        // This is unnecessary if this a speedrun,
        // as clicking on cards takes priority over dragging cards
        && !globals.speedrun
    ) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const layoutChild of ourHand.children) {
            layoutChild.checkSetDraggable();
        }
    }

    if (globals.deckPlays) {
        globals.elements.deck.cardBack.setDraggable(data.canBlindPlayDeck);
        globals.elements.deckPlayAvailableLabel.setVisible(data.canBlindPlayDeck);

        // Ensure the deck is above other cards and UI elements
        if (data.canBlindPlayDeck) {
            globals.elements.deck.moveToTop();
        }
    }

    const showClueMatch = (target, clue) => {
        hideAllArrows();

        let match = false;
        for (let i = 0; i < globals.elements.playerHands[target].children.length; i++) {
            const child = globals.elements.playerHands[target].children[i];
            const card = child.children[0];

            let touched = false;
            if (clue.type === constants.CLUE_TYPE.RANK) {
                if (
                    clue.value === card.trueRank
                    || (globals.variant.name.startsWith('Multi-Fives') && card.trueRank === 5)
                ) {
                    touched = true;
                }
            } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                const clueColor = clue.value;
                if (
                    card.trueSuit === constants.SUIT.RAINBOW
                    || card.trueSuit === constants.SUIT.DARK_RAINBOW
                    || card.trueSuit.clueColors.includes(clueColor)
                ) {
                    touched = true;
                }
            }

            if (touched) {
                match = true;
                setArrow(i, card, null, clue);
            }
        }

        return match;
    };

    const checkClueLegal = () => {
        const target = globals.elements.clueTargetButtonGroup.getPressed();
        const clueButton = globals.elements.clueTypeButtonGroup.getPressed();

        if (!target || !clueButton) {
            globals.elements.giveClueButton.setEnabled(false);
            return;
        }

        const who = target.targetIndex;
        const match = showClueMatch(who, clueButton.clue);

        // By default, only enable the "Give Clue" button if the clue "touched"
        // one or more cards in the hand
        const enabled = match
            // Make an exception if they have the optional setting for "Empty Clues" turned on
            || globals.emptyClues
            // Make an exception for the "Color Blind" variants (color clues touch no cards)
            || (globals.variant.name.startsWith('Color Blind')
                && clueButton.clue.type === constants.CLUE_TYPE.COLOR)
            // Make an exception for certain characters
            || (globals.characterAssignments[globals.playerUs] === 'Blind Spot'
                && who === (globals.playerUs + 1) % globals.playerNames.length)
            || (globals.characterAssignments[globals.playerUs] === 'Oblivious'
                && who === (globals.playerUs - 1 + globals.playerNames.length)
                % globals.playerNames.length);

        globals.elements.giveClueButton.setEnabled(enabled);
    };

    globals.elements.clueTargetButtonGroup.on('change', checkClueLegal);
    globals.elements.clueTypeButtonGroup.on('change', checkClueLegal);
};

const stopAction = () => {
    globals.elements.clueArea.hide();
    globals.elements.currentPlayerArea.hide();
    globals.elements.premoveCancelButton.hide();
    globals.elements.noDiscardLabel.hide();
    globals.elements.noDoubleDiscardLabel.hide();

    hideAllArrows();
    globals.elements.clueTargetButtonGroup.off('change');
    globals.elements.clueTypeButtonGroup.off('change');

    // Make all of the cards in our hand not draggable
    // (but we need to keep them draggable if the pre-play setting is enabled)
    if (!globals.lobby.settings.speedrunPreplay) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const child of ourHand.children) {
            // This is a LayoutChild
            child.off('dragend.play');
            child.setDraggable(false);
        }
    }

    globals.elements.deck.cardBack.setDraggable(false);
    globals.elements.deckPlayAvailableLabel.hide();
};
exports.stopAction = stopAction;

exports.giveClue = () => {
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    const clueButton = globals.elements.clueTypeButtonGroup.getPressed();
    if (
        !globals.ourTurn // We can only give clues on our turn
        || globals.clues === 0 // We can only give a clue if there is one available
        || !target // We might have not selected a clue recipient
        || !clueButton // We might have not selected a type of clue
        // We might be trying to give an invalid clue (e.g. an Empty Clue)
        || !globals.elements.giveClueButton.enabled
        // Prevent the user from accidentally giving a clue in certain situations
        || (Date.now() - globals.accidentalClueTimer < 1000)
    ) {
        return;
    }

    hideAllArrows();

    // Send the message to the server
    this.endTurn({
        type: 'action',
        data: {
            type: constants.ACT.CLUE,
            target: target.targetIndex,
            clue: convert.clueToMsgClue(clueButton.clue, globals.variant),
        },
    });
};

exports.endTurn = (action) => {
    if (globals.hypothetical) {
        hypothetical.send(action);
        stopAction();
        return;
    }

    if (globals.ourTurn) {
        globals.ourTurn = false;
        globals.lobby.conn.send('action', action.data);
        stopAction();
    } else {
        globals.queuedAction = action;
        let text = 'Cancel Pre-';
        if (globals.queuedAction.data.type === constants.ACT.CLUE) {
            text += 'Clue';
        } else if (globals.queuedAction.data.type === constants.ACT.PLAY) {
            text += 'Play';
        } else if (globals.queuedAction.data.type === constants.ACT.DISCARD) {
            text += 'Discard';
        }
        globals.elements.premoveCancelButton.setText(text);
        globals.elements.premoveCancelButton.show();
        globals.elements.currentPlayerArea.hide();
        globals.layers.UI.batchDraw();
    }

    globals.savedAction = null;
};

exports.recordStrike = (data) => {
    const i = data.num - 1;
    const strike = globals.elements.strikes[i];
    const strikeSquare = globals.elements.strikeSquares[i];

    // We want to go to the turn before the strike actually happened
    let turn;
    if (Object.prototype.hasOwnProperty.call(data, 'turn')) {
        turn = data.turn - 1;
    } else {
        // Old games will not have the turn integrated into the strike
        turn = globals.turn - 1;
        if (turn <= 0) {
            turn = null;
        }
    }
    strike.turn = turn;
    strikeSquare.turn = turn;

    // We also want to record the card that misplayed so that we can highlight it with an arrow
    let order;
    if (Object.prototype.hasOwnProperty.call(data, 'order')) {
        ({ order } = data);
    } else {
        // Old games will not have the card number integrated into the strike
        order = null;
    }
    strike.order = order;
    strikeSquare.order = order;

    // Show an indication that the strike is clickable
    strike.setFaded();
};

exports.handleNotify = (data) => {
    // If a user is editing a note and an action in the game happens,
    // mark to make the tooltip go away as soon as they are finished editing the note
    if (notes.vars.editing !== null) {
        notes.vars.actionOccured = true;
    }

    // Automatically close any tooltips once an action in the game happens
    if (globals.activeHover !== null) {
        globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.activeHover = null;
    }

    const { type } = data;
    if (Object.prototype.hasOwnProperty.call(notify, type)) {
        notify[type](data);
    } else {
        console.error(`A WebSocket notify function for the "${type}" command is not defined.`);
    }
};

exports.checkFadeInAllHands = () => {
    for (const cardLayout of globals.elements.playerHands) {
        for (const layoutChild of cardLayout.children) {
            const card = layoutChild.children[0];
            card.setFade();
        }
    }
};

exports.backToLobby = () => {
    // Hide the tooltip, if showing
    if (globals.activeHover) {
        globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.activeHover = null;
    }

    // Stop any timer-related callbacks
    timer.stop();

    globals.lobby.conn.send('gameUnattend');
    globals.game.hide();
};

exports.setPause = () => {
    if (globals.paused) {
        // If we queued a pause, unqueue it
        globals.pauseQueued = false;
        const wasVisible = globals.elements.timer1Circle.getVisible();
        if (wasVisible !== globals.pauseQueued) {
            globals.elements.timer1Circle.setVisible(globals.pauseQueued);
            globals.layers.UI.batchDraw();
        }

        globals.elements.stageFade.setOpacity(0.7);
        globals.elements.stageFade.show();
        globals.elements.stageFade.getLayer().batchDraw();

        globals.elements.timer1.hide();
        globals.elements.timer2.hide();
        globals.elements.timer1.getLayer().batchDraw();
    } else {
        globals.elements.stageFade.setOpacity(0.3);
        globals.elements.stageFade.hide();
        globals.elements.stageFade.getLayer().batchDraw();

        globals.elements.timer1.show();
        globals.elements.timer2.show();
        globals.elements.timer1.getLayer().batchDraw();
    }
};

/*
    Arrow functions
*/

const hideAllArrows = () => {
    let changed = false;
    for (const arrow of globals.elements.arrows) {
        if (arrow.pointingTo !== null) {
            changed = true;
            arrow.pointingTo = null;
            arrow.setVisible(false);
        }
    }
    if (!globals.animateFast && changed) {
        globals.layers.card.batchDraw();
    }
};
exports.hideAllArrows = hideAllArrows;

const setArrow = (i, element, giver, clue) => {
    // Show the arrow
    const arrow = globals.elements.arrows[i];
    arrow.pointingTo = element;
    arrow.show();
    arrow.moveToTop();

    // Figure out whether the arrrow should be inverted or not
    let rot = 0;
    if (
        element.type === 'HanabiCard'
        && !element.isPlayed
        && !element.isDiscarded
    ) {
        if (element.parent && element.parent.parent) {
            rot = element.parent.parent.rotation;
        }
        if (
            (!globals.lobby.settings.showKeldonUI && element.holder === globals.playerUs)
            || (globals.lobby.settings.showKeldonUI && element.holder !== globals.playerUs)
        ) {
            // In BGA mode, invert the arrows on our hand
            // (so that it doesn't get cut off by the top of the screen)
            // In Keldon mode, invert the arrows for all other players
            rot += 180;
        }
    }
    arrow.setRotation(rot);

    // We want the text to always be right-side up (e.g. have a rotaiton of 0)
    arrow.text.setRotation(360 - rot);

    // Set the arrow features
    if (clue === null) {
        // This is a highlight arrow
        const color = constants.ARROW_COLOR.HIGHLIGHT;
        arrow.base.setStroke(color);
        arrow.base.setFill(color);

        // Don't draw the circle
        arrow.circle.hide();
        arrow.text.hide();
    } else {
        // This is a clue arrow
        let color;
        if (this.numPositiveClues >= 2) {
            // Cards that are re-clued use a different color
            color = constants.ARROW_COLOR.RETOUCHED;
        } else {
            // Freshly touched cards use the default color
            color = constants.ARROW_COLOR.DEFAULT;
        }
        arrow.base.setStroke(color);
        arrow.base.setFill(color);

        // Clue arrows have a circle that shows the type of clue given
        if (globals.variant.name.startsWith('Duck')) {
            // Don't show the circle in Duck variants,
            // since the clue types are supposed to be hidden
            arrow.circle.hide();
        } else {
            arrow.circle.show();
            if (clue.type === constants.CLUE_TYPE.RANK) {
                arrow.circle.setFill('black');
                arrow.text.setText(clue.value.toString());
                arrow.text.show();
            } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                arrow.circle.setFill(clue.value.hexCode);
                arrow.text.hide();
            }
        }
    }

    if (arrow.tween) {
        arrow.tween.destroy();
    }
    if (globals.animateFast || giver === null) {
        const pos = getArrowPos(element, rot);
        arrow.setAbsolutePosition(pos);
    } else {
        animateArrow(arrow, element, rot, giver, globals.turn);
    }
    if (!globals.animateFast) {
        globals.layers.card.batchDraw();
    }
};
exports.setArrow = setArrow;

const getArrowPos = (element, rot) => {
    // Calculate the position of the arrow
    // If we set the arrow at the absolute position of a card, it will point to the exact center
    // Instead, back them off a little bit (accounting for the rotation of the hand)
    const pos = element.getAbsolutePosition();
    const distance = element.getHeight() * -0.11;
    const rotRadians = (rot / 180) * Math.PI;
    pos.x -= Math.sin(rotRadians) * distance;
    pos.y += Math.cos(rotRadians) * distance;

    // If this is an arrow for a UI element, we need to adjust the positions a little bit
    if (element === globals.elements.deck) {
        pos.x += element.getWidth() / 2;
        pos.y += element.getHeight() / 2.5;
    } else if (element === globals.elements.cluesNumberLabel) {
        pos.x += element.getWidth() * 0.15;
    } else if (element.type !== 'HanabiCard') {
        pos.x += element.getWidth() / 3;
    }

    return pos;
};

// Animate the arrow to fly from the player who gave the clue to the card
const animateArrow = (arrow, card, rot, giver, turn) => {
    // Don't bother doing the animation if it is delayed by more than one turn
    if (globals.turn > turn + 1) {
        return;
    }

    // Don't bother doing the animation if the card is no longer part of a hand
    // (which can happen rarely when jumping quickly through a replay)
    if (!card.parent.parent) {
        return;
    }

    // Delay the animation if the card is currently tweening to avoid buggy behavior
    if (card.tweening) {
        arrow.hide();
        setTimeout(() => {
            animateArrow(arrow, card, rot, giver, turn);
        }, 20);
        return;
    }
    arrow.show();

    // Start the arrow at the center position of the clue giver's hand
    const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();
    arrow.setAbsolutePosition(centerPos);

    // Calculate the position of the final arrow destination
    // (this must be done after the card is finished tweening)
    const pos = getArrowPos(card, rot);

    new graphics.Tween({
        node: arrow,
        duration: 0.5,
        x: pos.x,
        y: pos.y,
        easing: graphics.Easings.EaseOut,
    }).play();
};

exports.clickArrow = (event, order, element) => {
    if (
        event.evt.which === 3 // Right-click
        && globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        sendArrow(order, element);
    }
};

const sendArrow = (order, element) => {
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.ARROW,
        order,
    });

    // Draw the arrow manually so that we don't have to wait for the client to server round-trip
    toggleArrow(element);
};
exports.sendArrow = sendArrow;

// This toggles the "highlight" arrow on a particular element
const toggleArrow = (element) => {
    const arrow = globals.elements.arrows[0];
    const show = (
        arrow.pointingTo !== element
        || arrow.base.getFill() !== constants.ARROW_COLOR.HIGHLIGHT
    );
    hideAllArrows();
    if (show) {
        setArrow(0, element, null, null);

        // If this element has a tooltip and it is open, close it
        if (element.tooltipName) {
            const tooltip = $(`#tooltip-${element.tooltipName}`);
            tooltip.tooltipster('close');
        }
    }
};
exports.toggleArrow = toggleArrow;
