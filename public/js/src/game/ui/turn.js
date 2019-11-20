// Imports
import * as action from './action';
import { ACTION, MAX_CLUE_NUM } from '../../constants';
import globals from './globals';
import * as notifications from '../../notifications';
import * as replay from './replay';

export const end = (actionObject) => {
    if (globals.hypothetical) {
        globals.functions.hypotheticalSendHandler(actionObject);
        return;
    }

    if (globals.ourTurn) {
        replay.exit(); // Close the in-game replay if we preplayed a card in the replay
        globals.lobby.conn.send('action', actionObject.data);
        action.stop();
    } else {
        globals.queuedAction = actionObject;
        let text = 'Cancel Pre-';
        if (globals.queuedAction.data.type === ACTION.CLUE) {
            text += 'Clue';
        } else if (globals.queuedAction.data.type === ACTION.PLAY) {
            text += 'Play';
        } else if (globals.queuedAction.data.type === ACTION.DISCARD) {
            text += 'Discard';
        }
        globals.elements.premoveCancelButton.setText(text);
        globals.elements.premoveCancelButton.show();
        globals.elements.currentPlayerArea.hide();
        globals.layers.UI.batchDraw();
    }
};

export const begin = () => {
    action.handle();

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
            action.stop();
        }, 100);
    }
};
