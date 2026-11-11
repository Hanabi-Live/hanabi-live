import type { GameAction, GameState } from "@hanabi-live/game";
import { includes } from "complete-common";
import { isOurSeat } from "../../../ourSeat.ts";
import { SoundType } from "../../../types/SoundType.ts";
import { isOurTurn } from "../../isOurTurn.ts";
import { globals } from "../../UiGlobals.ts";
import {
  SOUND_TYPE_ACTIONS,
  getSoundType,
  getStandardSoundType,
} from "../getSoundType.ts";

export function onNewSoundEffect(
  data: {
    gameState: GameState;
    actions: readonly GameAction[];
  },
  previousData:
    | {
        gameState: GameState;
        actions: readonly GameAction[];
      }
    | undefined,
): void {
  const { soundMove } = globals.lobby.settings;

  // On the first load, only play a sound if the game started just now (and not after a refresh or
  // when joining a game in progress). Use the flag once so that observer re-registration cannot
  // play it again.
  const isFirstLoad = previousData === undefined;
  const { playStartSound } = globals;
  if (isFirstLoad) {
    globals.playStartSound = false;
  }

  if (
    // Do not play sounds during resize-driven observer re-registration.
    globals.isResizing
    || (isFirstLoad && !playStartSound)
    // Only make a sound when the game starts or when it is a new player's turn.
    || data.gameState.turn.currentPlayerIndex
      === previousData?.gameState.turn.currentPlayerIndex
    // Do not play sounds in hypotheticals.
    || globals.state.replay.hypothetical !== undefined
    || globals.state.finished
    // Do not play sounds if it is not the user's turn and the user only wants sounds on their own
    // moves.
    || (!isOurTurn() && soundMove === "onlyOwn")
    // Do not play sounds if the user does not have sound effects enabled.
    || soundMove === "none"
  ) {
    return;
  }

  const lastAction = getLastAction(data.actions);

  // `previousData.gameState` might not actually correspond to a different game state, because we
  // are also subscribed to the actions. In other words, this view will fire if an action is added
  // to the array (like a "draw" action). Thus, we have to manually retrieve the penultimate game
  // state.
  const previousGameState = globals.state.replay.states.at(-2);
  const soundType = getSoundType(
    previousGameState,
    data.gameState,
    lastAction,
    globals.metadata,
  );

  const ourTurn = isOurSeat(
    data.gameState.turn.currentPlayerIndex,
    globals.metadata,
  );
  const adjustedSoundType = getAdjustedSoundType(soundType, ourTurn);
  // The turn sound and the game finished sound will be played back-to-back, so we want to mute the
  // former.
  const muteExistingSoundEffects = adjustedSoundType.startsWith("finished-");
  globals.game!.sounds.play(adjustedSoundType, muteExistingSoundEffects);
}

/**
 * The last action will likely be a "draw" action, but we need the last "play" or "discard" action
 * so that we can compute the correct sound to play. Thus, work our way backwards, looking for
 * matching action types.
 */
function getLastAction(actions: readonly GameAction[]): GameAction | undefined {
  const reversedActions = [...actions].toReversed();
  return reversedActions.find((action) =>
    includes(SOUND_TYPE_ACTIONS, action.type),
  );
}

function getAdjustedSoundType(
  soundType: SoundType,
  ourTurn: boolean,
): SoundType {
  const standardSoundType = getStandardSoundType(ourTurn);

  return (
    // Only play certain sound effects for people in the H-Group.
    (soundType === SoundType.OrderChopMove
      || soundType === SoundType.DiscardClued
      || soundType === SoundType.DoubleDiscard
      || soundType === SoundType.DoubleDiscardCause)
      && !globals.lobby.settings.hGroupConventions
      // Disable special sounds in "Throw It in a Hole" variants because they leak information.
      && !globals.variant.throwItInAHole
      ? standardSoundType
      : soundType
  );
}
