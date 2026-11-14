// The sound that plays when the turn passes to a new player. It plays for both game screens.

import type { GameAction, GameState } from "@hanabi-live/game";
import { getVariantById } from "@hanabi-live/game";
import { includes } from "complete-common";
import * as sounds from "../sounds.ts";
import { store } from "../store.ts";
import {
  SOUND_TYPE_ACTIONS,
  getSoundType,
  getStandardSoundType,
} from "./getSoundType.ts";
import { isOurSeat } from "./ourSeat.ts";
import { SoundType } from "./types/SoundType.ts";
import type { State } from "./types/State.ts";

/** Whether the game that is opening started just now, so that its first turn plays a sound. */
let playStartSound = false;

/** Called when a game opens. A game that started just now plays a sound on its first turn. */
export function setPlayStartSound(justStarted: boolean): void {
  playStartSound = justStarted;
}

export interface SoundData {
  readonly gameState: GameState;
  readonly actions: readonly GameAction[];
}

export function onNewSoundEffect(
  state: State,
  data: SoundData,
  previousData: SoundData | undefined,
): void {
  const { soundMove } = store.getState().session.settings;

  // On the first load, only play a sound if the game started just now (and not after a refresh or
  // when joining a game in progress). Use the flag once, so that a second "gameInit" for the same
  // game cannot play it again.
  const isFirstLoad = previousData === undefined;
  const startSound = playStartSound;
  if (isFirstLoad) {
    playStartSound = false;
  }

  const ourTurn = isOurSeat(
    data.gameState.turn.currentPlayerIndex,
    state.metadata,
  );

  if (
    (isFirstLoad && !startSound)
    // Only make a sound when the game starts or when it is a new player's turn.
    || data.gameState.turn.currentPlayerIndex
      === previousData?.gameState.turn.currentPlayerIndex
    // Do not play sounds in hypotheticals.
    || state.replay.hypothetical !== undefined
    || state.finished
    // Do not play sounds if it is not the user's turn and the user only wants sounds on their own
    // moves.
    || (!(state.playing && ourTurn) && soundMove === "onlyOwn")
    // Do not play sounds if the user does not have sound effects enabled.
    || soundMove === "none"
  ) {
    return;
  }

  const lastAction = getLastAction(data.actions);

  // `previousData.gameState` might not actually correspond to a different game state, because we
  // are also subscribed to the actions. In other words, this fires if an action is added to the
  // array (like a "draw" action). Thus, we have to manually retrieve the penultimate game state.
  const previousGameState = state.replay.states.at(-2);
  const soundType = getSoundType(
    previousGameState,
    data.gameState,
    lastAction,
    state.metadata,
  );

  const adjustedSoundType = getAdjustedSoundType(
    soundType,
    ourTurn,
    getVariantById(state.metadata.options.variantId).throwItInAHole,
  );
  // The turn sound and the game finished sound will be played back-to-back, so we want to mute the
  // former.
  const muteExistingSoundEffects = adjustedSoundType.startsWith("finished-");
  sounds.play(adjustedSoundType, muteExistingSoundEffects);
}

/**
 * The last action will likely be a "draw" action, but we need the last "play" or "discard" action
 * so that we can compute the correct sound to play. Thus, work our way backwards, looking for
 * matching action types.
 */
function getLastAction(actions: readonly GameAction[]): GameAction | undefined {
  return actions.findLast((action) =>
    includes(SOUND_TYPE_ACTIONS, action.type),
  );
}

function getAdjustedSoundType(
  soundType: SoundType,
  ourTurn: boolean,
  throwItInAHole: boolean,
): SoundType {
  const standardSoundType = getStandardSoundType(ourTurn);

  return (
    // Only play certain sound effects for people in the H-Group.
    (soundType === SoundType.OrderChopMove
      || soundType === SoundType.DiscardClued
      || soundType === SoundType.DoubleDiscard
      || soundType === SoundType.DoubleDiscardCause)
      && !store.getState().session.settings.hGroupConventions
      // Disable special sounds in "Throw It in a Hole" variants because they leak information.
      && !throwItInAHole
      ? standardSoundType
      : soundType
  );
}
