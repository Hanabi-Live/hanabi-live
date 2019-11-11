/*
    Miscellaneous helper functions that apply to the entire UI generally
*/

// Imports
import * as action from './action';
import { ACT } from '../../constants';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as replay from './replay';
import * as timer from './timer';

export const endTurn = (actionObject) => {
    if (globals.hypothetical) {
        hypothetical.send(actionObject);
        action.stop();
        return;
    }

    if (globals.ourTurn) {
        replay.exit(); // Close the in-game replay if we preplayed a card in the replay
        globals.lobby.conn.send('action', actionObject.data);
        action.stop();
    } else {
        globals.queuedAction = actionObject;
        let text = 'Cancel Pre-';
        if (globals.queuedAction.data.type === ACT.CLUE) {
            text += 'Clue';
        } else if (globals.queuedAction.data.type === ACT.PLAY) {
            text += 'Play';
        } else if (globals.queuedAction.data.type === ACT.DISCARD) {
            text += 'Discard';
        }
        globals.elements.premoveCancelButton.setText(text);
        globals.elements.premoveCancelButton.show();
        globals.elements.currentPlayerArea.hide();
        globals.layers.UI.batchDraw();
    }
};

export const backToLobby = () => {
    // Hide the tooltip, if showing
    if (globals.activeHover) {
        globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.activeHover = null;
    }

    // Stop any timer-related callbacks
    timer.stop();

    globals.lobby.conn.send('tableUnattend');
    globals.game.hide();
};

export const setPause = () => {
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
        if (globals.spectating) {
            globals.elements.pauseButton.setEnabled(false);
            globals.elements.pauseButton.setOpacity(0.2);
        } else {
            globals.elements.pauseButton.setEnabled(true);
            globals.elements.pauseButton.setOpacity(1);
        }
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
