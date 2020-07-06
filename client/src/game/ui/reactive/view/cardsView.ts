import CardState from '../../../types/CardState';
import ClueType from '../../../types/ClueType';
import State from '../../../types/State';
import globals from '../../globals';
import observeStore, { Subscription, Selector, Listener } from '../observeStore';

// eslint-disable-next-line import/prefer-default-export
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

  // Shorthand function for a nicer syntax and type checking when registering subscriptions
  function sub<T>(s: Selector<CardState, T>, l: Listener<T>) {
    const checkOrderAndSelect: Selector<State, T> = (state) => {
      if (order >= state.visibleState.deck.length) {
        // This card was removed from visible state
        // Return undefined to prevent firing the listener
        return undefined;
      }
      return s(state.visibleState.deck[order]);
    };
    subscriptions.push({ select: checkOrderAndSelect, onChange: l });
  }

  // TODO: all the properties!
  // Clued border
  sub((c) => ({
    numPositiveClues: c.numPositiveClues,
    isPlayed: c.isPlayed,
    isDiscarded: c.isDiscarded,
  }), () => updateCluedBorder(order));
  // Pips
  sub((c) => c.rankClueMemory.pipStates, () => updatePips(order, ClueType.Rank));
  sub((c) => c.colorClueMemory.pipStates, () => updatePips(order, ClueType.Color));
  // Card visuals
  sub((c) => ({
    rank: c.rank,
    suitIndex: c.suitIndex,
    isPlayed: c.isPlayed,
    isDiscarded: c.isDiscarded,
    possibleRanks: c.rankClueMemory.possibilities,
    possibleSuits: c.colorClueMemory.possibilities,
    blank: c.blank,
  }), () => updateCardVisuals(order));
  // Notes
  sub((c) => ({
    possibleRanks: c.rankClueMemory.possibilities,
    possibleSuits: c.colorClueMemory.possibilities,
  }), () => updateNotePossibilities(order));
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
  // TODO this function is useless?
  globals.deck[order].setBareImage();
}

function updateNotePossibilities(order: number) {
  globals.deck[order].updateNotePossibilities();
}
