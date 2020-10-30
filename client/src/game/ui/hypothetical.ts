// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen

import { playStacksRules } from "../rules";
import { ActionIncludingHypothetical } from "../types/actions";
import ActionType from "../types/ActionType";
import ClientAction from "../types/ClientAction";
import ClueType from "../types/ClueType";
import MsgClue from "../types/MsgClue";
import ReplayActionType from "../types/ReplayActionType";
import { getTouchedCardsFromClue } from "./clues";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";

export function start(): void {
  if (
    globals.state.replay.shared === null ||
    globals.state.replay.hypothetical !== null
  ) {
    return;
  }

  if (globals.state.replay.shared.amLeader) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoStart,
    });
  }

  globals.elements.toggleRevealedButton!.setEnabled(true);

  globals.store!.dispatch({
    type: "hypoStart",
    drawnCardsShown: false,
    actions: [],
  });
}

export function end(): void {
  if (
    globals.state.replay.shared === null ||
    globals.state.replay.hypothetical === null
  ) {
    return;
  }

  if (globals.state.replay.shared.amLeader) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoEnd,
    });
  }

  globals.store!.dispatch({
    type: "hypoEnd",
  });
}

export function send(hypoAction: ClientAction): void {
  const gameState = globals.state.replay.hypothetical!.ongoing;

  let type;
  switch (hypoAction.type) {
    case ActionType.Play: {
      type = "play";
      break;
    }

    case ActionType.Discard: {
      type = "discard";
      break;
    }

    case ActionType.ColorClue:
    case ActionType.RankClue: {
      type = "clue";
      break;
    }

    default: {
      throw new Error(`Unknown hypothetical action of ${hypoAction.type}.`);
    }
  }

  switch (type) {
    case "play":
    case "discard": {
      const card = getCardOrStackBase(hypoAction.target);
      if (card.visibleSuitIndex === null) {
        throw new Error(`Card ${hypoAction.target} has an unknown suit index.`);
      }
      if (card.visibleRank === null) {
        throw new Error(`Card ${hypoAction.target} has an unknown rank.`);
      }

      // Find out if this card misplays
      let failed = false;
      let newType = type;
      if (type === "play") {
        const nextRanks = playStacksRules.nextRanks(
          gameState.playStacks[card.visibleSuitIndex],
          gameState.playStackDirections[card.visibleSuitIndex],
          gameState.deck,
        );
        if (!nextRanks.includes(card.visibleRank)) {
          newType = "discard";
          failed = true;
        }
      }

      // Play / Discard
      sendHypoAction({
        type: newType,
        playerIndex: gameState.turn.currentPlayerIndex!,
        order: hypoAction.target,
        suitIndex: card.visibleSuitIndex,
        rank: card.visibleRank,
        failed,
      });

      if (failed) {
        sendHypoAction({
          type: "strike",
          num: gameState.strikes.length + 1,
          turn: gameState.turn.segment!,
          order: hypoAction.target,
        });
      }

      // Draw
      const nextCardOrder = gameState.deck.length;
      const nextCard = globals.state.cardIdentities[nextCardOrder];
      if (nextCard !== undefined) {
        // All the cards might have already been drawn
        if (nextCard.suitIndex === null || nextCard.rank === null) {
          throw new Error("Failed to find the suit or rank of the next card.");
        }
        sendHypoAction({
          type: "draw",
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

    case "clue": {
      if (hypoAction.value === undefined) {
        throw new Error(
          "The hypothetical action was a clue but it did not include a value.",
        );
      }

      const clue: MsgClue = {
        type:
          hypoAction.type === ActionType.ColorClue
            ? ClueType.Color
            : ClueType.Rank,
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
  // Even though this action is unnecessary from the point of the client, for now we MUST send it to
  // the server so that it can correctly shave off the last action during a "hypoBack"
  let nextPlayerIndex = gameState.turn.currentPlayerIndex! + 1;
  if (nextPlayerIndex === globals.options.numPlayers) {
    nextPlayerIndex = 0;
  }
  sendHypoAction({
    type: "turn",
    num: gameState.turn.turnNum + 1,
    currentPlayerIndex: nextPlayerIndex,
  });
}

export function sendHypoAction(hypoAction: ActionIncludingHypothetical): void {
  globals.lobby.conn!.send("replayAction", {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoAction,
    actionJSON: JSON.stringify(hypoAction),
  });
}

export function sendBack(): void {
  if (
    globals.state.replay.hypothetical === null ||
    globals.state.replay.hypothetical.states.length <= 1 ||
    globals.state.replay.shared === null ||
    !globals.state.replay.shared.amLeader
  ) {
    return;
  }

  globals.lobby.conn!.send("replayAction", {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoBack,
  });
}

export function toggleRevealed(): void {
  globals.lobby.conn!.send("replayAction", {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.HypoToggleRevealed,
  });
}

// Check if we need to disable the toggleRevealedButton
// This happens when a newly drawn card is played, discarded, or clued
export function checkToggleRevealedButton(
  actionMessage: ActionIncludingHypothetical,
): void {
  if (globals.state.replay.hypothetical === null) {
    return;
  }

  switch (actionMessage.type) {
    case "play":
    case "discard": {
      const cardOrder = actionMessage.order;
      if (
        globals.state.replay.hypothetical.drawnCardsInHypothetical.includes(
          cardOrder,
        )
      ) {
        globals.elements.toggleRevealedButton?.setEnabled(false);
      }

      break;
    }

    case "clue": {
      for (const cardOrder of actionMessage.list) {
        if (
          globals.state.replay.hypothetical.drawnCardsInHypothetical.includes(
            cardOrder,
          )
        ) {
          globals.elements.toggleRevealedButton?.setEnabled(false);
          return;
        }
      }

      break;
    }

    default: {
      break;
    }
  }
}
