import { DEFAULT_VARIANT_NAME } from '../src/game/types/constants';
import GameMetadata from '../src/game/types/GameMetadata';
import { initArray } from '../src/misc';
import Options from '../src/types/Options';

export default function testMetadata(
  numPlayers: number,
  variantName: string = DEFAULT_VARIANT_NAME,
): GameMetadata {
  return {
    ourUsername: 'Alice',
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
    ].slice(0, numPlayers),
    ourPlayerIndex: 0,
    characterAssignments: initArray(numPlayers, null),
    characterMetadata: [],
  };
}
