import type { GameMetadata } from "@hanabi-live/game";
import {
  getInitialGameState,
  getTotalCardsInDeck,
  getVariant,
} from "@hanabi-live/game";
import { newArray } from "complete-common";
import type { State } from "../../types/State";

export function initialState(metadata: GameMetadata): State {
  const gameState = getInitialGameState(metadata);

  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const totalCardsInDeck = getTotalCardsInDeck(variant);

  return {
    visibleState: null,
    ongoingGame: gameState,
    replay: {
      active: false,
      segment: 0,
      states: [],
      actions: [],

      databaseID: null,
      shared: null,
      hypothetical: null,
    },

    playing: true,
    shadowing: false,
    finished: false,

    datetimeStarted: null,
    datetimeFinished: null,

    // The array needs to be longer than just the total cards in the deck because we also need to
    // account for notes on a stack base.
    notes: {
      ourNotes: newArray(totalCardsInDeck + variant.suits.length + 1, {
        possibilities: [],
        chopMoved: false,
        needsFix: false,
        questionMark: false,
        exclamationMark: false,
        knownTrash: false,
        finessed: false,
        discardPermission: false,
        blank: false,
        unclued: false,
        clued: false,
        text: "",
      }),
      allNotes: newArray(totalCardsInDeck + variant.suits.length + 1, []),
      efficiencyModifier: 0,
    },

    metadata,
    cardIdentities: newArray(totalCardsInDeck, {
      suitIndex: null,
      rank: null,
    }),
    premove: null,
    pause: {
      active: false,
      playerIndex: 0,
      queued: false,
    },
    spectators: [],
    UI: {
      cardDragged: null,
    },
  };
}
