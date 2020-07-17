// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen

import { ActionIncludingHypothetical } from '../types/actions';
import ActionType from '../types/ActionType';
import ClientAction from '../types/ClientAction';
import ClueType from '../types/ClueType';
import MsgClue from '../types/MsgClue';
import ReplayActionType from '../types/ReplayActionType';
import action from './action';
import { getTouchedCardsFromClue } from './clues';
import PlayerButton from './controls/PlayerButton';
import globals from './globals';
import * as replay from './replay';
import * as turn from './turn';

export const start = () => {
  if (globals.hypothetical) {
    return;
  }
  globals.hypothetical = true;

  if (globals.amSharedReplayLeader) {
    globals.lobby.conn!.send('replayAction', {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoStart,
    });
  }

  // Bring us to the current shared replay turn, if we are not already there
  if (!globals.useSharedTurns) {
    replay.toggleSharedTurns();
  }

  globals.elements.toggleRevealedButton?.setEnabled(true);

  show();
};

// Transition the screen to show all of the hypothetical buttons and elements
export const show = () => {
  globals.elements.replayArea!.hide();

  // Modify the clue UI
  if (globals.playerNames.length !== 2) {
    globals.elements.clueTargetButtonGroup!.hide();
    globals.elements.clueTargetButtonGroup2!.show();
  }

  // Make sure to toggle all of the elements
  // in case the leader changes in the middle of a hypothetical
  globals.elements.restartButton!.hide();

  // These elements are visible only for the leader
  globals.elements.endHypotheticalButton!.visible(globals.amSharedReplayLeader);
  globals.elements.hypoBackButton!.visible(globals.amSharedReplayLeader && globals.hypoActions.length > 0); // eslint-disable-line max-len
  globals.elements.toggleRevealedButton!.visible(globals.amSharedReplayLeader);
  globals.elements.clueArea!.visible(globals.amSharedReplayLeader);

  // This element is visible only for the other spectators
  globals.elements.hypoCircle!.visible(!globals.amSharedReplayLeader);

  if (!globals.amSharedReplayLeader) {
    checkSetDraggableAllHands();
  }

  globals.layers.UI.batchDraw();

  beginTurn();
};

export const playThroughPastActions = () => {
  // If we are joining a hypothetical that is already in progress
  // or we are going backwards in an existing hypothetical,
  // play all of the existing hypothetical actions that have taken place so far, if any
  globals.elements.toggleRevealedButton?.setEnabled(true);
  if (globals.hypoActions.length > 0) {
    // This is a mini-version of what happens in the "replay.goto()" function
    globals.animateFast = true;
    for (const actionMessage of globals.hypoActions) {
      setHypoFirstDrawnIndex(actionMessage);
      checkToggleRevealedButton(actionMessage);
      action(actionMessage);
    }
    globals.animateFast = false;
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
      type: ReplayActionType.HypoEnd,
    });

    globals.elements.restartButton!.show();
    globals.elements.endHypotheticalButton!.hide();
    globals.elements.hypoBackButton!.hide();
    globals.elements.toggleRevealedButton!.hide();

    // Furthermore, disable dragging and get rid of the clue UI
    checkSetDraggableAllHands();
    turn.hideClueUIAndDisableDragging();
  } else {
    globals.elements.hypoCircle!.hide();
  }
  globals.layers.UI.batchDraw();

  globals.hypoActions = [];

  globals.hypoFirstDrawnIndex = 0;

  // The "replay.goto()" function will do nothing if we are already at the target turn,
  // so set the current replay turn to the end of the game to force it to draw/compute the
  // game from the beginning
  const finalSegment = globals.store!.getState().ongoingGame.turn.segment!;
  globals.replayTurn = finalSegment;
  replay.goto(globals.sharedReplayTurn, true, true);
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

  turn.showClueUI();
  globals.elements.hypoBackButton!.visible(globals.hypoActions.length > 0);

  // Set the current player's hand to be draggable
  checkSetDraggableAllHands();
};

export const send = (hypoAction: ClientAction) => {
  const state = globals.store!.getState();
  const cardIdentities = state.cardIdentities;
  const gameState = state.replay.hypothetical!.ongoing;

  let type = '';
  if (hypoAction.type === ActionType.Play) {
    type = 'play';
  } else if (hypoAction.type === ActionType.Discard) {
    type = 'discard';
  } else if (
    hypoAction.type === ActionType.ColorClue
    || hypoAction.type === ActionType.RankClue
  ) {
    type = 'clue';
  }

  if (type === 'clue') {
    // Clue
    if (hypoAction.value === undefined) {
      throw new Error('The hypothetical action was a clue but it did not include a value.');
    }

    const clue: MsgClue = {
      type: hypoAction.type === ActionType.ColorClue ? ClueType.Color : ClueType.Rank,
      value: hypoAction.value,
    };

    const list = getTouchedCardsFromClue(hypoAction.target, clue);
    sendHypoAction({
      type,
      clue,
      giver: gameState.turn.currentPlayerIndex!,
      list,
      target: hypoAction.target,
      turn: gameState.turn.turnNum,
    });
  } else if (type === 'play' || type === 'discard') {
    const card = globals.deck[hypoAction.target];

    // Play / Discard
    sendHypoAction({
      type,
      playerIndex: gameState.turn.currentPlayerIndex!,
      order: hypoAction.target,
      suitIndex: card.visibleSuitIndex!,
      rank: card.visibleRank!,
      failed: false, // TODO: misplays
    });

    // Draw
    const nextCardOrder = gameState.deck.length;
    const nextCard = cardIdentities[nextCardOrder];
    if (nextCard !== undefined) { // All the cards might have already been drawn
      if (nextCard.suitIndex === null || nextCard.rank === null) {
        throw new Error('Unable to find the suit or rank of the next card.');
      }
      sendHypoAction({
        type: 'draw',
        order: nextCardOrder,
        playerIndex: gameState.turn.currentPlayerIndex!,
        // Always send the correct suitIndex and rank;
        // the blanking of the card will be performed on the client
        suitIndex: nextCard.suitIndex,
        rank: nextCard.rank,
      });
    }
  }

  // Turn
  let nextPlayerIndex = gameState.turn.currentPlayerIndex! + 1;
  if (nextPlayerIndex === state.metadata.options.numPlayers) {
    nextPlayerIndex = 0;
  }
  sendHypoAction({
    type: 'turn',
    num: gameState.turn.turnNum + 1,
    currentPlayerIndex: nextPlayerIndex,
  });
};

export const sendHypoAction = (hypoAction: ActionIncludingHypothetical) => {
  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoAction,
    actionJSON: JSON.stringify(hypoAction),
  });
};

const checkSetDraggableAllHands = () => {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
};

export const sendBackOneTurn = () => {
  if (!globals.amSharedReplayLeader) {
    return;
  }

  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoBack,
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
    const lastAction = globals.hypoActions[globals.hypoActions.length - 1];
    if (lastAction.type === 'turn') {
      break;
    }
  }
  globals.elements.hypoBackButton!.visible((
    globals.amSharedReplayLeader
    && globals.hypoActions.length > 0
  ));

  // Reset to the segment where the hypothetical started
  const finalSegment = globals.store!.getState().ongoingGame.turn.segment!;
  globals.replayTurn = finalSegment;
  replay.goto(globals.sharedReplayTurn, true, true);

  // Replay all of the hypothetical actions
  playThroughPastActions();
};

export const toggleRevealed = () => {
  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoToggleRevealed,
  });
};

// Set hypoFirstDrawnIndex if this is the first card we drew in the hypothetical
// This check should only run if the draw action is a hypoAction
export const setHypoFirstDrawnIndex = (actionMessage: ActionIncludingHypothetical) => {
  if (actionMessage.type === 'draw' && globals.hypothetical && !globals.hypoFirstDrawnIndex) {
    globals.hypoFirstDrawnIndex = actionMessage.order;
  }
};

// Check if we need to disable the toggleRevealedButton
// This happens when a newly drawn card is played, discarded, or clued
// It should also happen for misplays once those are implemented
export const checkToggleRevealedButton = (actionMessage: ActionIncludingHypothetical) => {
  if (actionMessage.type === 'play' || actionMessage.type === 'discard') {
    const cardOrder = actionMessage.order;
    if (globals.hypoFirstDrawnIndex && cardOrder >= globals.hypoFirstDrawnIndex) {
      globals.elements.toggleRevealedButton?.setEnabled(false);
    }
  } else if (actionMessage.type === 'clue') {
    for (const cardOrder of actionMessage.list) {
      if (globals.hypoFirstDrawnIndex && cardOrder >= globals.hypoFirstDrawnIndex) {
        globals.elements.toggleRevealedButton?.setEnabled(false);
        return;
      }
    }
  }
};
