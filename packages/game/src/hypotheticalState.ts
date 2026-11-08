/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */

import type { Draft } from "immer";
import { castDraft, produce } from "immer";
import type { CardIdentity } from "./interfaces/CardIdentity";
import type { GameMetadata } from "./interfaces/GameMetadata";
import type { GameState } from "./interfaces/GameState";
import { recalculateDeductions } from "./reducers/cardDeductionReducer";
import { gameReducer } from "./reducers/gameReducer";
import type { PlayerIndex } from "./types/PlayerIndex";
import type {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionStrike,
  ActionTurn,
  HypotheticalWireAction,
} from "./types/gameActions";

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

  /** Whether empathy has been deduced from cards shown as other identities. */
  readonly deducedFromShownIdentities: boolean;
}

/** Shows a card as another identity, or as blank when its suit and rank are -1. */
export type ActionHypotheticalMorph = Readonly<
  Extract<HypotheticalWireAction, { type: "morph" }>
>;

/** Shows a morphed card as its original identity again. */
export type ActionHypotheticalUnmorph = Readonly<
  Extract<HypotheticalWireAction, { type: "unmorph" }>
>;

/** A game action that a hypothetical move can produce. */
export type HypotheticalGameAction =
  | ActionClue
  | ActionDiscard
  | ActionDraw
  | ActionPlay
  | ActionStrike
  | ActionTurn;

/** An action that a hypothetical can contain: a move's game actions, or a changed identity. */
export type ActionIncludingHypothetical =
  HypotheticalGameAction | ActionHypotheticalMorph | ActionHypotheticalUnmorph;

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
    deducedFromShownIdentities: false,
  };

  for (const action of actions) {
    state = hypotheticalStateReducer(state, action, finished, metadata);
  }

  return state;
}

/** Applies a hypothetical action, restores a saved state, or toggles drawn card identities. */
export function hypotheticalStateReducer(
  state: HypotheticalState,
  action: HypotheticalStateAction,
  finished: boolean,
  metadata: GameMetadata,
): HypotheticalState {
  const newState = produceHypotheticalState(state, action, finished, metadata);
  // Restoring an original identity can leave undefined elements behind.
  const shownIdentities: ReadonlyArray<CardIdentity | undefined> =
    newState.morphedIdentities;

  // Empathy should match the identities that cards in hands are shown as. Once it has been deduced
  // from them, changing them or restoring an earlier state needs a recalculation as well.
  const { ongoing } = newState;
  const showsOtherIdentities = shownIdentities.some(
    (identity, order) =>
      identity !== undefined
      && identity.suitIndex !== null
      && identity.rank !== null
      && typeof ongoing.deck[order]?.location === "number",
  );
  const shownIdentitiesChanged =
    action.type === "morph"
    || action.type === "unmorph"
    || action.type === "back";
  if (
    !showsOtherIdentities
    && !(newState.deducedFromShownIdentities && shownIdentitiesChanged)
  ) {
    return newState;
  }

  const deck = recalculateDeductions(
    ongoing.deck,
    ongoing.hands,
    shownIdentities,
    metadata,
  );
  return {
    ...newState,
    ongoing: deck === ongoing.deck ? ongoing : { ...ongoing, deck },
    deducedFromShownIdentities: true,
  };
}

const produceHypotheticalState = produce(hypotheticalStateReducerFunction);

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

  // Ignore invalid draws from persisted shared replay actions.
  if (
    action.type === "draw"
    && (!Number.isSafeInteger(action.playerIndex)
      || action.playerIndex < 0
      || action.playerIndex >= state.ongoing.hands.length
      || action.order !== state.ongoing.deck.length
      || state.ongoing.cardsRemainingInTheDeck <= 0)
  ) {
    return;
  }

  // Validate persisted replay actions, which bypass the local action planner. A card outside the
  // acting player's hand would end up in two collections, or does not exist yet.
  if (action.type === "play" || action.type === "discard") {
    if (
      state.ongoing.hands[action.playerIndex]?.includes(action.order) !== true
    ) {
      return;
    }
  } else if (action.type === "draw") {
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
