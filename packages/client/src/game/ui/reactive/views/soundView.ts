import type { GameAction, GameState } from "@hanabi-live/game";
import { includes } from "complete-common";
import { SoundType } from "../../../types/SoundType";
import { isOurTurn } from "../../isOurTurn";
import { globals } from "../../UIGlobals";
import {
  SOUND_TYPE_ACTIONS,
  getSoundType,
  getStandardSoundType,
} from "../getSoundType";

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
  const SoundMoveAll = 0;
  const SoundMoveOnlyOwn = 1;
  const SoundMoveNone = 2;

  const soundMove = globals.lobby.settings.soundMove ?? SoundMoveAll;

  if (
    // Do not play sounds on the initial load (unless it is the first turn).
    (previousData === undefined && data.gameState.turn.turnNum !== 0)
    // Only make a sound when the game starts or when it is a new player's turn.
    || data.gameState.turn.currentPlayerIndex
      === previousData?.gameState.turn.currentPlayerIndex
    // Do not play sounds in replays or hypotheticals.
    || globals.state.finished
    // Do not play sounds if it is not the user's turn and the user only wants sounds on their own
    // moves.
    || (soundMove === SoundMoveOnlyOwn && !isOurTurn())
    // Do not play sounds if the user does not have sound effects enabled.
    || soundMove === SoundMoveNone
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
      && !globals.lobby.settings.hyphenatedConventions
      // Disable special sounds in "Throw It in a Hole" variants because they leak information.
      && !globals.variant.throwItInAHole
      ? standardSoundType
      : soundType
  );
}
