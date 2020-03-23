// Imports
import * as action from './action';
import { Action } from './actions';
import { ACTION, MAX_CLUE_NUM } from '../../constants';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as replay from './replay';

export const end = (actionObject: Action) => {
    if (globals.hypothetical) {
        hypothetical.send(actionObject);
        action.stop();
        return;
    }

    if (globals.ourTurn) {
        replay.exit(); // Close the in-game replay if we preplayed a card in the replay
        globals.lobby.conn.send('action', actionObject);
        action.stop();
    } else {
        globals.queuedAction = actionObject;
        let text = 'Cancel Pre-';
        if (globals.queuedAction.type === ACTION.CLUE) {
            text += 'Clue';
        } else if (globals.queuedAction.type === ACTION.PLAY) {
            text += 'Play';
        } else if (globals.queuedAction.type === ACTION.DISCARD) {
            text += 'Discard';
        }
        globals.elements.premoveCancelButton!.text(text);
        globals.elements.premoveCancelButton!.show();
        globals.elements.currentPlayerArea!.hide();
        globals.layers.get('UI')!.batchDraw();
    }
};

export const begin = () => {
    action.handle();

    if (globals.animateFast) {
        return;
    }

    // Handle pre-playing / pre-discarding / pre-cluing
    if (globals.queuedAction !== null) {
        // Get rid of the pre-move button, since it is now our turn
        globals.elements.premoveCancelButton!.hide();
        globals.layers.get('UI')!.batchDraw();

        if (globals.queuedAction.type === ACTION.CLUE) {
            // Prevent pre-cluing if the team is now at 0 clues
            if (globals.clues === 0) {
                return;
            }

            // Prevent pre-cluing if the card is no longer in the hand
            if (globals.preCluedCard === null) {
                throw new Error('"globals.preCluedCard" was null in the "turn.begin()" function.');
            }
            const card = globals.deck[globals.preCluedCard];
            if (
                globals.queuedAction.type === ACTION.CLUE
                && (card.isPlayed || card.isDiscarded)
            ) {
                return;
            }
        }

        // Prevent discarding if the team is at the maximum amount of clues
        if (
            globals.queuedAction.type === ACTION.DISCARD
            && globals.clues === MAX_CLUE_NUM
        ) {
            return;
        }

        // We don't want to send the queued action right away, or else it introduces bugs
        setTimeout(() => {
            globals.lobby.conn.send('action', globals.queuedAction);
            globals.queuedAction = null;
            globals.preCluedCard = null;
            action.stop();
        }, 100);
    }
};
