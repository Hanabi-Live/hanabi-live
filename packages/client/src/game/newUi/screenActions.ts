// What the redesigned game screen does when the player makes a move or picks a turn to see.

import type { CardOrder, GameState } from "@hanabi-live/game";
import { isAtMaxClueTokens } from "@hanabi-live/game";
import * as modals from "../../modals.ts";
import { store } from "../../store.ts";
import { currentState, currentVariant } from "../gameSession.ts";
import * as hypothetical from "../hypothetical.ts";
import type { ClientAction } from "../types/ClientAction.ts";
import type { State } from "../types/State.ts";
import * as replay from "../ui/replay.ts";
import * as turn from "../ui/turn.ts";
import { toggleArrow } from "./arrow.ts";

/** Plays the move in the game, or in the hypothetical when there is one. */
export function sendAction(action: ClientAction): void {
  if (currentState().replay.hypothetical === undefined) {
    turn.end(action);
  } else {
    hypothetical.sendHypotheticalAction(action);
  }
}

/** The state that the player's moves change: the hypothetical's, or else the game's. */
export function getActionState(state: State): GameState {
  return state.replay.hypothetical?.ongoing ?? state.ongoingGame;
}

export function canDiscardNow(): boolean {
  return !isAtMaxClueTokens(
    getActionState(currentState()).clueTokens,
    currentVariant(),
  );
}

/** In a hypothetical with the cards turned on for editing, a card changes into another. */
export function editCard(order: CardOrder): void {
  const state = store.getState().game.current;
  const target =
    state === undefined ? undefined : hypothetical.getMorphTarget(state, order);
  if (target !== undefined) {
    modals.askForMorph(target, currentVariant());
  }
}

/** Shows the turn just after a clue, in the in-game replay. */
export function showClue(segment: number): void {
  replay.goToSegment(segment + 1, true);
}

/**
 * Shows the turn on which a discarded card left its hand, in the in-game replay. The arrow points
 * at the card, so that it is easy to find.
 */
export function showDiscard(order: CardOrder): void {
  const segment = currentState().ongoingGame.deck[order]?.segmentDiscarded;
  if (segment !== undefined) {
    showTurnAndIndicateCard(segment, order);
  }
}

/** Shows the turn of a strike. The arrow points at the card that caused it. */
export function showStrike(segment: number): void {
  const strike = currentState().ongoingGame.strikes.find(
    (stateStrike) => stateStrike.segment === segment,
  );
  if (strike === undefined) {
    showReplayTurn(segment);
  } else {
    showTurnAndIndicateCard(segment, strike.order);
  }
}

/** Shows a turn, and points the arrow at a card on it, so that the card is easy to find. */
function showTurnAndIndicateCard(segment: number, order: CardOrder) {
  showReplayTurn(segment);
  toggleArrow(order, true);
}

/** Shows a turn in the in-game replay. */
export function showReplayTurn(segment: number): void {
  if (currentState().replay.segment === undefined) {
    replay.enter(segment);
  } else {
    replay.goToSegment(segment, true);
  }
}

/**
 * Goes into the in-game replay, or back to the game. A hypothetical in the replay ends with it,
 * since it starts from a turn of the replay.
 */
export function toggleReplay(): void {
  if (currentState().replay.segment === undefined) {
    replay.enter();
    return;
  }

  hypothetical.endHypothetical();
  replay.exitButton();
}
