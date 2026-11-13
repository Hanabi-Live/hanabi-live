import type { GameMetadata } from "@hanabi-live/game";
import {
  getInitialGameState,
  getTotalCardsInDeck,
  getVariantById,
} from "@hanabi-live/game";
import { newArray } from "complete-common";
import type { State } from "../../types/State.ts";

export function initialState(metadata: GameMetadata): State {
  const gameState = getInitialGameState(metadata);

  const { options } = metadata;
  const variant = getVariantById(options.variantId);
  const totalCardsInDeck = getTotalCardsInDeck(variant);
  // Notes are indexed by card order. The stack bases use the orders after the deck's final card.
  const numNoteOrders = totalCardsInDeck + variant.suits.length;

  return {
    visibleState: undefined,
    ongoingGame: gameState,
    replay: {
      segment: undefined,
      states: [],
      actions: [],

      gameId: undefined,
      shared: undefined,
      ownHypothetical: undefined,
      hypothetical: undefined,
    },

    playing: true,
    shadowing: false,
    finished: false,

    startedAt: undefined,
    finishedAt: undefined,

    notes: {
      ourNotes: newArray(numNoteOrders, {
        possibilities: [],
        chopMoved: false,
        needsFix: false,
        questionMark: false,
        exclamationMark: false,
        spook: false,
        knownTrash: false,
        finessed: false,
        discardPermission: false,
        blank: false,
        unclued: false,
        clued: false,
        text: "",
      }),
      allNotes: newArray(numNoteOrders, []),
      efficiencyModifier: 0,
    },

    metadata,
    cardIdentities: newArray(totalCardsInDeck, {
      suitIndex: undefined,
      rank: undefined,
    }),
    premove: undefined,
    pause: {
      pausingPlayerIndex: undefined,
      queued: false,
    },
    spectators: [],
  };
}
