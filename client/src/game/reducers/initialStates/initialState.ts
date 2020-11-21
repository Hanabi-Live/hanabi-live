import { initArray } from "../../../misc";
import { getVariant } from "../../data/gameData";
import { handRules, statsRules } from "../../rules";
import GameMetadata from "../../types/GameMetadata";
import State from "../../types/State";
import initialGameState from "./initialGameState";

export default function initialState(metadata: GameMetadata): State {
  const game = initialGameState(metadata);

  const { options } = metadata;
  const variant = getVariant(options.variantName);
  const cardsPerHand = handRules.cardsPerHand(options);
  const startingDeckSize = statsRules.startingDeckSize(
    options.numPlayers,
    cardsPerHand,
    variant,
  );

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

    metadata,
    cardIdentities: initArray(startingDeckSize, {
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
