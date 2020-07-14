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
    playerNames: [
      'Alice',
      'Bob',
      'Cathy',
      'Donald',
      'Emily',
      'Frank',
    ].slice(0, numPlayers - 1),
    ourPlayerIndex: 0,
    spectating: true,
    characterAssignments: initArray(numPlayers, null),
    characterMetadata: [],
  };
}
