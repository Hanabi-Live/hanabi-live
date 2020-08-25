/* eslint-disable import/prefer-default-export */

import { ensureAllCases } from '../../../../misc';
import { GameAction } from '../../../types/actions';
import SoundType from '../../../types/SoundType';
import globals from '../../globals';

export const onNewSoundEffect = (data: {
  soundType: SoundType;
  currentPlayerIndex: number | null;
  turn: number;
  lastAction: GameAction | null;
}, previousData: {
  soundType: SoundType;
  currentPlayerIndex: number | null;
  turn: number;
  lastAction: GameAction | null;
} | undefined) => {
  if (
    // Don't play sounds on the initial load (unless it is the first turn)
    (previousData === undefined && data.turn !== 0)
    // Only make a sound when the game starts or when it is a new player's turn
    || data.currentPlayerIndex === previousData?.currentPlayerIndex
    // Don't play sounds in replays or hypotheticals
    || globals.state.finished
    // Don't play sounds if the user does not have sound effects enabled
    || !globals.lobby.settings.soundMove
  ) {
    return;
  }

  // Only play certain sound effects for people in the Hyphen-ated Group
  if (
    (
      data.soundType === SoundType.OneOutOfOrder
      || data.soundType === SoundType.DiscardClued
      || data.soundType === SoundType.DoubleDiscard
      || data.soundType === SoundType.DoubleDiscardCause
    )
    && !globals.lobby.settings.hyphenatedConventions
  ) {
    data.soundType = SoundType.Standard;
  }

  const ourTurn = globals.state.metadata.ourPlayerIndex === data.currentPlayerIndex;
  const fileNameSuffix = getFileName(data.soundType, ourTurn);
  const fileName = `turn_${fileNameSuffix}`;
  // The turn sound and the game finished sound will be played back-to-back,
  // so we want to mute the former
  const muteExistingSoundEffects = fileNameSuffix.startsWith('finished_');
  globals.game!.sounds.play(fileName, muteExistingSoundEffects);
};

const getFileName = (soundType: SoundType, ourTurn: boolean) => {
  switch (soundType) {
    case SoundType.Standard: {
      return ourTurn ? 'us' : 'other';
    }

    case SoundType.Fail1: {
      return 'fail1';
    }

    case SoundType.Fail2: {
      return 'fail2';
    }

    case SoundType.Blind1: {
      return 'blind1';
    }

    case SoundType.Blind2: {
      return 'blind2';
    }

    case SoundType.Blind3: {
      return 'blind3';
    }

    case SoundType.Blind4: {
      return 'blind4';
    }

    case SoundType.Blind5: {
      return 'blind5';
    }

    case SoundType.Blind6: {
      return 'blind6';
    }

    case SoundType.OneOutOfOrder: {
      return '1s';
    }

    case SoundType.DiscardClued: {
      return 'discard_clued';
    }

    case SoundType.DoubleDiscard: {
      return 'double_discard';
    }

    case SoundType.DoubleDiscardCause: {
      return 'double_discard_cause';
    }

    case SoundType.Sad: {
      return 'sad';
    }

    case SoundType.Moo: {
      return 'moo';
    }

    case SoundType.Oink: {
      return 'oink';
    }

    case SoundType.Quack: {
      return 'quack';
    }

    case SoundType.FinishedSuccess: {
      return 'finished_success';
    }

    case SoundType.FinishedFail: {
      return 'finished_fail';
    }

    case SoundType.FinishedPerfect: {
      return 'finished_perfect';
    }

    default: {
      ensureAllCases(soundType);
      throw new Error(`Failed to find the file name for a sound type of ${soundType}.`);
    }
  }
};
