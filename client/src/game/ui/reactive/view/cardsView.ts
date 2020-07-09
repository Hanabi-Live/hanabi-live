/* eslint-disable import/prefer-default-export */

import CardState from '../../../types/CardState';
import ClueType from '../../../types/ClueType';
import State from '../../../types/State';
import globals from '../../globals';
import observeStore, { Subscription, Selector, Listener } from '../observeStore';

export function onDeckChanged(length: number) {
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

  // Subscribes to a set of property changes from cards as well as the card identity
  function subWithCardIdentity<T>(s: Selector<CardState, T>, l: Listener<T>) {
    const combinedSelector = (state: State) => ({
      identity: state.cardIdentities[order],
      cardProperties: s(state.visibleState!.deck[order]),
    });
    subscriptions.push({ select: checkOrderAndSelect(combinedSelector), onChange: l });
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
  subWithCardIdentity((c) => ({
    rank: c.rank,
    suitIndex: c.suitIndex,
    location: c.location,
    numPossibleRanks: c.rankClueMemory.possibilities.length,
    numPossibleSuits: c.colorClueMemory.possibilities.length,
    blank: c.blank,
  }), () => updateCardVisuals(order));

  return observeStore(globals.store!, subscriptions);
}

// TODO: these functions should pass the value of the changed properties,
// and not let the UI query the whole state object

function updateCluedBorder(order: number) {
  globals.deck[order].setClued();
}

function updatePips(order: number, clueType: ClueType) {
  globals.deck[order].updatePips(clueType);
}

function updateCardVisuals(order: number) {
  globals.deck[order].setBareImage();
}

function updateNotePossibilities(order: number) {
  globals.deck[order].updateNotePossibilities();
}
