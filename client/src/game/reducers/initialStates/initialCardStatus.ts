import { initArray } from '../../../misc';
import { cardRules } from '../../rules';
import Variant from '../../types/Variant';

export default function initialCardStatus(variant: Variant) {
  const cardStatus: number[][] = [];

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    cardStatus.push([]);
    for (const rank of variant.ranks) {
      cardStatus[suitIndex][rank] = cardRules.status(
        suitIndex,
        rank,
        [],
        initArray(variant.suits.length, []),
        [],
        variant,
      );
    }
  }

  return cardStatus;
}
