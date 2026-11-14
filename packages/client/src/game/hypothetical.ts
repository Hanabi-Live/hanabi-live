// In shared replays, players can enter a hypothetical, where they can make any moves to see what
// would happen. Both game screens start, play, and end hypotheticals with these functions.

import type { ClientRequestData } from "@hanabi-live/data";
import type {
  CardIdentity,
  CardOrder,
  HypotheticalActionIntent,
  HypotheticalCardView,
} from "@hanabi-live/game";
import {
  getCardIdentityToShow,
  getClueCost,
  getHypotheticalCard,
  getVariantById,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { globals } from "../Globals.ts";
import type { MorphTarget } from "../modals.ts";
import { store } from "../store.ts";
import { toWireHypotheticalAction } from "../wire.ts";
import { controlsHypothetical } from "./controlsHypothetical.ts";
import { gameUpdated } from "./gameSlice.ts";
import { planClientHypotheticalAction } from "./planClientHypotheticalAction.ts";
import type { ClientAction } from "./types/ClientAction.ts";
import type { State } from "./types/State.ts";
import type { ActionIncludingHypothetical } from "./types/actions.ts";

function getState(): State {
  const { current } = store.getState().game;
  assertDefined(current, "The game's state does not exist yet.");
  return current;
}

type HypotheticalControl = Extract<
  ClientRequestData["replayAction"]["action"],
  { type: "hypothetical" }
>["control"];

/** Sends the leader's change to the shared hypothetical. */
function sendControl(control: HypotheticalControl) {
  globals.connection.send("replayAction", {
    tableId: globals.joinedTableId,
    action: { type: "hypothetical", control },
  });
}

export function startHypothetical(): void {
  const { hypothetical, shared } = getState().replay;
  if (hypothetical !== undefined) {
    return;
  }

  if (shared === undefined) {
    store.dispatch(
      gameUpdated({
        type: "hypotheticalStart",
        shared: false,
        showDrawnCards: false,
        actions: [],
      }),
    );
  } else if (shared.amLeader) {
    sendControl({ type: "start" });
    startSharedHypothetical();
  }
}

/** The leader starts the shared hypothetical without waiting for the server. */
export function startSharedHypothetical(): void {
  const { shared } = getState().replay;
  if (shared === undefined || shared.hypothetical !== undefined) {
    return;
  }

  store.dispatch(
    gameUpdated({
      type: "hypotheticalStart",
      shared: true,
      showDrawnCards: false,
      actions: [],
    }),
  );
}

export function endHypothetical(): void {
  const { hypothetical, ownHypothetical, shared } = getState().replay;
  if (hypothetical === undefined) {
    return;
  }

  if (ownHypothetical !== undefined) {
    store.dispatch(
      gameUpdated({
        type: "hypotheticalEnd",
        shared: false,
      }),
    );
    return;
  }

  // Wait for the server to end the hypothetical, so that pending actions are processed first.
  if (shared?.amLeader === true) {
    sendControl({ type: "end" });
  }
}

/** Apply the server's end of the shared hypothetical. */
export function finishHypothetical(): void {
  if (getState().replay.shared?.hypothetical === undefined) {
    return;
  }

  store.dispatch(
    gameUpdated({
      type: "hypotheticalEnd",
      shared: true,
    }),
  );
}

export function sendHypotheticalAction(hypoAction: ClientAction): void {
  planAndSendHypotheticalAction(hypoAction);
}

/** Spends a clue to give the turn to the next player, without giving a clue. */
export function sendHypotheticalPassTurn(): void {
  if (!canPassTurnInHypothetical(getState())) {
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
    && hypothetical.ongoing.clueTokens
      >= getClueCost(getVariantById(state.metadata.options.variantId))
  );
}

/** A card as the player sees it, which decides what a hypothetical move does with it. */
function getCardView(
  state: State,
  order: CardOrder,
): HypotheticalCardView | undefined {
  const cardState = state.visibleState?.deck[order];
  const morphedIdentity = state.replay.hypothetical?.morphedIdentities[order];
  const cardIdentity = morphedIdentity ?? state.cardIdentities[order];
  const note = state.notes.ourNotes[order];
  if (
    cardState === undefined
    || cardIdentity === undefined
    || note === undefined
  ) {
    return undefined;
  }

  const { suitIndex, rank } = getCardIdentityToShow({
    cardIdentity,
    state: cardState,
    note,
    empathy: false,
    morphedIdentity,
    isStackBase: false,
    finished: state.finished,
  });
  return {
    state: cardState,
    isStackBase: false,
    visibleSuitIndex: suitIndex,
    visibleRank: rank,
  };
}

function planAndSendHypotheticalAction(intent: HypotheticalActionIntent) {
  const state = getState();
  const { hypothetical } = state.replay;
  assertDefined(hypothetical, "There is no hypothetical.");
  const gameState = hypothetical.ongoing;
  let orders: readonly CardOrder[] = [];
  if (gameState.turn.currentPlayerIndex !== undefined) {
    switch (intent.type) {
      case "play":
      case "discard": {
        orders = [intent.order];
        break;
      }

      case "clue": {
        orders = gameState.hands[intent.receiverIndex] ?? [];
        break;
      }

      case "passTurn": {
        break;
      }
    }
  }

  const cardViews: HypotheticalCardView[] = [];
  for (const order of orders) {
    const view = getCardView(state, order);
    if (view !== undefined) {
      cardViews.push(view);
    }
  }

  const actions = planClientHypotheticalAction(intent, {
    gameState,
    metadata: state.metadata,
    variant: getVariantById(state.metadata.options.variantId),
    cardIdentities: state.cardIdentities,
    morphedIdentities: hypothetical.morphedIdentities,
    showDrawnCards: hypothetical.showDrawnCards,
    startingPlayerIndex: hypothetical.startingPlayerIndex,
    notes: state.notes.ourNotes,
    playing: state.playing,
    cardViews,
  });
  if (actions !== undefined) {
    for (const action of actions) {
      sendHypotheticalActionToServer(action);
    }
  }
}

function sendHypotheticalActionToServer(
  hypoAction: ActionIncludingHypothetical,
) {
  if (getState().replay.ownHypothetical === undefined) {
    sendControl({
      type: "event",
      event: toWireHypotheticalAction(hypoAction),
    });
  } else {
    store.dispatch(
      gameUpdated({
        type: "hypotheticalAction",
        shared: false,
        action: hypoAction,
      }),
    );
  }
}

export function sendHypotheticalBack(): void {
  const { hypothetical, ownHypothetical, shared } = getState().replay;
  if (hypothetical === undefined || hypothetical.states.length <= 1) {
    return;
  }

  if (ownHypothetical !== undefined) {
    store.dispatch(
      gameUpdated({
        type: "hypotheticalBack",
        shared: false,
      }),
    );
  } else if (shared?.amLeader === true) {
    sendControl({ type: "back" });
  }
}

export function toggleRevealed(): void {
  const { hypothetical, ownHypothetical, shared } = getState().replay;
  if (hypothetical === undefined) {
    return;
  }

  if (ownHypothetical !== undefined) {
    store.dispatch(
      gameUpdated({
        type: "hypotheticalShowDrawnCards",
        shared: false,
        showDrawnCards: !hypothetical.showDrawnCards,
      }),
    );
  } else if (shared?.amLeader === true) {
    sendControl({
      type: "showDrawnCards",
      show: !hypothetical.showDrawnCards,
    });
  }
}

/** Changes a card into another card in the hypothetical, or back into its own identity. */
export function morphCard(
  order: CardOrder,
  identity: CardIdentity | "original",
): void {
  sendHypotheticalActionToServer(
    identity === "original"
      ? { type: "unmorph", order }
      : {
          type: "morph",
          order,
          identity: { suitIndex: identity.suitIndex, rank: identity.rank },
        },
  );
}

/** A card in a hand, as the morph dialog starts with it. */
export function getMorphTarget(
  state: State,
  order: CardOrder,
): MorphTarget | undefined {
  const cardState = state.visibleState?.deck[order];
  const note = state.notes.ourNotes[order];
  if (cardState === undefined || note === undefined) {
    return undefined;
  }

  const { identity } = getHypotheticalCard({
    state: cardState,
    identity: state.cardIdentities[order] ?? {
      suitIndex: undefined,
      rank: undefined,
    },
    morphedIdentity: state.replay.hypothetical?.morphedIdentities[order],
    note,
    playing: state.playing,
    isStackBase: false,
    visibleSuitIndex: undefined,
    visibleRank: undefined,
  });
  return {
    order,
    identity,
    possibilities: cardState.possibleCardsForEmpathy,
  };
}
