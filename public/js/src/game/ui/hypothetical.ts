// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen

// Imports
import {
  ACTION,
  CLUE_TYPE,
  REPLAY_ACTION_TYPE,
  MAX_CLUE_NUM,
} from '../../constants';
import * as action from './action';
import { Action } from './actions';
import { getTouchedCardsFromClue } from './clues';
import { suitToMsgSuit } from './convert';
import fadeCheck from './fadeCheck';
import globals from './globals';
import HanabiCard from './HanabiCard';
import LayoutChild from './LayoutChild';
import notify from './notify';
import PlayerButton from './PlayerButton';
import * as replay from './replay';

export const start = () => {
  if (globals.hypothetical) {
    return;
  }
  globals.hypothetical = true;

  if (globals.amSharedReplayLeader) {
    globals.lobby.conn!.send('replayAction', {
      tableID: globals.lobby.tableID,
      type: REPLAY_ACTION_TYPE.HYPO_START,
    });
  }

  // Bring us to the current shared replay turn, if we are not already there
  if (!globals.useSharedTurns) {
    replay.toggleSharedTurns();
  }

  show();
  beginTurn();
};

// Transition the screen to show all of the hypothetical buttons and elements
export const show = () => {
  globals.elements.replayArea!.visible(false);

  // Modify the clue UI
  if (globals.playerNames.length !== 2) {
    globals.elements.clueTargetButtonGroup!.hide();
    globals.elements.clueTargetButtonGroup2!.show();
  }

  if (globals.amSharedReplayLeader) {
    globals.elements.restartButton!.visible(false);
    globals.elements.endHypotheticalButton!.visible(true);
    globals.elements.hypoBackButton!.visible(globals.hypoActions.length > 0);
  } else {
    globals.elements.hypoCircle!.visible(true);
  }

  globals.layers.UI.batchDraw();
};

export const playThroughPastActions = () => {
  // If we are joining a hypothetical that is already in progress
  // or we are going backwards in an existing hypothetical,
  // play all of the existing hypothetical actions that have taken place so far, if any
  if (globals.hypoActions.length > 0) {
    // This is a mini-version of what happens in the "replay.goto()" function
    globals.animateFast = true;
    for (const actionMessage of globals.hypoActions) {
      notify(actionMessage);
    }
    fadeCheck();
    globals.animateFast = false;
    globals.elements.actionLog!.refreshText();
    globals.elements.fullActionLog!.refreshText();
    globals.layers.card.batchDraw();
    globals.layers.UI.batchDraw();
    globals.layers.arrow.batchDraw();
    globals.layers.UI2.batchDraw();
  }

  beginTurn();
};

export const end = () => {
  if (!globals.hypothetical) {
    return;
  }
  globals.hypothetical = false;

  // Adjust the UI, depending on whether or not we are the replay leader
  globals.elements.replayArea!.show();
  if (globals.amSharedReplayLeader) {
    globals.lobby.conn!.send('replayAction', {
      tableID: globals.lobby.tableID,
      type: REPLAY_ACTION_TYPE.HYPO_END,
    });

    globals.elements.restartButton!.show();
    globals.elements.endHypotheticalButton!.hide();
    globals.elements.hypoBackButton!.hide();

    // Furthermore, disable dragging and get rid of the clue UI
    disableDragOnAllHands();
    action.stop();
  } else {
    globals.elements.hypoCircle!.hide();
  }
  globals.layers.UI.batchDraw();

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

  // Enable or disable the individual clue target buttons, depending on whose turn it is
  const buttonGroup = globals.elements.clueTargetButtonGroup2!;
  const buttons = buttonGroup.children.toArray() as PlayerButton[];
  for (const button of buttons) {
    button.setPressed(false);
    const enabled = button.targetIndex !== globals.currentPlayerIndex;
    button.setEnabled(enabled);

    // In 2-player games,
    // default the clue recipient button to the only other player available
    if (globals.playerNames.length === 2 && enabled) {
      button.setPressed(true);
    }
  }

  action.handle(); // Bring up the clue UI
  globals.elements.hypoBackButton!.visible(globals.hypoActions.length > 0);

  // Set the current player's hand to be draggable
  disableDragOnAllHands();
  const hand = globals.elements.playerHands[globals.currentPlayerIndex];
  for (const layoutChild of hand.children.toArray() as LayoutChild[]) {
    layoutChild.checkSetDraggable();
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
    const words = ['zero', 'one', 'two', 'three', 'four', 'five'];
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

    cycleHand();
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
      (type === 'play' && card.rank === 5 && globals.clues < MAX_CLUE_NUM)
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
  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
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

  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: REPLAY_ACTION_TYPE.HYPO_BACK,
  });
};

export const backOneTurn = () => {
  if (globals.hypoActions.length === 0) {
    return;
  }

  // Starting from the end, remove hypothetical actions until we get to
  // the 2nd to last "turn" action or get to the very beginning of the hypothetical
  while (true) {
    globals.hypoActions.pop();
    if (globals.hypoActions.length === 0) {
      break;
    }
    const lastNotify = globals.hypoActions[globals.hypoActions.length - 1];
    if (lastNotify.type === 'turn') {
      break;
    }
  }
  globals.elements.hypoBackButton!.visible((
    globals.amSharedReplayLeader
        && globals.hypoActions.length > 0
  ));

  // Reset to the turn where the hypothetical started
  globals.replayTurn = globals.replayMax;
  replay.goto(globals.sharedReplayTurn, true);

  // Replay all of the hypothetical actions
  playThroughPastActions();
};

const cycleHand = () => {
  if (!globals.cardCycle) {
    return;
  }

  // Find the chop card
  const hand = globals.elements.playerHands[globals.currentPlayerIndex];
  const chopIndex = hand.getChopIndex();

  // We don't need to reorder anything if the chop is slot 1 (the left-most card)
  const layoutChilds: HanabiCard[] = hand.children.toArray();
  if (chopIndex === layoutChilds.length - 1) {
    return;
  }

  // Make a list of the card orders
  const cardOrders: number[] = [];
  for (const layoutChild of layoutChilds) {
    const card = layoutChild.children[0] as unknown as HanabiCard;
    cardOrders.push(card.order);
  }

  // Remove the chop card
  const chopCard = layoutChilds[chopIndex].children[0] as unknown as HanabiCard;
  const chopCardOrder = chopCard.order;
  cardOrders.splice(chopIndex, 1);

  // Add it to the end (the left-most position)
  cardOrders.push(chopCardOrder);

  sendHypoAction({
    type: 'reorder',
    target: globals.currentPlayerIndex,
    handOrder: cardOrders,
  });
};
