/*
    Functions for progressing forward and backward through time
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const timer = require('./timer');

/*
    Main replay functions
*/

const enter = () => {
    if (globals.inReplay) {
        return;
    }

    globals.inReplay = true;
    globals.replayPos = globals.replayLog.length;
    globals.replayTurn = globals.replayMax;
    adjustShuttles();
    globals.lobby.ui.stopAction();
    globals.elements.replayArea.show();
    for (let i = 0; i < globals.deck.length; i++) {
        globals.deck[i].setBareImage();
    }
    globals.layers.UI.batchDraw();
    globals.layers.card.batchDraw();
};
exports.enter = enter;

const exit = () => {
    if (!globals.inReplay) {
        return;
    }

    goto(globals.replayMax, true);
    globals.inReplay = false;
    globals.elements.replayArea.hide();

    if (globals.savedAction) {
        globals.lobby.ui.handleAction(globals.savedAction);
    }
    for (let i = 0; i < globals.deck.length; i++) {
        globals.deck[i].setBareImage();
    }
    globals.layers.UI.batchDraw();
    globals.layers.card.batchDraw();
};
exports.exit = exit;

const goto = (target, fast) => {
    let rewind = false;

    if (target < 0) {
        target = 0;
    }
    if (target > globals.replayMax) {
        target = globals.replayMax;
    }

    if (target < globals.replayTurn) {
        rewind = true;
        globals.cardsGotten = 0;
        globals.cluesSpentPlusStrikes = 0;
    }

    if (globals.replayTurn === target) {
        return; // We are already there, nothing to do
    }

    if (
        globals.sharedReplay
        && globals.sharedReplayLeader === globals.lobby.username
        && globals.useSharedTurns
    ) {
        shareCurrentTurn(target);
    }

    globals.replayTurn = target;

    adjustShuttles();
    if (fast) {
        globals.animateFast = true;
    }

    if (rewind) {
        reset();
        globals.replayPos = 0;
    }

    // Iterate over the replay and stop at the current turn or at the end, whichever comes first
    while (true) {
        const msg = globals.replayLog[globals.replayPos];
        globals.replayPos += 1;

        // Stop at the end of the replay
        if (!msg) {
            break;
        }

        // Rebuild all notifies; this will correctly position cards and text
        globals.lobby.ui.handleNotify(msg);

        // Stop if you're at the current turn
        if (msg.type === 'turn' && msg.num === globals.replayTurn) {
            break;
        }
    }

    globals.animateFast = false;
    globals.elements.msgLogGroup.refreshText();
    globals.elements.messagePrompt.refreshText();
    globals.layers.card.batchDraw();
    globals.layers.UI.batchDraw();
};
exports.goto = goto;

const reset = function reset() {
    globals.elements.messagePrompt.setMultiText('');
    globals.elements.msgLogGroup.reset();

    const { suits } = globals.variant;

    for (const suit of suits) {
        globals.elements.playStacks.get(suit).removeChildren();
        globals.elements.discardStacks.get(suit).removeChildren();
    }

    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.playerHands[i].removeChildren();
    }

    globals.deck = [];
    globals.postAnimationLayout = null;

    globals.elements.clueLog.clear();
    globals.elements.messagePrompt.reset();

    // This should always be overridden before it gets displayed
    globals.elements.drawDeck.setCount(0);

    for (let i = 0; i < globals.elements.strikes.length; i++) {
        globals.elements.strikes[i].remove();
    }
    globals.elements.strikes = [];

    globals.animateFast = true;
};

/*
    The 4 replay button functions
*/

exports.backFull = () => {
    checkDisableSharedTurns();
    goto(0, true);
};

exports.back = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - 1, true);
};

exports.forward = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + 1);
};

exports.forwardFull = () => {
    checkDisableSharedTurns();
    goto(globals.replayMax, true);
};

/*
    Extra replay functions
*/

exports.backRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - globals.playerNames.length, true);
};

exports.forwardRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + globals.playerNames.length);
};


/*
    The "Exit Replay" button
*/

exports.exitButton = () => {
    if (globals.replay) {
        globals.lobby.conn.send('gameUnattend');

        timer.stop();
        globals.game.hide();
    } else {
        // Mark the time that the user clicked the "Exit Replay" button
        // (so that we can avoid an accidental "Give Clue" double-click)
        globals.accidentalClueTimer = Date.now();

        exit();
    }
};

/*
    The replay shuttle
*/

exports.barClick = function barClick(event) {
    const rectX = event.evt.x - this.getAbsolutePosition().x;
    const w = this.getWidth();
    const step = w / globals.replayMax;
    const newTurn = Math.floor((rectX + step / 2) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
};

exports.barDrag = function barDrag(pos) {
    const min = this.getParent().getAbsolutePosition().x;
    const w = this.getParent().getWidth() - this.getWidth();
    let shuttleX = pos.x - min;
    const shuttleY = this.getAbsolutePosition().y;
    if (shuttleX < 0) {
        shuttleX = 0;
    }
    if (shuttleX > w) {
        shuttleX = w;
    }
    const step = w / globals.replayMax;
    const newTurn = Math.floor((shuttleX + step / 2) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
    shuttleX = newTurn * step;
    return {
        x: min + shuttleX,
        y: shuttleY,
    };
};

const positionReplayShuttle = (shuttle, turn) => {
    const w = shuttle.getParent().getWidth() - shuttle.getWidth();
    shuttle.setX(turn * w / globals.replayMax);
};

const adjustShuttles = () => {
    positionReplayShuttle(globals.elements.replayShuttle, globals.replayTurn);
    positionReplayShuttle(globals.elements.replayShuttleShared, globals.sharedReplayTurn);
};
exports.adjustShuttles = adjustShuttles;

/*
    Right-clicking the deck
*/

exports.promptTurn = (event) => {
    // Do nothing if this is not a right-click
    if (event.evt.which !== 3) {
        return;
    }

    let turn = window.prompt('Which turn do you want to go to?');
    if (Number.isNaN(turn)) {
        return;
    }
    turn -= 1;
    // We need to decrement the turn because
    // the turn shown to the user is always one greater than the real turn

    if (globals.replay) {
        checkDisableSharedTurns();
    } else {
        enter(true);
    }
    goto(turn, true);
};

/*
    The "Toggle Shared Turns" button
*/

exports.toggleSharedTurns = () => {
    globals.useSharedTurns = !globals.useSharedTurns;
    globals.elements.replayShuttleShared.setVisible(!globals.useSharedTurns);
    if (globals.useSharedTurns) {
        if (globals.sharedReplayLeader === globals.lobby.username) {
            shareCurrentTurn(globals.replayTurn);
        } else {
            goto(globals.sharedReplayTurn);
        }
    }
};

// Navigating as a follower in a shared replay disables replay actions
const checkDisableSharedTurns = () => {
    if (
        globals.replay
        && globals.sharedReplay
        && globals.sharedReplayLeader !== globals.lobby.username
        && globals.useSharedTurns
    ) {
        // Replay actions currently enabled, so disable them
        globals.elements.toggleSharedTurnButton.dispatchEvent(new MouseEvent('click'));
    }
};
exports.checkDisableSharedTurns = checkDisableSharedTurns;

const shareCurrentTurn = (target) => {
    if (globals.sharedReplayTurn === target) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.TURN,
        turn: target,
    });
    globals.sharedReplayTurn = target;
    adjustShuttles();
};
