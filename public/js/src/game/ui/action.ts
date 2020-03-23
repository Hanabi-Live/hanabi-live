// Imports
import * as arrows from './arrows';
import globals from './globals';

export const handle = () => {
    if (globals.inReplay && !globals.hypothetical) {
        return;
    }

    if (globals.ourTurn) {
        // Reset and show the clue UI
        if (globals.elements.clueTargetButtonGroup!.list.length === 1) {
            // In 2-player games,
            // default the clue recipient button to the only other player available
            // Otherwise, leave the last player selected
            globals.elements.clueTargetButtonGroup!.list[0].setPressed(true);
        }
        globals.elements.clueTypeButtonGroup!.clearPressed();
        globals.elements.clueArea!.show();
        globals.elements.currentPlayerArea!.hide();

        // Fade the clue UI if there is not a clue available
        if (globals.clues >= 1) {
            globals.elements.clueArea!.opacity(1);
            globals.elements.clueAreaDisabled!.hide();
        } else {
            globals.elements.clueArea!.opacity(0.2);
            globals.elements.clueAreaDisabled!.show();
        }
    }

    // Set our hand to being draggable
    if (
        // This is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable
        !globals.lobby.settings.get('speedrunPreplay')
        // This is unnecessary if this a speedrun,
        // as clicking on cards takes priority over dragging cards
        && !globals.speedrun
        // In hypotheticals, setting cards to be draggable is handled elsewhere
        && !globals.hypothetical
    ) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const layoutChild of ourHand.children.toArray()) {
            layoutChild.checkSetDraggable();
        }
    }

    if (globals.deckPlays) {
        globals.elements.deck!.cardBack.draggable(globals.deckSize === 1);
        globals.elements.deckPlayAvailableLabel!.visible(globals.deckSize === 1);

        // Ensure the deck is above other cards and UI elements
        if (globals.deckSize === 1) {
            globals.elements.deck!.moveToTop();
        }
    }

    globals.layers.get('UI')!.batchDraw();
};

export const stop = () => {
    globals.elements.clueArea!.hide();
    globals.elements.clueAreaDisabled!.hide();
    globals.elements.currentPlayerArea!.hide();
    globals.elements.premoveCancelButton!.hide();
    globals.elements.noDiscardBorder!.hide();
    globals.elements.noDoubleDiscardBorder!.hide();
    arrows.hideAll();

    // Make all of the cards in our hand not draggable
    // (but we need to keep them draggable if the pre-play setting is enabled)
    if (!globals.lobby.settings.get('speedrunPreplay')) {
        const ourHand = globals.elements.playerHands[globals.playerUs];
        for (const child of ourHand.children.toArray()) {
            // This is a LayoutChild
            child.off('dragend');
            child.draggable(false);
        }
    }

    globals.elements.deck!.cardBack.draggable(false);
    globals.elements.deckPlayAvailableLabel!.hide();
};
