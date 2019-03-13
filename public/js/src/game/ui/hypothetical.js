/*
    In shared replays, players can enter a hypotheticals where can perform arbitrary actions
    in order to see what will happen
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');

exports.toggle = () => {
    globals.hypothetical = !globals.hypothetical;
    console.log('Toggling hypothetical:', globals.hypothetical);

    if (globals.amSharedReplayLeader) {
        setAllCardsDraggable();
        let type;
        if (globals.hypothetical) {
            type = constants.REPLAY_ACTION_TYPE.HYPO_START;
        } else {
            type = constants.REPLAY_ACTION_TYPE.HYPO_END;
            globals.hypoActions = [];
        }
        globals.lobby.conn.send('replayAction', {
            type,
        });
    } else {
        globals.elements.hypoCircle.setVisible(globals.hypothetical);
        globals.layers.UI.batchDraw();
    }
};

const setAllCardsDraggable = () => {
    for (const hand of globals.elements.playerHands) {
        for (const layoutChild of hand.children) {
            layoutChild.checkSetDraggable();
        }
    }
};
