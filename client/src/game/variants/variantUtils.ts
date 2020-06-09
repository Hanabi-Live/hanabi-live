import { MAX_CLUE_NUM } from '../types/constants';
import Variant from '../types/Variant';

export function getTotalCardsInTheDeck(variant: Variant) {
  let totalCardsInTheDeck = 0;
  for (const suit of variant.suits) {
    totalCardsInTheDeck += 10;
    if (suit.oneOfEach) {
      totalCardsInTheDeck -= 5;
    } else if (variant.name.startsWith('Up or Down')) {
      totalCardsInTheDeck -= 1;
    }
  }
  return totalCardsInTheDeck;
}

// Gain a clue by discarding or finishing a stack
export function gainClue(variant: Variant, clueTokens: number) {
  if (clueTokens === MAX_CLUE_NUM) {
    return clueTokens;
  }
  if (variant.name.startsWith('Clue Starved')) {
    // In "Clue Starved" variants, each discard gives only half a clue.
    return clueTokens + 0.5;
  }
  return clueTokens + 1;
}
