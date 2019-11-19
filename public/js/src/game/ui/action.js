// Imports
import { ACTION, MAX_CLUE_NUM } from '../../constants';
import * as arrows from './arrows';
import globals from './globals';
import * as notifications from '../../notifications';

export const startTurn = () => {
    handle();

    if (globals.animateFast) {
        return;
    }

    if (globals.lobby.settings.sendTurnNotify) {
        notifications.send('It is your turn.', 'turn');
    }

    // Handle pre-playing / pre-discarding / pre-cluing
    if (globals.queuedAction !== null) {
        // Get rid of the pre-move button, since it is now our turn
        globals.elements.premoveCancelButton.hide();
        globals.layers.UI.batchDraw();

        if (globals.queuedAction.data.type === ACTION.CLUE) {
            // Prevent pre-cluing if the team is now at 0 clues
            if (globals.clues === 0) {
                return;
            }

            // Prevent pre-cluing if the card is no longer in the hand
            const card = globals.deck[globals.preCluedCard];
            if (
                globals.queuedAction.data.type === ACTION.CLUE
                && (card.isPlayed || card.isDiscarded)
            ) {
                return;
            }
        }

        // Prevent discarding if the team is at the maximum amount of clues
        if (
            globals.queuedAction.data.type === ACTION.DISCARD
            && globals.clues === MAX_CLUE_NUM
        ) {
            return;
        }

        // We don't want to send the queued action right away, or else it introduces bugs
        setTimeout(() => {
            globals.lobby.conn.send(globals.queuedAction.type, globals.queuedAction.data);
            globals.queuedAction = null;
            globals.preCluedCard = null;
            stop();
        }, 100);
    }
};

export const handle = (data) => {
    if (globals.inReplay && !globals.hypothetical) {
        return;
    }

    if (data !== null) {
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

        // Fade the clue UI if there is not a clue available
        if (globals.clues >= 1) {
            globals.elements.clueArea.setOpacity(1);
            globals.elements.clueAreaDisabled.hide();
        } else {
            globals.elements.clueArea.setOpacity(0.2);
            globals.elements.clueAreaDisabled.show();
        }
    }

    // Set our hand to being draggable
    if (
        // This is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable
        !globals.lobby.settings.speedrunPreplay
        // This is unnecessary if this a speedrun,
        // as clicking on cards takes priority over dragging cards
        && !globals.speedrun
        // In hypotheticals, setting cards to be draggable is handled elsewhere
        && !globals.hypothetical
    ) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const layoutChild of ourHand.children) {
            layoutChild.checkSetDraggable();
        }
    }

    if (globals.deckPlays) {
        globals.elements.deck.cardBack.setDraggable(globals.deckSize === 1);
        globals.elements.deckPlayAvailableLabel.setVisible(globals.deckSize === 1);

        // Ensure the deck is above other cards and UI elements
        if (globals.deckSize === 1) {
            globals.elements.deck.moveToTop();
        }
    }

    globals.layers.UI.batchDraw();
};

export const stop = () => {
    globals.elements.clueArea.hide();
    globals.elements.clueAreaDisabled.hide();
    globals.elements.currentPlayerArea.hide();
    globals.elements.premoveCancelButton.hide();
    globals.elements.noDiscardBorder.hide();
    globals.elements.noDoubleDiscardBorder.hide();
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
