/*
    Functions for progressing forward and backward through time
*/

// Imports
import Konva from 'konva';
import * as action from './action';
import { MAX_CLUE_NUM, REPLAY_ACTION_TYPE } from '../../constants';
import fadeCheck from './fadeCheck';
import globals from './globals';
import notify from './notify';
import Shuttle from './Shuttle';
import * as stats from './stats';
import LayoutChild from './LayoutChild';

/*
    Main replay functions
*/

export const enter = () => {
    if (globals.hypothetical) {
        // Don't allow replay navigation while in a hypothetical
        return;
    }
    if (globals.replayMax === 0) {
        // No actions have been taken yet, so we cannot enter a replay
        return;
    }
    if (globals.inReplay) {
        return;
    }
    globals.inReplay = true;

    // Start by putting us at the end of the replay (the current game state)
    globals.replayPos = globals.replayLog.length;
    globals.replayTurn = globals.replayMax;

    // However, if the game just ended,
    // we want to go to the turn before the miscellaneous data sent at the end of the game
    if (globals.gameOver) {
        globals.replayPos = globals.finalReplayPos;
        globals.replayTurn = globals.finalReplayTurn;
    }

    // Hide the UI elements that overlap with the replay area
    action.stop();

    // Next, show the replay area and initialize some UI elements
    globals.elements.replayArea!.show();
    adjustShuttles(true); // We want it to immediately snap to the end
    setVisibleButtons();
    globals.layers.get('UI')!.batchDraw();
};

export const exit = () => {
    if (!globals.inReplay) {
        return;
    }

    goto(globals.replayMax, true);
    globals.inReplay = false;
    globals.elements.replayArea!.hide();

    if (globals.ourTurn) {
        action.handle();
    }
    globals.elements.currentPlayerArea!.visible(!globals.elements.clueArea!.visible());
    if (globals.queuedAction !== null) {
        globals.elements.currentPlayerArea!.hide();
        globals.elements.premoveCancelButton!.show();
    }

    for (let i = 0; i <= globals.indexOfLastDrawnCard; i++) {
        globals.deck[i].setBareImage();
    }

    globals.layers.get('UI')!.batchDraw();
    globals.layers.get('card')!.batchDraw();
};

export const goto = (target: number, fast: boolean) => {
    // Validate function arguments
    if (target < 0) {
        target = 0;
    }
    if (target > globals.replayMax) {
        target = globals.replayMax;
    }
    if (target === globals.replayTurn) {
        return;
    }

    const rewind = target < globals.replayTurn;

    if (
        globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        shareCurrentTurn(target);
    }

    globals.replayTurn = target;

    setVisibleButtons();
    adjustShuttles(false);
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

        // Re-process all notify messages; this will correctly position cards and text
        notify(msg);

        // Stop if you're at the current turn
        if (msg.type === 'turn' && msg.num === globals.replayTurn) {
            break;
        }
    }

    fadeCheck();
    globals.animateFast = false;
    globals.elements.actionLog!.refreshText();
    globals.elements.fullActionLog!.refreshText();
    globals.layers.get('card')!.batchDraw();
    globals.layers.get('UI')!.batchDraw();
    globals.layers.get('arrow')!.batchDraw();
    globals.layers.get('UI2')!.batchDraw();
};

const setVisibleButtons = () => {
    // If we are on the first turn, disable the rewind replay buttons
    globals.elements.replayBackFullButton!.setEnabled(globals.replayTurn !== 0);
    globals.elements.replayBackButton!.setEnabled(globals.replayTurn !== 0);

    // If we are on the last turn, disable the forward replay buttons
    globals.elements.replayForwardButton!.setEnabled(globals.replayTurn !== globals.replayMax);
    globals.elements.replayForwardFullButton!.setEnabled(globals.replayTurn !== globals.replayMax);
};

const reset = () => {
    // Reset some game state variables
    globals.turn = 0;
    // "globals.currentPlayerIndex" is set in every "turn" command
    globals.deckSize = stats.getTotalCardsInTheDeck(globals.variant);
    // "globals.indexOfLastDrawnCard" is set in every "draw" command
    globals.score = 0;
    globals.maxScore = globals.variant.maxScore;
    globals.clues = MAX_CLUE_NUM;
    globals.cardsGotten = 0;
    globals.cluesSpentPlusStrikes = 0;
    globals.stackDirections = [0, 0, 0, 0, 0];

    // Reset various UI elements
    globals.postAnimationLayout = null;
    globals.elements.actionLog!.reset();
    globals.elements.fullActionLog!.reset();
    globals.elements.deck!.setCount(globals.deckSize);
    globals.elements.clueLog!.clear();

    for (let i = 0; i < globals.elements.playerHands.length; i++) {
        globals.elements.playerHands[i].removeChildren();
    }

    // Remove all of the cards from the play stacks
    for (const [, playStack] of globals.elements.playStacks) {
        playStack.removeChildren();
    }

    // Readd the stack base to the play stacks
    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];
        const playStack = globals.elements.playStacks.get(suit)!;
        const stackBaseLayoutChild = globals.stackBases[i].parent!;
        playStack.addChild(stackBaseLayoutChild as any);
        stackBaseLayoutChild.visible(true);
        // (the stack base might have been hidden if there was a card on top of it)
    }

    // Remove all of the cards from the discard stacks
    for (const [, discardStack] of globals.elements.discardStacks) {
        discardStack.removeChildren();
    }

    for (const strikeX of globals.elements.strikeXs) {
        if (strikeX.tween) {
            strikeX.tween.destroy();
        }
        strikeX.opacity(0);
        strikeX.setFaded();
    }
    for (const card of globals.deck) {
        const child = card.parent as unknown as LayoutChild;
        if (!child) {
            return;
        }
        if (child.tween) {
            child.tween.destroy();
        }
        card.holder = null;
        card.suit = null;
        card.rank = null;
    }
    for (const arrow of globals.elements.arrows) {
        arrow.hide();
    }

    globals.animateFast = true;
};

/*
    The 4 replay button functions
*/

export const backFull = () => {
    checkDisableSharedTurns();
    goto(0, true);
};

export const back = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - 1, true);
};

export const forward = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + 1, false);
};

export const forwardFull = () => {
    checkDisableSharedTurns();
    goto(globals.replayMax, true);
};

/*
    Extra replay functions
*/

export const backRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn - globals.playerNames.length, true);
};

export const forwardRound = () => {
    checkDisableSharedTurns();
    goto(globals.replayTurn + globals.playerNames.length, false);
};

/*
    The "Exit Replay" button
*/

export const exitButton = () => {
    // Mark the time that the user clicked the "Exit Replay" button
    // (so that we can avoid an accidental "Give Clue" double-click)
    globals.UIClickTime = Date.now();

    exit();
};

/*
    The replay shuttle
*/

export function barClick(this: Konva.Rect, event: Konva.KonvaPointerEvent) {
    const rectX = event.evt.x - this.getAbsolutePosition().x;
    const w = this.width();
    const step = w / globals.replayMax;
    const newTurn = Math.floor((rectX + (step / 2)) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
}

export function barDrag(this: Konva.Rect, pos: Konva.Vector2d) {
    const min = globals.elements.replayBar!.getAbsolutePosition().x + (this.width() * 0.5);
    const w = globals.elements.replayBar!.width() - this.width();
    let shuttleX = pos.x - min;
    const shuttleY = this.getAbsolutePosition().y;
    if (shuttleX < 0) {
        shuttleX = 0;
    }
    if (shuttleX > w) {
        shuttleX = w;
    }
    const step = w / globals.replayMax;
    const newTurn = Math.floor((shuttleX + (step / 2)) / step);
    if (newTurn !== globals.replayTurn) {
        checkDisableSharedTurns();
        goto(newTurn, true);
    }
    shuttleX = newTurn * step;
    return {
        x: min + shuttleX,
        y: shuttleY,
    };
}

const positionReplayShuttle = (
    shuttle: Shuttle,
    turn: number,
    smaller: boolean,
    fast: boolean,
) => {
    let max = globals.replayMax;

    // During initialization, the turn will be -1 and the maximum number of replay turns will be 0
    // Account for this and provide sane defaults
    if (turn === -1) {
        turn = 0;
    }
    if (max === 0) {
        max = 1;
    }

    const winH = globals.stage!.height();
    const sliderW = globals.elements.replayBar!.width() - shuttle.width();
    const x = globals.elements.replayBar!.x() + (sliderW / max * turn) + (shuttle.width() / 2);
    let y = globals.elements.replayBar!.y() + (shuttle.height() * 0.55);
    if (smaller) {
        y -= 0.003 * winH;
    }
    const scale = smaller ? 0.7 : 1;
    if (fast) {
        shuttle.x(x);
        shuttle.y(y);
        shuttle.scaleX(scale);
        shuttle.scaleY(scale);
    } else {
        if (shuttle.tween) {
            shuttle.tween.destroy();
        }
        shuttle.tween = new Konva.Tween({
            x,
            y,
            scaleX: scale,
            scaleY: scale,
            node: shuttle,
            duration: 0.25,
            easing: Konva.Easings.EaseOut,
        }).play();
    }
};

export const adjustShuttles = (fast: boolean) => {
    // If the shuttles are overlapping, then make the normal shuttle a little bit smaller
    let smaller = false;
    if (!globals.useSharedTurns && globals.replayTurn === globals.sharedReplayTurn) {
        smaller = true;
    }

    // Adjust the shuttles along the X axis based on the current turn
    // If it is smaller, we need to nudge it to the right a bit in order to center it
    positionReplayShuttle(
        globals.elements.replayShuttleShared!,
        globals.sharedReplayTurn,
        false,
        fast,
    );
    positionReplayShuttle(
        globals.elements.replayShuttle!,
        globals.replayTurn,
        smaller,
        fast,
    );
};

/*
    Right-clicking the turn count
*/

export const promptTurn = () => {
    const turnString = window.prompt('Which turn do you want to go to?');
    if (turnString === null) {
        return;
    }
    let turn = parseInt(turnString, 10);
    if (Number.isNaN(turn)) {
        return;
    }

    // We need to decrement the turn because
    // the turn shown to the user is always one greater than the real turn
    turn -= 1;

    if (globals.replay) {
        checkDisableSharedTurns();
    } else {
        enter();
    }
    goto(turn, true);
};

/*
    The "Toggle Shared Turns" button
*/

export const toggleSharedTurns = () => {
    globals.useSharedTurns = !globals.useSharedTurns;

    globals.elements.pauseSharedTurnsButton!.visible(globals.useSharedTurns);
    globals.elements.useSharedTurnsButton!.visible(!globals.useSharedTurns);
    globals.elements.replayShuttleShared!.visible(!globals.useSharedTurns);

    if (globals.useSharedTurns) {
        if (globals.amSharedReplayLeader) {
            shareCurrentTurn(globals.replayTurn);
        } else {
            goto(globals.sharedReplayTurn, true);
        }
    }

    // We need to adjust the shuttles in the case where
    // the normal shuttle is underneath the shared replay shuttle
    // and we need to make it bigger/smaller
    adjustShuttles(false);
};

// Navigating as a follower in a shared replay disables replay actions
export const checkDisableSharedTurns = () => {
    if (
        globals.replay
        && globals.sharedReplay
        && !globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        // Replay actions are currently enabled, so disable them
        toggleSharedTurns();
    }
};

const shareCurrentTurn = (turn: number) => {
    if (globals.sharedReplayTurn === turn) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: REPLAY_ACTION_TYPE.TURN,
        turn,
    });
    globals.sharedReplayTurn = turn;
    adjustShuttles(false);
};

export const clueLogClickHandler = (turn: number) => {
    if (globals.replay) {
        checkDisableSharedTurns();
    } else {
        enter();
    }
    goto(turn + 1, true);
};
