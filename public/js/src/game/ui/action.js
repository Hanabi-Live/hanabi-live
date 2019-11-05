// Imports
import globals from './globals';
import * as arrows from './arrows';

export const handle = (data) => {
    globals.savedAction = data;

    if (globals.inReplay) {
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
        if (data.canClue) {
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
    // (but we need to keep them draggable if the pre-play setting is enabled
    // or if we are in a hypothetical)
    if (!globals.lobby.settings.speedrunPreplay && !globals.hypothetical) {
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
