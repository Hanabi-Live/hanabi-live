/*
    In shared replays, players can enter a hypotheticals where can perform arbitrary actions
    in order to see what will happen
*/

// Imports
import { Action } from './actions';
import { ACTION, CLUE_TYPE, REPLAY_ACTION_TYPE } from '../../constants';
import { getTouchedCardsFromClue } from './clues';
import globals from './globals';
import * as action from './action';
import notify from './notify';
import * as replay from './replay';
import { suitToMsgSuit } from './convert';

export const start = () => {
    if (globals.hypothetical) {
        return;
    }
    globals.hypothetical = true;

    // Bring us to the shared replay turn, if not already there
    if (!globals.useSharedTurns) {
        replay.toggleSharedTurns();
    }

    // Adjust the UI, depending on whether or not we are the replay leader
    globals.elements.replayArea!.visible(false);
    globals.elements.clueTargetButtonGroup!.hide();
    globals.elements.clueTargetButtonGroup2!.show();

    if (globals.amSharedReplayLeader) {
        globals.lobby.conn.send('replayAction', {
            type: REPLAY_ACTION_TYPE.HYPO_START,
        });

        globals.elements.restartButton!.visible(false);
        globals.elements.endHypotheticalButton!.visible(true);
    } else {
        globals.elements.hypoCircle!.visible(true);
    }

    beginTurn();

    globals.layers.get('UI')!.batchDraw();
};

export const end = () => {
    if (!globals.hypothetical) {
        return;
    }
    globals.hypothetical = false;

    // Adjust the UI, depending on whether or not we are the replay leader
    globals.elements.replayArea!.show();
    if (globals.amSharedReplayLeader) {
        globals.lobby.conn.send('replayAction', {
            type: REPLAY_ACTION_TYPE.HYPO_END,
        });

        globals.elements.restartButton!.show();
        globals.elements.endHypotheticalButton!.hide();

        // Furthermore, disable dragging and get rid of the clue UI
        disableDragOnAllHands();
        action.stop();
    } else {
        globals.elements.hypoCircle!.hide();
    }
    globals.layers.get('UI')!.batchDraw();

    globals.hypoActions = [];

    // The "replay.goto()" function will do nothing if we are already at the target turn,
    // so set the current replay turn to the end of the game to force it to draw/compute the
    // game from the beginning
    globals.replayTurn = globals.replayMax;
    replay.goto(globals.sharedReplayTurn, true);
};

export const beginTurn = () => {
    if (!globals.amSharedReplayLeader) {
        return;
    }

    // Enabled or disable the clue target buttons, depending on whose turn it is
    for (const button of globals.elements.clueTargetButtonGroup2!.children.toArray()) {
        button.setEnabled(button.targetIndex !== globals.currentPlayerIndex);
    }

    // Bring up the clue UI
    action.handle();

    disableDragOnAllHands();

    // Set the current player's hand to be draggable
    const hand = globals.elements.playerHands[globals.currentPlayerIndex];
    for (const layoutChild of hand.children.toArray()) {
        layoutChild.draggable(true);
        layoutChild.on('dragend', layoutChild.dragEnd);
    }
};

export const send = (hypoAction: Action) => {
    let type = '';
    if (hypoAction.type === ACTION.CLUE) {
        type = 'clue';
    } else if (hypoAction.type === ACTION.PLAY) {
        type = 'play';
    } else if (hypoAction.type === ACTION.DISCARD) {
        type = 'discard';
    } else if (hypoAction.type === ACTION.DECKPLAY) {
        type = 'play';
    }

    if (type === 'clue') {
        // Clue
        const list = getTouchedCardsFromClue(hypoAction.target, hypoAction.clue!);
        sendHypoAction({
            type,
            clue: hypoAction.clue,
            giver: globals.currentPlayerIndex,
            list,
            target: hypoAction.target,
            turn: globals.turn,
        });
        globals.clues -= 1;

        // Text
        let text = `${globals.playerNames[globals.currentPlayerIndex]} tells `;
        text += `${globals.playerNames[hypoAction.target]} about `;
        const words = [
            'zero',
            'one',
            'two',
            'three',
            'four',
            'five',
        ];
        text += `${words[list.length]} `;

        if (hypoAction.clue!.type === CLUE_TYPE.RANK) {
            text += hypoAction.clue!.value;
        } else if (hypoAction.clue!.type === CLUE_TYPE.COLOR) {
            text += globals.variant.clueColors[hypoAction.clue!.value].name;
        }
        if (list.length !== 1) {
            text += 's';
        }

        sendHypoAction({
            type: 'text',
            text,
        });
    } else if (type === 'play' || type === 'discard') {
        const card = globals.deck[hypoAction.target];

        // Play / Discard
        sendHypoAction({
            type,
            which: {
                index: globals.currentPlayerIndex,
                order: hypoAction.target,
                rank: card.rank,
                suit: suitToMsgSuit(card.suit!, globals.variant),
            },
        });
        if (type === 'play') {
            globals.score += 1;
        }
        if (
            (type === 'play' && card.rank === 5)
            || type === 'discard'
        ) {
            globals.clues += 1;
        }

        // Text
        let text = `${globals.playerNames[globals.currentPlayerIndex]} ${type}s `;
        text += `${card.suit!.name} ${card.rank} from slot #${card.getSlotNum()}`;
        sendHypoAction({
            type: 'text',
            text,
        });

        // Draw
        const nextCardOrder = globals.indexOfLastDrawnCard + 1;
        const nextCard = globals.deckOrder[nextCardOrder];
        if (nextCard) { // All the cards might have already been drawn
            sendHypoAction({
                type: 'draw',
                order: nextCardOrder,
                rank: nextCard.rank,
                suit: nextCard.suit,
                who: globals.currentPlayerIndex,
            });
        }
    }

    // Status
    sendHypoAction({
        type: 'status',
        clues: globals.clues,
        doubleDiscard: false,
        score: globals.score,
        maxScore: globals.maxScore,
    });

    // Turn
    globals.turn += 1;
    globals.currentPlayerIndex += 1;
    if (globals.currentPlayerIndex === globals.playerNames.length) {
        globals.currentPlayerIndex = 0;
    }
    sendHypoAction({
        type: 'turn',
        num: globals.turn,
        who: globals.currentPlayerIndex,
    });
};

export const sendHypoAction = (hypoAction: any) => {
    globals.lobby.conn.send('replayAction', {
        type: REPLAY_ACTION_TYPE.HYPO_ACTION,
        actionJSON: JSON.stringify(hypoAction),
    });
};

const disableDragOnAllHands = () => {
    for (const hand of globals.elements.playerHands) {
        for (const layoutChild of hand.children.toArray()) {
            layoutChild.draggable(false);
            layoutChild.off('dragend');
        }
    }
};

export const sendBackOneTurn = () => {
    if (!globals.amSharedReplayLeader) {
        return;
    }

    globals.lobby.conn.send('replayAction', {
        type: REPLAY_ACTION_TYPE.HYPO_BACK,
    });
};

export const backOneTurn = () => {
    if (globals.hypoActions.length === 0) {
        return;
    }

    // Starting from the end,
    // remove hypothetical actions until we get to the 2nd to last "turn" action
    while (true) {
        globals.hypoActions.pop();
        const lastNotify = globals.hypoActions[globals.hypoActions.length - 1];
        if (lastNotify.type === 'turn') {
            break;
        }
    }

    // Reset to the turn where the hypothetical started
    globals.replayTurn = globals.replayMax;
    replay.goto(globals.sharedReplayTurn, true);

    // Replay all of the hypothetical actions
    for (const actionMessage of globals.hypoActions) {
        notify(actionMessage);
    }
};
