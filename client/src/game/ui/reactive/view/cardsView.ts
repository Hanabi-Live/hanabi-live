import CardState from '../../../types/CardState';
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
  sub((c) => ({
    numPositiveClues: c.numPositiveClues,
    isPlayed: c.isPlayed,
    isDiscarded: c.isDiscarded,
  }), () => setClued(order));

  return observeStore(globals.store!, subscriptions);
}

function setClued(order: number) {
  globals.deck[order].setClued();
}
