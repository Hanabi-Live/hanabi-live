// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen

import { ActionIncludingHypothetical } from '../types/actions';
import ActionType from '../types/ActionType';
import ClientAction from '../types/ClientAction';
import ClueType from '../types/ClueType';
import MsgClue from '../types/MsgClue';
import ReplayActionType from '../types/ReplayActionType';
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
  const state = globals.store!.getState();
  if (!state.replay.useSharedSegments) {
    globals.store!.dispatch({
      type: 'replayUseSharedSegments',
      useSharedSegments: true,
    });
  }

  globals.elements.toggleRevealedButton!.setEnabled(true);

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
  globals.elements.hypoBackButton!.visible((
    globals.amSharedReplayLeader
    && globals.hypoActions.length > 0
  ));
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

// TODO: move this function to a view
export const end = () => {
  if (!globals.hypothetical) {
    return;
  }
  globals.hypothetical = false;
  globals.hypoActions = [];
  globals.hypoFirstDrawnIndex = 0;

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
    const currentPlayerIndex = globals.store!.getState().visibleState!.turn.currentPlayerIndex;
    const enabled = button.targetIndex !== currentPlayerIndex;
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
  const gameState = state.replay.hypothetical!.ongoing;

  let type;
  switch (hypoAction.type) {
    case ActionType.Play: {
      type = 'play';
      break;
    }

    case ActionType.Discard: {
      type = 'discard';
      break;
    }

    case ActionType.ColorClue:
    case ActionType.RankClue: {
      type = 'clue';
      break;
    }

    default: {
      throw new Error(`Unknown hypothetical action of ${hypoAction.type}.`);
    }
  }

  switch (type) {
    case 'play':
    case 'discard': {
      const card = state.cardIdentities[hypoAction.target];

      if (card.suitIndex === null) {
        throw new Error(`Card ${hypoAction.target} has an unknown suit index.`);
      }
      if (card.rank === null) {
        throw new Error(`Card ${hypoAction.target} has an unknown rank.`);
      }

      // Play / Discard
      sendHypoAction({
        type,
        playerIndex: gameState.turn.currentPlayerIndex!,
        order: hypoAction.target,
        suitIndex: card.suitIndex,
        rank: card.rank,
        failed: false, // TODO: misplays
      });

      // Draw
      const nextCardOrder = gameState.deck.length;
      const nextCard = state.cardIdentities[nextCardOrder];
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
      break;
    }

    case 'clue': {
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

      break;
    }

    default: {
      throw new Error(`Unknown hypothetical type of ${type}.`);
    }
  }

  // Finally, send a turn action
  // Even though this action is unnecessary from the point of the reducers,
  // for now we MUST send it so that the "hypoAction" command handler knows when to begin a turn
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

export const sendBack = () => {
  if (!globals.amSharedReplayLeader) {
    return;
  }

  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoBack,
  });
};

export const back = () => {
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
  replay.goToSegment(finalSegment, false, true);
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
