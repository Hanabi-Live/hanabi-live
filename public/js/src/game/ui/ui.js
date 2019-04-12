/*
    Miscellaneous helper functions that apply to the entire UI generally
*/

// Imports
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const hypothetical = require('./hypothetical');
const notes = require('./notes');
const notify = require('./notify');

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

    globals.elements.playerHands[globals.playerUs].moveToTop();

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
                    || card.trueSuit === constants.SUIT.DARKRAINBOW
                    || card.trueSuit.clueColors.includes(clueColor)
                ) {
                    touched = true;
                }
            }

            if (touched) {
                match = true;
                card.setArrow(true, null, clue);
            } else {
                card.setArrow(false, null, null);
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

exports.arrowClick = (event, order, element) => {
    if (
        event.evt.which === 3 // Right-click
        && globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        globals.lobby.conn.send('replayAction', {
            type: constants.REPLAY_ACTION_TYPE.ARROW,
            order,
        });

        // Draw the arrow manually so that we don't have to wait for the client to server round-trip
        const visible = !element.arrow.getVisible();
        hideAllArrows();
        element.arrow.setVisible(visible);
        globals.layers.card.batchDraw();

        // If this element has a tooltip and it is open, close it
        if (element.tooltipName) {
            const tooltip = $(`#tooltip-${element.tooltipName}`);
            tooltip.tooltipster('close');
        }
    }
};

const hideAllArrows = () => {
    // Hide arrows on all of the cards
    for (let i = 0; i <= globals.indexOfLastDrawnCard; i++) {
        globals.deck[i].setArrow(false, null, null);
    }

    // Also hide the arrows on the other various UI elements
    const elements = [
        globals.elements.deck,
        globals.elements.cluesNumberLabel,
        globals.elements.paceNumberLabel,
        globals.elements.efficiencyNumberLabel,
        globals.elements.efficiencyNumberLabelMinNeeded,
    ];
    for (const element of elements) {
        element.arrow.hide();
    }

    globals.layers.card.batchDraw();
};
exports.hideAllArrows = hideAllArrows;

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
