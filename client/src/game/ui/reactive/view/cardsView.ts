/* eslint-disable import/prefer-default-export */

import CardIdentity from '../../../types/CardIdentity';
import CardState from '../../../types/CardState';
import ClueType from '../../../types/ClueType';
import State from '../../../types/State';
import globals from '../../globals';
import observeStore, { Subscription, Selector, Listener } from '../observeStore';

export function onDeckChanged(length: number) {
  // Handle card subscriptions
  // TODO: this could be used to create/destroy HanabiCards / card UI
  // on the fly based on state which would make loading a lot faster
  if (globals.cardSubscriptions.length < length) {
    // Subscribe the new cards
    for (let i = globals.cardSubscriptions.length; i < length; i++) {
      const subscription = subscribeToCardChanges(i);
      globals.cardSubscriptions.push(subscription);
    }
  } else {
    // Unsubscribe the removed cards
    while (globals.cardSubscriptions.length > length) {
      const unsubscribe = globals.cardSubscriptions.pop()!;
      unsubscribe();
    }
  }
}

export function onMorphedIdentitiesChanged(data: {
  hypotheticalActive: boolean;
  morphedIdentities: readonly CardIdentity[] | undefined;
}, previousData: {
  hypotheticalActive: boolean;
  morphedIdentities: readonly CardIdentity[] | undefined;
} | undefined) {
  if (previousData === undefined || !previousData.hypotheticalActive) {
    // Initializing, or entering hypothetical
    return;
  }

  if (!data.hypotheticalActive) {
    if (!previousData.hypotheticalActive) {
      // Something is wrong, we're exiting a hypothetical that wasn't there
      throw new Error('Trying to unmorph cards but we were not in a hypothetical.');
    }
    // Exiting hypothetical, update all morphed
    for (let i = 0; i < previousData.morphedIdentities!.length; i++) {
      if (previousData.morphedIdentities![i] !== undefined) {
        updateCardVisuals(i);
      }
    }
    return;
  }

  // Update the card visuals when a card is morphed
  const currentLength = data.morphedIdentities!.length;
  const previousLength = previousData.morphedIdentities!.length;
  const maxLength = Math.max(currentLength, previousLength);
  for (let i = 0; i < maxLength; i++) {
    if (data.morphedIdentities![i] !== previousData.morphedIdentities![i]) {
      updateCardVisuals(i);
    }
  }
}

function subscribeToCardChanges(order: number) {
  const subscriptions: Array<Subscription<State, any>> = [];

  // Validates that a card exists in the visible state before firing a listener
  function checkOrderAndSelect<T>(s: Selector<State, T>): Selector<State, T> {
    return (state) => {
      if (order >= state.visibleState!.deck.length) {
        // This card was removed from visible state
        // Return undefined to prevent firing the listener
        return undefined;
      }
      return s(state);
    };
  }

  // Subscribes to a set of property changes from cards
  function sub<T>(s: Selector<CardState, T>, l: Listener<T>) {
    const cardSelector = (state: State) => s(state.visibleState!.deck[order]);
    subscriptions.push({ select: checkOrderAndSelect(cardSelector), onChange: l });
  }

  // Subscribes to a set of property changes from cards as well as anywhere else in state
  function subFullState<T>(s: Selector<State, T>, l: Listener<T>) {
    subscriptions.push({ select: checkOrderAndSelect(s), onChange: l });
  }

  // TODO: all the properties!
  // Clued border
  sub((c) => ({
    numPositiveClues: c.numPositiveClues,
    location: c.location,
  }), () => updateCluedBorder(order));
  // Pips
  sub((c) => c.rankClueMemory.pipStates, () => updatePips(order, ClueType.Rank));
  sub((c) => c.colorClueMemory.pipStates, () => updatePips(order, ClueType.Color));
  // Notes
  sub((c) => ({
    possibleRanks: c.rankClueMemory.possibilities,
    possibleSuits: c.colorClueMemory.possibilities,
  }), () => updateNotePossibilities(order));
  // Card visuals
  subFullState((s) => {
    const card = s.visibleState!.deck[order];
    return {
      rank: card.rank,
      suitIndex: card.suitIndex,
      location: card.location,
      numPossibleRanks: card.rankClueMemory.possibilities.length,
      numPossibleSuits: card.colorClueMemory.possibilities.length,
      identity: s.cardIdentities[order],
    };
  }, () => updateCardVisuals(order));

  return observeStore(globals.store!, subscriptions);
}

// TODO: these functions should pass the value of the changed properties,
// and not let the UI query the whole state object

function updateCluedBorder(order: number) {
  globals.deck[order].setClued();
  globals.layers.card.batchDraw();
}

function updatePips(order: number, clueType: ClueType) {
  globals.deck[order].updatePips(clueType);
  globals.layers.card.batchDraw();
}

function updateCardVisuals(order: number) {
  // Card visuals are updated for both the deck and stack bases when morphed
  if (order < globals.deck.length) {
    globals.deck[order].setBareImage();
  } else {
    globals.stackBases[order - globals.deck.length].setBareImage();
  }
  globals.layers.card.batchDraw();
}

function updateNotePossibilities(order: number) {
  globals.deck[order].updateNotePossibilities();
  globals.layers.card.batchDraw();
}
