import { deckRules } from '../../../rules';
import CardIdentity from '../../../types/CardIdentity';
import CardState from '../../../types/CardState';
import State from '../../../types/State';
import globals from '../../globals';
import HanabiCard from '../../HanabiCard';
import observeStore, { Subscription, Selector, Listener } from '../observeStore';

export const onCardsPossiblyAdded = (length: number) => {
  // Subscribe the new cards
  for (let i = globals.cardSubscriptions.length; i < length; i++) {
    if (globals.deck.length <= i) {
      // Construct the card object
      globals.ourNotes.set(i, '');
      globals.allNotes.set(i, []);
      globals.deck.push(new HanabiCard({ order: i }));
    }
    const subscription = subscribeToCardChanges(i);
    globals.cardSubscriptions.push(subscription);
  }
};

export const onCardsPossiblyRemoved = (length: number) => {
  // Unsubscribe the removed cards
  while (globals.cardSubscriptions.length > length) {
    // The card was removed from the visible state
    // Ensure the position of the card is correctly reset
    globals.deck[globals.cardSubscriptions.length - 1].moveToDeckPosition();

    const unsubscribe = globals.cardSubscriptions.pop()!;
    unsubscribe();
  }
};

export const onMorphedIdentitiesChanged = (data: {
  hypotheticalActive: boolean;
  morphedIdentities: readonly CardIdentity[] | undefined;
}, previousData: {
  hypotheticalActive: boolean;
  morphedIdentities: readonly CardIdentity[] | undefined;
} | undefined) => {
  if (previousData === undefined || !previousData.hypotheticalActive) {
    // Initializing or entering a hypothetical
    return;
  }

  if (!data.hypotheticalActive) {
    if (!previousData.hypotheticalActive) {
      throw new Error('Trying to unmorph cards but we are not in a hypothetical.');
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
};

const subscribeToCardChanges = (order: number) => {
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

  // Borders
  sub((c) => ({
    numPositiveClues: c.numPositiveClues,
    location: c.location,
  }), () => updateBorder(order));

  // Pips
  sub((c) => ({
    numPossibleCardsFromClues: c.possibleCardsFromClues.length,
    possibleCardsFromObservation: c.possibleCardsFromObservation,
    numPositiveRankClues: c.positiveRankClues.length,
  }), () => updatePips(order));
  // Notes
  sub((c) => ({
    possibleCardsFromClues: c.possibleCardsFromClues,
    possibleCardsFromObservation: c.possibleCardsFromObservation,
  }), () => updateNotePossibilities(order));
  // Card visuals
  subFullState((s) => {
    const card = s.visibleState!.deck[order];
    return {
      rank: card.rank,
      suitIndex: card.suitIndex,
      location: card.location,
      suitDetermined: card.suitDetermined,
      rankDetermined: card.rankDetermined,
      identity: s.cardIdentities[order],
    };
  }, () => updateCardVisuals(order));

  return observeStore(globals.store!, subscriptions);
};

// TODO: these functions should pass the value of the changed properties,
// and not let the UI query the whole state object

const updateBorder = (order: number) => {
  globals.deck[order].setBorder();
  globals.layers.card.batchDraw();
};

const updatePips = (order: number) => {
  globals.deck[order].updatePips();
  globals.layers.card.batchDraw();
};

const updateCardVisuals = (order: number) => {
  // Card visuals are updated for both the deck and stack bases when morphed
  if (order < globals.deck.length) {
    globals.deck[order].setBareImage();
  } else {
    globals.stackBases[order - deckRules.totalCards(globals.variant)].setBareImage();
  }

  globals.layers.card.batchDraw();
};

const updateNotePossibilities = (order: number) => {
  globals.deck[order].updateNotePossibilities();
  globals.layers.card.batchDraw();
};

export const onCardStatusChanged = () => {
  globals.deck.forEach((card) => card.setStatus());
  globals.layers.card.batchDraw();
};
