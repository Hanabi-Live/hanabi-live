import type { GameState } from "../../../types/GameState";
import { SoundType } from "../../../types/SoundType";
import type { GameAction } from "../../../types/actions";
import { globals } from "../../UIGlobals";
import { SOUND_TYPE_ACTIONS, getSoundType } from "../getSoundType";

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
  if (
    // Do not play sounds on the initial load (unless it is the first turn).
    (previousData === undefined && data.gameState.turn.turnNum !== 0) ||
    // Only make a sound when the game starts or when it is a new player's turn.
    data.gameState.turn.currentPlayerIndex ===
      previousData?.gameState.turn.currentPlayerIndex ||
    // Do not play sounds in replays or hypotheticals.
    globals.state.finished ||
    // Do not play sounds if the user does not have sound effects enabled.
    !globals.lobby.settings.soundMove
  ) {
    return;
  }

  const lastAction = getLastAction(data.actions);
  const soundType = getSoundType(
    previousData?.gameState,
    data.gameState,
    lastAction,
    globals.metadata,
  );

  const ourTurn =
    globals.metadata.ourPlayerIndex === data.gameState.turn.currentPlayerIndex;
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
  const reversedActions = [...actions].reverse();
  return reversedActions.find((action) =>
    SOUND_TYPE_ACTIONS.includes(action.type),
  );
}

function getAdjustedSoundType(
  soundType: SoundType,
  ourTurn: boolean,
): SoundType {
  let adjustedSoundType = soundType;

  // Only play certain sound effects for people in the H-Group.
  if (
    (soundType === SoundType.OrderChopMove ||
      soundType === SoundType.DiscardClued ||
      soundType === SoundType.DoubleDiscard ||
      soundType === SoundType.DoubleDiscardCause) &&
    !globals.lobby.settings.hyphenatedConventions &&
    // Disable special sounds in "Throw It in a Hole" variants because they leak information.
    !globals.variant.throwItInAHole
  ) {
    adjustedSoundType = SoundType.Standard;
  }

  if (adjustedSoundType === SoundType.Standard) {
    return ourTurn ? SoundType.Us : SoundType.Other;
  }

  return adjustedSoundType;
}
