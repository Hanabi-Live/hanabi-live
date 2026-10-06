// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen.

import type {
  HypotheticalActionIntent,
  HypotheticalCardView,
  PlayerIndex,
} from "@hanabi-live/game";
import { eRange } from "complete-common";
import { ActionType } from "../types/ActionType";
import type { ClientAction } from "../types/ClientAction";
import { ReplayActionType } from "../types/ReplayActionType";
import type { ActionIncludingHypothetical } from "../types/actions";
import type { HanabiCard } from "./HanabiCard";
import { setEmpathyOnHand } from "./HanabiCardMouse";
import { globals } from "./UIGlobals";
import { getCardOrStackBase } from "./getCardOrStackBase";
import { planClientHypotheticalAction } from "./planClientHypotheticalAction";

export function startHypothetical(): void {
  if (globals.state.replay.hypothetical !== null) {
    return;
  }

  if (
    globals.state.replay.shared !== null
    && globals.state.replay.shared.amLeader
  ) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoStart,
    });
  }

  globals.elements.toggleDrawnCardsButton!.setEnabled(true);

  globals.store!.dispatch({
    type: "hypoStart",
    showDrawnCards: false,
    actions: [],
  });
}

export function endHypothetical(): void {
  if (globals.state.replay.hypothetical === null) {
    return;
  }

  if (
    globals.state.replay.shared !== null
    && globals.state.replay.shared.amLeader
  ) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoEnd,
    });
  }

  globals.store!.dispatch({
    type: "hypoEnd",
  });
}

export function sendHypotheticalAction(hypoAction: ClientAction): void {
  const gameState = globals.state.replay.hypothetical!.ongoing;
  let intent: HypotheticalActionIntent;
  switch (hypoAction.type) {
    case ActionType.Play: {
      intent = { type: "play", order: hypoAction.target };
      break;
    }

    case ActionType.Discard: {
      intent = { type: "discard", order: hypoAction.target };
      break;
    }

    case ActionType.ColorClue: {
      intent = {
        type: "colorClue",
        target: hypoAction.target,
        value: hypoAction.value,
      };
      break;
    }

    case ActionType.RankClue: {
      intent = {
        type: "rankClue",
        target: hypoAction.target,
        value: hypoAction.value,
      };
      break;
    }
  }

  const cardViews: HypotheticalCardView[] = [];
  if (gameState.turn.currentPlayerIndex !== null) {
    switch (intent.type) {
      case "play":
      case "discard": {
        const card = getCardOrStackBase(intent.order);
        if (card !== undefined) {
          cardViews.push({
            state: card.state,
            isStackBase: card.isStackBase,
            visibleSuitIndex: card.visibleSuitIndex,
            visibleRank: card.visibleRank,
          });
        }
        break;
      }

      case "colorClue":
      case "rankClue": {
        const hand = globals.elements.playerHands[intent.target]!;
        hand.children.each((child) => {
          const card = child.children[0] as HanabiCard | undefined;
          if (card !== undefined) {
            cardViews.push({
              state: card.state,
              isStackBase: card.isStackBase,
              visibleSuitIndex: card.visibleSuitIndex,
              visibleRank: card.visibleRank,
            });
          }
        });
        break;
      }
    }
  }

  const actions = planClientHypotheticalAction(intent, {
    gameState,
    metadata: globals.metadata,
    variant: globals.variant,
    cardIdentities: globals.state.cardIdentities,
    morphedIdentities: globals.state.replay.hypothetical!.morphedIdentities,
    notes: globals.state.notes.ourNotes,
    playing: globals.state.playing,
    cardViews,
  });
  if (actions !== null) {
    for (const action of actions) {
      sendHypotheticalActionToServer(action);
    }
  }
}

export function sendHypotheticalActionToServer(
  hypoAction: ActionIncludingHypothetical,
): void {
  if (globals.state.replay.shared === null) {
    globals.store!.dispatch({
      type: "hypoAction",
      action: hypoAction,
    });
  } else {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoAction,
      actionJSON: JSON.stringify(hypoAction),
    });
  }
}

export function sendHypotheticalBack(): void {
  if (
    globals.state.replay.hypothetical === null
    || globals.state.replay.hypothetical.states.length <= 1
  ) {
    return;
  }

  if (globals.state.replay.shared === null) {
    globals.store!.dispatch({
      type: "hypoBack",
    });
  } else if (globals.state.replay.shared.amLeader) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoBack,
    });
  }
}

export function toggleRevealed(): void {
  if (globals.state.replay.hypothetical === null) {
    return;
  }

  if (globals.state.replay.shared === null) {
    globals.store!.dispatch({
      type: "hypoShowDrawnCards",
      showDrawnCards: !globals.state.replay.hypothetical.showDrawnCards,
    });
  } else if (globals.state.replay.shared.amLeader) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.HypoToggleRevealed,
    });
  }
}

// Check if we need to disable the toggleRevealedButton. This happens when a newly drawn card is
// played, discarded, or clued.
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
        globals.elements.toggleDrawnCardsButton?.setEnabled(false);
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
          globals.elements.toggleDrawnCardsButton?.setEnabled(false);
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

export function changeStartingHandVisibility(): void {
  const startingPlayerIndex =
    globals.state.replay.hypothetical?.startingPlayerIndex;

  if (
    startingPlayerIndex === undefined
    || startingPlayerIndex === null
    || globals.elements.playerHands[startingPlayerIndex] === undefined
  ) {
    // Remove all empathy visibility, no longer in hypo.
    for (const i of eRange(globals.options.numPlayers)) {
      const playerIndex = i as PlayerIndex;
      forceHandEmpathy(playerIndex, false);
    }

    return;
  }

  forceHandEmpathy(
    startingPlayerIndex,
    !globals.state.replay.hypothetical!.showDrawnCards,
  );
}

function forceHandEmpathy(playerIndex: PlayerIndex, force: boolean) {
  const hand = globals.elements.playerHands[playerIndex];
  if (hand === undefined) {
    return;
  }

  for (const i of eRange(hand.children.length)) {
    const layoutChild = hand.children[i];
    if (layoutChild === undefined) {
      continue;
    }

    const card = layoutChild.children[0] as HanabiCard | undefined;
    if (card === undefined) {
      continue;
    }

    setEmpathyOnHand(card, force);
  }
}
