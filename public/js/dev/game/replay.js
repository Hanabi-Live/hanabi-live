/*
    Functions relating to in-game replay, normal replays (after the game is over), and shared replays
*/

const globals = require('../globals');
const actions = require('./actions');

const goto = (target, fast) => {
    // Validate the input
    if (target < 0) {
        target = 0;
    }
    if (target > globals.ui.replayMax) {
        target = globals.ui.replayMax;
    }

    if (globals.ui.replayTurn === target) {
        // We are already there, so there is nothing to do
        return;
    }

    let rewind = false;
    if (target < globals.ui.replayTurn) {
        rewind = true;
    }

    // Set the turn
    globals.ui.replayTurn = target;

    if (
        globals.init.sharedReplay &&
        globals.ui.sharedReplayLeader === globals.username &&
        globals.ui.useSharedTurns
    ) {
        shareCurrentTurn(target);
    }

    positionReplayShuttles();

    if (fast) {
        globals.ui.animateFast = true;
    }

    if (rewind) {
        // TODO
        // this.reset();
        // globals.ui.replayPos = 0;
    }

    // TODO GROSS CODE HERE
    /*
    let msg;
    while (true) { // eslint-disable-line no-constant-condition
        msg = this.replayLog[this.replayPos];
        this.replayPos += 1;

        if (!msg) {
            break;
        }

        if (msg.type === 'message') {
            this.setMessage(msg.resp);
        } else if (msg.type === 'notify') {
            this.handleNotify(msg.resp);
        }

        if (msg.type === 'notify' && msg.resp.type === 'turn') {
            if (msg.resp.num === this.replayTurn) {
                break;
            }
        }
    }
    */

    globals.ui.animateFast = false;
    /*
    msgLogGroup.refreshText();
    messagePrompt.refreshText();
    cardLayer.draw();
    UILayer.draw();
    */
};
exports.goto = goto;

function positionReplayShuttles() {
    positionReplayShuttle(globals.ui.objects.replayShuttle, globals.ui.replayTurn);
    positionReplayShuttle(globals.ui.objects.replayShuttleShared, globals.ui.sharedReplayTurn);
}

function positionReplayShuttle(shuttle, turn) {
    const width = globals.ui.objects.replayBar.width - globals.ui.objects.replayShuttle.width;
    shuttle.x = turn * width / globals.ui.replayMax;
}

/*
    Button handlers
*/

exports.enter = () => {
    globals.ui.replayActivated = true;
    globals.ui.replayTurn = globals.ui.replayMax;
    positionReplayShuttles();
    actions.hide(true);
    globals.ui.objects.replayArea.visible = true;
    // TODO CHANGE TURN AND DRAW
};

// This exits the in-game replay,
// bringing them back to the present moment in the running game
exports.exit = () => {
    goto(this.replayMax, true);
    globals.ui.replayActivated = false;
    globals.ui.objects.replayArea.visible = false;

    // TODO
    /*
    if (globals.ui.lastAction !== null) {
        this.handleAction(globals.ui.lastAction);
    }
    for (let i = 0; i < this.deck.length; i++) {
        this.deck[i].setBareImage();
    }
    UILayer.draw();
    cardLayer.draw();
    */
};

// Rewind one turn (the second left-most button)
const rewind = () => {
    checkDisableSharedTurns();
    goto(globals.ui.replayTurn - 1, true);
};
exports.rewind = rewind;

// Rewind one round (number of players * turns)
// (there is currently no button for this, only a keyboard shortcut)
exports.rewindRound = () => {
    checkDisableSharedTurns();
    goto(globals.ui.replayTurn - globals.init.names.length, true);
};

// Rewind to the beginning (the left-most button)
const rewindBeginning = () => {
    goto(0, true);
    checkDisableSharedTurns();
};
exports.rewindBeginning = rewindBeginning;

// Go forward one turn (the second right-most button)
const forward = () => {
    checkDisableSharedTurns();
    goto(globals.ui.replayTurn + 1, false);
};
exports.forward = forward;

// Go forward one round (number of players * turns)
// (there is currently no button for this, only a keyboard shortcut)
exports.forwardRound = () => {
    checkDisableSharedTurns();
    goto(globals.ui.replayTurn + globals.init.names.length, false);
};

// Go forward to the end (the right-most button)
const forwardEnd = () => {
    checkDisableSharedTurns();
    goto(globals.ui.replayMax, true);
};
exports.forwardEnd = forwardEnd;

/*
    Shared replay functions
*/

// In a shared replay, using the navigation buttons as a follower pauses the shared turns
const checkDisableSharedTurns = () => {
    if (
        globals.init.sharedReplay &&
        globals.ui.sharedReplayLeader !== globals.username &&
        globals.ui.useSharedTurns
    ) {
        // Replay actions currently enabled, so disable them
        toggleSharedTurns();
    }
};
exports.checkDisableSharedTurns = checkDisableSharedTurns;

const toggleSharedTurns = () => {
    globals.ui.useSharedTurns = !globals.ui.useSharedTurns;

    globals.ui.objects.replayShuttleShared.visible = !globals.ui.useSharedTurns;
    if (globals.ui.useSharedTurns) {
        if (globals.ui.sharedReplayLeader === globals.username) {
            shareCurrentTurn(globals.ui.replayTurn);
        } else {
            goto(globals.ui.sharedReplayTurn, true);
        }
    }
};
exports.toggleSharedTurns = toggleSharedTurns;

const shareCurrentTurn = (target) => {
    if (globals.sharedReplayTurn === target) {
        return;
    }

    globals.conn.send('replayAction', {
        type: 0, // Type 0 is a new replay turn
        value: target,
    });
    globals.ui.sharedReplayTurn = target;
    positionReplayShuttles();
};
