import { initArray } from '../../../misc';
import { DEFAULT_VARIANT_NAME } from '../../types/constants';
import GameMetadata from '../../types/GameMetadata';
import Options from '../../types/Options';

export default function initialMetadata(
  numPlayers: number,
  variantName: string = DEFAULT_VARIANT_NAME,
): GameMetadata {
  return {
    options: {
      ...(new Options()),
      numPlayers,
      variantName,
    },
    playerSeat: null,
    spectating: false,
    characterAssignments: initArray(numPlayers, null),
    characterMetadata: [],
  };
}
