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

    ourNotes: initArray(totalCards, {
        possibilities: [],
        chopMoved: false,
        needsFix: false,
        knownTrash: false,
        finessed: false,
        blank: false,
        unclued: false,
        text: '',
    }),
    allNotes: initArray(totalCards, []),

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
