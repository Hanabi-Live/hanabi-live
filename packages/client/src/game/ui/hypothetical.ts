// In shared replays, players can enter a hypotheticals where can perform arbitrary actions in order
// to see what will happen.

import type {
  HypotheticalActionIntent,
  HypotheticalCardView,
  PlayerIndex,
} from "@hanabi-live/game";
import { getClueCost } from "@hanabi-live/game";
import { eRange } from "complete-common";
import { toWireHypotheticalAction } from "../../wire.ts";
import type { ClientAction } from "../types/ClientAction.ts";
import type { State } from "../types/State.ts";
import type { ActionIncludingHypothetical } from "../types/actions.ts";
import { setEmpathyOnHand } from "./HanabiCardMouse.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";
import { controlsHypothetical } from "./controlsHypothetical.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import { planClientHypotheticalAction } from "./planClientHypotheticalAction.ts";

export function startHypothetical(): void {
  const { hypothetical, shared } = globals.state.replay;
  if (hypothetical !== undefined) {
    return;
  }

  if (shared === undefined) {
    globals.elements.showDrawnCardsCheckbox!.setEnabled(true);
    globals.store!.dispatch({
      type: "hypotheticalStart",
      shared: false,
      showDrawnCards: false,
      actions: [],
    });
  } else if (shared.amLeader) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "hypothetical",
        control: { type: "start" },
      },
    });
    startSharedHypothetical();
  }
}

/** The leader starts the shared hypothetical without waiting for the server. */
export function startSharedHypothetical(): void {
  const { shared } = globals.state.replay;
  if (shared === undefined || shared.hypothetical !== undefined) {
    return;
  }

  globals.elements.showDrawnCardsCheckbox!.setEnabled(true);
  globals.store!.dispatch({
    type: "hypotheticalStart",
    shared: true,
    showDrawnCards: false,
    actions: [],
  });
}

export function endHypothetical(): void {
  const { hypothetical, ownHypothetical, shared } = globals.state.replay;
  if (hypothetical === undefined) {
    return;
  }

  if (ownHypothetical !== undefined) {
    globals.store!.dispatch({
      type: "hypotheticalEnd",
      shared: false,
    });
    return;
  }

  // Wait for the server to end the hypothetical, so that pending actions are processed first.
  if (shared?.amLeader === true) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "hypothetical",
        control: { type: "end" },
      },
    });
  }
}

/** Apply the server's end of the shared hypothetical. */
export function finishHypothetical(): void {
  if (
    globals.state.replay.shared === undefined
    || globals.state.replay.shared.hypothetical === undefined
  ) {
    return;
  }

  globals.store!.dispatch({
    type: "hypotheticalEnd",
    shared: true,
  });
}

export function sendHypotheticalAction(hypoAction: ClientAction): void {
  planAndSendHypotheticalAction(hypoAction);
}

/** Spends a clue to give the turn to the next player, without giving a clue. */
export function sendHypotheticalPassTurn(): void {
  if (!canPassTurnInHypothetical(globals.state)) {
    return;
  }

  planAndSendHypotheticalAction({ type: "passTurn" });
}

/** The leader (or a solo viewer) can pass when a clue could be given. */
export function canPassTurnInHypothetical(state: State): boolean {
  const { hypothetical } = state.replay;
  return (
    hypothetical !== undefined
    && controlsHypothetical(state)
    && hypothetical.ongoing.turn.currentPlayerIndex !== undefined
    && hypothetical.ongoing.clueTokens >= getClueCost(globals.variant)
  );
}

function planAndSendHypotheticalAction(intent: HypotheticalActionIntent) {
  const hypothetical = globals.state.replay.hypothetical!;
  const gameState = hypothetical.ongoing;
  const cardViews: HypotheticalCardView[] = [];
  if (gameState.turn.currentPlayerIndex !== undefined) {
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

      case "clue": {
        const hand = globals.elements.playerHands[intent.receiverIndex]!;
        for (const child of hand.children) {
          const { card } = child as unknown as LayoutChild;
          cardViews.push({
            state: card.state,
            isStackBase: card.isStackBase,
            visibleSuitIndex: card.visibleSuitIndex,
            visibleRank: card.visibleRank,
          });
        }
        break;
      }

      case "passTurn": {
        break;
      }
    }
  }

  const actions = planClientHypotheticalAction(intent, {
    gameState,
    metadata: globals.metadata,
    variant: globals.variant,
    cardIdentities: globals.state.cardIdentities,
    morphedIdentities: hypothetical.morphedIdentities,
    showDrawnCards: hypothetical.showDrawnCards,
    startingPlayerIndex: hypothetical.startingPlayerIndex,
    notes: globals.state.notes.ourNotes,
    playing: globals.state.playing,
    cardViews,
  });
  if (actions !== undefined) {
    for (const action of actions) {
      sendHypotheticalActionToServer(action);
    }
  }
}

export function sendHypotheticalActionToServer(
  hypoAction: ActionIncludingHypothetical,
): void {
  if (globals.state.replay.ownHypothetical === undefined) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "hypothetical",
        control: { type: "event", event: toWireHypotheticalAction(hypoAction) },
      },
    });
  } else {
    globals.store!.dispatch({
      type: "hypotheticalAction",
      shared: false,
      action: hypoAction,
    });
  }
}

export function sendHypotheticalBack(): void {
  if (
    globals.state.replay.hypothetical === undefined
    || globals.state.replay.hypothetical.states.length <= 1
  ) {
    return;
  }

  if (globals.state.replay.ownHypothetical !== undefined) {
    globals.store!.dispatch({
      type: "hypotheticalBack",
      shared: false,
    });
  } else if (globals.state.replay.shared?.amLeader === true) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "hypothetical",
        control: { type: "back" },
      },
    });
  }
}

export function toggleRevealed(): void {
  if (globals.state.replay.hypothetical === undefined) {
    return;
  }

  if (globals.state.replay.ownHypothetical !== undefined) {
    globals.store!.dispatch({
      type: "hypotheticalShowDrawnCards",
      shared: false,
      showDrawnCards: !globals.state.replay.hypothetical.showDrawnCards,
    });
  } else if (globals.state.replay.shared?.amLeader === true) {
    globals.lobby.conn!.send("replayAction", {
      tableId: globals.lobby.joinedTableId,
      action: {
        type: "hypothetical",
        control: {
          type: "showDrawnCards",
          show: !globals.state.replay.hypothetical.showDrawnCards,
        },
      },
    });
  }
}

// Check if we need to disable the toggleRevealedButton. This happens when a newly drawn card is
// played, discarded, or clued.
export function checkToggleRevealedButton(
  actionMessage: ActionIncludingHypothetical,
): void {
  // The server only sends actions for the shared hypothetical, so skip them while we show our own.
  const { hypothetical, shared } = globals.state.replay;
  if (hypothetical === undefined || hypothetical !== shared?.hypothetical) {
    return;
  }

  switch (actionMessage.type) {
    case "play":
    case "discard": {
      const cardOrder = actionMessage.order;
      if (hypothetical.drawnCardsInHypothetical.includes(cardOrder)) {
        globals.elements.showDrawnCardsCheckbox?.setEnabled(false);
      }

      break;
    }

    case "clue": {
      for (const cardOrder of actionMessage.orders) {
        if (hypothetical.drawnCardsInHypothetical.includes(cardOrder)) {
          globals.elements.showDrawnCardsCheckbox?.setEnabled(false);
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

    const { card } = layoutChild as unknown as LayoutChild;
    setEmpathyOnHand(card, force);
  }
}
