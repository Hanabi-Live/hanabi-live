/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */

import type { Draft } from "immer";
import { castDraft, produce } from "immer";
import type { CardIdentity } from "./interfaces/CardIdentity";
import type { GameMetadata } from "./interfaces/GameMetadata";
import type { GameState } from "./interfaces/GameState";
import { gameReducer } from "./reducers/gameReducer";
import type { CardOrder } from "./types/CardOrder";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { Rank } from "./types/Rank";
import type { SuitIndex } from "./types/SuitIndex";
import type { GameAction } from "./types/gameActions";

export interface HypotheticalState {
  readonly ongoing: GameState;

  /**
   * This will have 1 element if we have entered a hypothetical but not made any moves yet, 2
   * elements if we have made 1 move, etc.
   */
  readonly states: readonly GameState[];

  readonly showDrawnCards: boolean;
  readonly drawnCardsInHypothetical: readonly number[];

  /**
   * A sparse array indexed by card order.
   *
   * If a card is in this array, it is being shown with an alternate identity. If the alternate
   * identity is null/null, it is shown as blank.
   */
  readonly morphedIdentities: readonly CardIdentity[];

  readonly startingPlayerIndex: PlayerIndex | null;
}

export interface ActionHypotheticalMorph {
  readonly type: "morph";

  /** -1 represents a card of an unknown card. */
  readonly suitIndex: SuitIndex | -1;

  /** -1 represents a card of an unknown rank. */
  readonly rank: Rank | -1;

  readonly order: CardOrder;
}

export interface ActionHypotheticalUnmorph {
  readonly type: "unmorph";
  readonly order: CardOrder;
}

export type ActionIncludingHypothetical =
  GameAction | ActionHypotheticalMorph | ActionHypotheticalUnmorph;

export type HypotheticalStateAction =
  | ActionIncludingHypothetical
  | { readonly type: "back" }
  | { readonly type: "showDrawnCards"; readonly showDrawnCards: boolean };

/** Starts from the game state selected by the caller, then applies any initial actions in order. */
export function initializeHypotheticalState(
  ongoing: GameState,
  showDrawnCards: boolean,
  actions: readonly ActionIncludingHypothetical[],
  finished: boolean,
  metadata: GameMetadata,
): HypotheticalState {
  let state: HypotheticalState = {
    ongoing,
    states: [ongoing],
    showDrawnCards,
    drawnCardsInHypothetical: [],
    morphedIdentities: [],
    startingPlayerIndex: ongoing.turn.currentPlayerIndex,
  };

  for (const action of actions) {
    state = hypotheticalStateReducer(state, action, finished, metadata);
  }

  return state;
}

/** Applies a hypothetical action, restores a saved state, or toggles drawn card identities. */
export const hypotheticalStateReducer = produce(
  hypotheticalStateReducerFunction,
);

function hypotheticalStateReducerFunction(
  state: Draft<HypotheticalState>,
  action: HypotheticalStateAction,
  finished: boolean,
  metadata: GameMetadata,
) {
  switch (action.type) {
    case "back": {
      state.states.pop();
      const lastState = state.states.at(-1);
      if (lastState !== undefined) {
        state.ongoing = lastState;
      }
      return;
    }

    case "showDrawnCards": {
      state.showDrawnCards = action.showDrawnCards;
      for (const order of state.drawnCardsInHypothetical) {
        if (action.showDrawnCards) {
          // This is a sparse array, so delete the entry instead of splicing it.
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-array-delete
          delete state.morphedIdentities[order];
        } else {
          state.morphedIdentities[order] = {
            rank: null,
            suitIndex: null,
          };
        }
      }
      return;
    }

    case "morph": {
      state.morphedIdentities[action.order] = {
        suitIndex: action.suitIndex === -1 ? null : action.suitIndex,
        rank: action.rank === -1 ? null : action.rank,
      };
      return;
    }

    case "unmorph": {
      // This is a sparse array, so delete the entry instead of splicing it.
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete, @typescript-eslint/no-array-delete
      delete state.morphedIdentities[action.order];
      return;
    }

    default: {
      break;
    }
  }

  if (action.type === "draw") {
    // Store every draw to be able to show/hide the cards in the future.
    state.drawnCardsInHypothetical.push(action.order);
    if (!state.showDrawnCards) {
      state.morphedIdentities[action.order] = {
        suitIndex: null,
        rank: null,
      };
    }
  }

  const isClueActionThatShouldIgnoreNegative =
    action.type === "clue"
    && !state.showDrawnCards
    && state.startingPlayerIndex === action.target;
  const newAction = isClueActionThatShouldIgnoreNegative
    ? { ...action, ignoreNegative: true }
    : action;

  const oldSegment = state.ongoing.turn.segment;
  const newState = gameReducer(
    state.ongoing,
    newAction,
    true,
    false,
    finished,
    true,
    metadata,
  );
  state.ongoing = castDraft(newState);

  if (oldSegment !== newState.turn.segment) {
    // Save the new segment in case we want to go backwards.
    state.states.push(castDraft(newState));
  }
}
