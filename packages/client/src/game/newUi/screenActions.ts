// What the redesigned game screen does when the player makes a move or picks a turn to see.

import type {
  CardOrder,
  GameState,
  SuitIndex,
  SuitRankTuple,
} from "@hanabi-live/game";
import { getTotalCardsInDeck, isAtMaxClueTokens } from "@hanabi-live/game";
import { flushSync } from "react-dom";
import * as modals from "../../modals.ts";
import { store } from "../../store.ts";
import { confirmPlay } from "../confirmPlay.ts";
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

/**
 * Plays or discards a card, after asking the player when the move needs it, as on the classic
 * screen. Playing a card that cannot be played, or that the player's note says cannot be, asks
 * first. In a hypothetical, a card of unknown identity asks which card it is. `onSend` is called
 * when the move goes, and `onCancel` when the player cancels it.
 */
export function moveCard(
  type: "play" | "discard",
  order: CardOrder,
  {
    onSend,
    onCancel,
  }: {
    readonly onSend?: () => void;
    readonly onCancel?: () => void;
  } = {},
): void {
  const state = currentState();
  function send() {
    onSend?.();
    sendAction({
      type,
      order,
    });
  }

  if (state.replay.hypothetical !== undefined) {
    const target = hypothetical.getMorphTarget(state, order);
    if (
      target !== undefined
      && (target.identity.suitIndex === undefined
        || target.identity.rank === undefined)
    ) {
      modals.askForMorph(target, currentVariant(), (changed) => {
        if (changed) {
          send();
        } else {
          onCancel?.();
        }
      });
      return;
    }
  }

  // A replay shows a past turn, but the move is made on the turn that is played now.
  const cardState = getActionState(state).deck[order];
  if (type === "play" && cardState !== undefined) {
    confirmPlay(cardState, send, onCancel);
    return;
  }

  send();
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
  if (state === undefined) {
    return;
  }

  const variant = currentVariant();
  const target =
    order >= getTotalCardsInDeck(variant)
      ? getStackBaseMorphTarget(state, order)
      : hypothetical.getMorphTarget(state, order);
  if (target !== undefined) {
    modals.askForMorph(target, variant);
  }
}

/**
 * A stack base, as the morph dialog starts with it. Stack bases use the orders after the final card
 * in the deck. A stack base can show any rank of its own suit, as on the classic screen.
 */
function getStackBaseMorphTarget(
  state: State,
  order: CardOrder,
): modals.MorphTarget | undefined {
  const variant = currentVariant();
  const suitIndex = (order - getTotalCardsInDeck(variant)) as SuitIndex;
  if (variant.suits[suitIndex] === undefined) {
    return undefined;
  }

  const morph = state.replay.hypothetical?.morphedIdentities[order];
  return {
    order,
    identity: morph ?? {
      suitIndex,
      rank: undefined,
    },
    possibilities: variant.ranks.map((rank): SuitRankTuple => [
      suitIndex,
      rank,
    ]),
  };
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
export function showTurnAndIndicateCard(
  segment: number,
  order: CardOrder,
): void {
  showReplayTurn(segment);
  toggleArrow(order, true);
}

/**
 * Shows the turn on which a card was drawn, and then the next turn, so that the card moves from the
 * deck into its hand, as on the classic screen. The arrow points at the card.
 */
export function showDraw(segment: number, order: CardOrder): void {
  // The screen must render the first turn, so that the card moves on the next one.
  flushSync(() => {
    showReplayTurn(segment);
  });
  showTurnAndIndicateCard(segment + 1, order);
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
