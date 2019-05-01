/*
    Miscellaneous helper functions that apply to the entire UI generally
*/

// Imports
const arrows = require('./arrows');
const constants = require('../../constants');
const globals = require('./globals');
const hypothetical = require('./hypothetical');
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
};

const stopAction = () => {
    globals.elements.clueArea.hide();
    globals.elements.currentPlayerArea.hide();
    globals.elements.premoveCancelButton.hide();
    globals.elements.noDiscardLabel.hide();
    globals.elements.noDoubleDiscardLabel.hide();
    arrows.hideAll();

    // Make all of the cards in our hand not draggable
    // (but we need to keep them draggable if the pre-play setting is enabled)
    if (!globals.lobby.settings.speedrunPreplay) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const child of ourHand.children) {
            // This is a LayoutChild
            child.off('dragend');
            child.setDraggable(false);
        }
    }

    globals.elements.deck.cardBack.setDraggable(false);
    globals.elements.deckPlayAvailableLabel.hide();
};
exports.stopAction = stopAction;

exports.endTurn = (action) => {
    if (globals.hypothetical) {
        hypothetical.send(action);
        stopAction();
        return;
    }

    if (globals.ourTurn) {
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
};

exports.recordStrike = (data) => {
    const i = data.num - 1;
    const strike = globals.elements.strikes[i];
    const strikeSquare = globals.elements.strikeSquares[i];

    // We want to record the turn before the strike actually happened
    let turn;
    if (Object.prototype.hasOwnProperty.call(data, 'turn')) {
        turn = data.turn - 1;
    } else {
        // Games prior to 2019 will not have the turn integrated into the strike
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
        // Games prior to 2019 will not have the card number integrated into the strike
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
    if (globals.editingNote !== null) {
        globals.actionOccured = true;
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
        throw new Error(`A WebSocket notify function for the "${type}" command is not defined.`);
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
    if (!globals.timed || globals.replay) {
        return;
    }

    if (globals.paused) {
        // If we queued a pause, unqueue it
        globals.pauseQueued = false;
        const wasVisible = globals.elements.timer1Circle.getVisible();
        if (wasVisible !== globals.pauseQueued) {
            globals.elements.timer1Circle.setVisible(globals.pauseQueued);
            globals.layers.UI.batchDraw();
        }

        globals.elements.stageFade.setOpacity(0.8);
        globals.elements.stageFade.show();
        globals.elements.stageFade.getLayer().batchDraw();

        globals.elements.timer1.hide();
        globals.elements.timer2.hide();
        globals.elements.timer1.getLayer().batchDraw();

        globals.elements.pauseArea.show();
        globals.elements.pauseText.setText(`by: ${globals.pausePlayer}`);
        globals.elements.pauseArea.getLayer().batchDraw();
    } else {
        globals.elements.stageFade.setOpacity(0.3);
        globals.elements.stageFade.hide();
        globals.elements.stageFade.getLayer().batchDraw();

        globals.elements.timer1.setVisible(!globals.spectating);
        globals.elements.timer2.show();
        globals.elements.timer1.getLayer().batchDraw();

        globals.elements.pauseArea.hide();
        globals.elements.pauseArea.getLayer().batchDraw();
    }
};
