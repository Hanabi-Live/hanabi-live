import { DEFAULT_VARIANT_NAME } from '../src/game/types/constants';
import GameMetadata from '../src/game/types/GameMetadata';
import Options from '../src/game/types/Options';
import { initArray } from '../src/misc';

export default function testMetadata(
  numPlayers: number,
  variantName: string = DEFAULT_VARIANT_NAME,
): GameMetadata {
  return {
    options: {
      ...(new Options()),
      numPlayers,
      variantName,
    },
    ourPlayerIndex: 0,
    spectating: true,
    replay: false,
    characterAssignments: initArray(numPlayers, null),
    characterMetadata: [],
  };
}
