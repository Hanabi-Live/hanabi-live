import type { CardOrder } from "@hanabi/data";
import type { CardState } from "@hanabi/game";
import { eRange } from "@hanabi/utils";
import type { CardIdentity } from "../../../types/CardIdentity";
import type { State } from "../../../types/State";
import { HanabiCard } from "../../HanabiCard";
import { globals } from "../../UIGlobals";
import { getCardOrStackBase } from "../../getCardOrStackBase";
import { changeStartingHandVisibility } from "../../hypothetical";
import type { Listener, Selector, Subscription } from "../observeStore";
import { observeStore } from "../observeStore";

export function onCardsPossiblyAdded(length: number): void {
  // Subscribe the new cards.
  for (const i of eRange(globals.cardSubscriptions.length, length)) {
    if (globals.deck.length <= i) {
      const newCard = new HanabiCard(
        i as CardOrder,
        null,
        null,
        false,
        globals.variant,
        globals.options.numPlayers,
      );
      globals.deck.push(newCard);
    }

    const subscription = subscribeToCardChanges(i as CardOrder);
    globals.cardSubscriptions.push(subscription);
  }
}

export function onCardsPossiblyRemoved(length: number): void {
  // Unsubscribe the removed cards.
  while (globals.cardSubscriptions.length > length) {
    // The card was removed from the visible state. Ensure the position of the card is correctly
    // reset.
    const card = globals.deck[globals.cardSubscriptions.length - 1];
    if (card !== undefined) {
      card.moveToDeckPosition();
    }

    const unsubscribe = globals.cardSubscriptions.pop();
    if (unsubscribe !== undefined) {
      unsubscribe();
    }
  }
}

export function onMorphedIdentitiesChanged(
  data: {
    hypotheticalActive: boolean;
    morphedIdentities: readonly CardIdentity[] | undefined;
  },
  previousData:
    | {
        hypotheticalActive: boolean;
        morphedIdentities: readonly CardIdentity[] | undefined;
      }
    | undefined,
): void {
  changeStartingHandVisibility();
  if (previousData === undefined || !previousData.hypotheticalActive) {
    // Initializing or entering a hypothetical. Hide the starting player's hand.
    return;
  }

  if (!data.hypotheticalActive) {
    // Exiting hypothetical, update all morphed.
    if (previousData.morphedIdentities !== undefined) {
      for (const i of previousData.morphedIdentities.keys()) {
        // Since `morphedIdentities` is a sparse array, we need to check for undefined.
        if (previousData.morphedIdentities[i] !== undefined) {
          updateCardVisuals(i as CardOrder);
        }
      }
    }

    return;
  }

  // Update the card visuals when a card is morphed.
  const currentLength = data.morphedIdentities!.length;
  const previousLength = previousData.morphedIdentities!.length;
  const maxLength = Math.max(currentLength, previousLength);
  if (
    data.morphedIdentities !== undefined &&
    previousData.morphedIdentities !== undefined
  ) {
    for (const i of eRange(maxLength)) {
      if (data.morphedIdentities[i] !== previousData.morphedIdentities[i]) {
        updateCardVisuals(i as CardOrder);
      }
    }
  }
}

function subscribeToCardChanges(order: CardOrder) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions: Array<Subscription<State, any>> = [];

  // Validates that a card exists in the visible state before firing a listener.
  function checkOrderAndSelect<T>(s: Selector<State, T>): Selector<State, T> {
    return (state) => {
      if (order >= state.visibleState!.deck.length) {
        // This card was removed from visible state. Return undefined to prevent firing the
        // listener.
        return undefined;
      }

      return s(state);
    };
  }

  // Subscribes to a set of property changes from cards.
  function sub<T>(s: Selector<CardState, T>, l: Listener<T>) {
    // eslint-disable-next-line func-style
    const cardSelector = (state: State) => s(state.visibleState!.deck[order]!);
    subscriptions.push({
      select: checkOrderAndSelect(cardSelector),
      onChange: l,
    });
  }

  // Subscribes to a set of property changes from cards as well as anywhere else in state.
  function subFullState<T>(s: Selector<State, T>, l: Listener<T>) {
    subscriptions.push({ select: checkOrderAndSelect(s), onChange: l });
  }

  // Borders
  sub(
    (c) => ({
      numPositiveClues: c.numPositiveClues,
      location: c.location,
    }),
    () => {
      updateBorder(order);
    },
  );

  // Card fade and critical indicator.
  subFullState(
    (s) => {
      const card = s.visibleState!.deck[order]!;
      const status =
        card.suitIndex !== null && card.rank !== null
          ? s.visibleState!.cardStatus[card.suitIndex][card.rank]
          : null;

      return {
        status,
        clued: card.numPositiveClues >= 1,
        location: card.location,
        doubleDiscard: card.inDoubleDiscard,
      };
    },
    () => {
      updateCardStatus(order);
    },
  );

  // Notes
  sub(
    (c) => ({
      possibleCards: c.possibleCards.length,
    }),
    () => {
      checkNoteDisproved(order);
    },
  );

  // Pips
  sub(
    (c) => ({
      numPossibleCardsFromClues: c.possibleCardsFromClues.length,
      possibleCards: c.possibleCards.length,
      possibleCardsForEmpathy: c.possibleCardsForEmpathy.length,
      numPositiveColorClues: c.positiveColorClues.length,
      numPositiveRankClues: c.positiveRankClues.length,
    }),
    () => {
      updatePips(order);
    },
  );

  // Status
  sub(
    (c) => ({
      isKnownTrashFromEmpathy: c.isKnownTrashFromEmpathy,
    }),
    () => {
      updateCardStatus(order);
    },
  );

  // Card visuals
  subFullState(
    (s) => {
      const card = s.visibleState!.deck[order]!;
      return {
        rank: card.rank,
        suitIndex: card.suitIndex,
        location: card.location,
        suitDetermined: card.suitDetermined,
        rankDetermined: card.rankDetermined,
        numPossibleCardsFromClues: card.possibleCardsFromClues.length,
        identity: s.cardIdentities[order],
      };
    },
    () => {
      updateCardVisuals(order);
    },
  );

  return observeStore(globals.store!, subscriptions);
}

// TODO: these functions should pass the value of the changed properties,
// and not let the UI query the whole state object

function updateBorder(order: CardOrder) {
  const card = getCardOrStackBase(order);
  if (!card) {
    return;
  }

  // When cards have one or more positive clues, they get a special border.
  card.setBorder();

  // When cards have one or more positive clues, they are raised up in the hand.
  card.setRaiseAndShadowOffset();

  globals.layers.card.batchDraw();
}

function updatePips(order: CardOrder) {
  const card = getCardOrStackBase(order);
  if (!card) {
    return;
  }

  card.updatePips();
  globals.layers.card.batchDraw();
}

export function updateCardVisuals(order: CardOrder): void {
  const card = getCardOrStackBase(order);
  if (!card) {
    return;
  }

  card.setBareImage();
  globals.layers.card.batchDraw();
}

function checkNoteDisproved(order: CardOrder) {
  const card = getCardOrStackBase(order);
  if (!card) {
    return;
  }

  card.checkNoteDisproved();
  globals.layers.card.batchDraw();
}

function updateCardStatus(order: CardOrder) {
  const card = getCardOrStackBase(order);
  if (!card) {
    return;
  }

  card.setStatus();
  globals.layers.card.batchDraw();
}
