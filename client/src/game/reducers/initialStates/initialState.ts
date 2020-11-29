import { initArray } from "../../../misc";
import { getVariant } from "../../data/gameData";
import { deckRules } from "../../rules";
import GameMetadata from "../../types/GameMetadata";
import State from "../../types/State";
import initialGameState from "./initialGameState";

export default function initialState(metadata: GameMetadata): State {
  const game = initialGameState(metadata);

  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const totalCards = deckRules.totalCards(variant);

  return {
    visibleState: null,
    ongoingGame: game,
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
    finished: false,

    datetimeStarted: null,
    datetimeFinished: null,

    // because of play stack notes (e.g. throw it in a hole)
    // need a slightly larger array
    notes: {
      ourNotes: initArray(totalCards + variant.suits.length + 1, {
        possibilities: [],
        chopMoved: false,
        needsFix: false,
        knownTrash: false,
        finessed: false,
        blank: false,
        unclued: false,
        text: "",
      }),
      allNotes: initArray(totalCards + variant.suits.length + 1, []),
    },

    metadata,
    cardIdentities: initArray(totalCards, {
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
  };
}
