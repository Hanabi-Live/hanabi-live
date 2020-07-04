import * as variantRules from '../../../rules/variant';
import StackDirection from '../../../types/StackDirection';
import globals from '../../globals';

/* eslint-disable import/prefer-default-export */
export function onStackDirectionsChanged(directions: readonly StackDirection[]) {
  if (!variantRules.hasReversedSuits(globals.variant)) {
    return;
  }

  // Update the stack directions (which are only used in the "Up or Down" and "Reversed" variants)
  directions
    .filter((direction, i) => direction !== globals.stackDirections[i])
    .forEach((direction, i) => {
      globals.stackDirections[i] = direction;

      const suit = globals.variant.suits[i];
      let text = '';
      const isUpOrDown = variantRules.isUpOrDown(globals.variant);
      if (isUpOrDown || suit.reversed) {
        const stackStrings = isUpOrDown ? stackStringsUpOrDown : stackStringsReversed;
        text = stackStrings.get(direction) || 'Unknown';
      }

      globals.elements.suitLabelTexts[i].fitText(text);
      if (!globals.animateFast) {
        globals.layers.UI.batchDraw();
      }

      // TODO: direction arrow should be in state,
      // or calculated from state
      globals.deck
        .filter((c) => c.state?.suitIndex === i)
        .forEach((c) => c.setDirectionArrow(i));
    });
}

const stackStringsReversed = new Map<StackDirection, string>([
  [StackDirection.Undecided, ''],
  [StackDirection.Up, ''],
  [StackDirection.Down, 'Reversed'],
  [StackDirection.Finished, 'Reversed'],
]);

const stackStringsUpOrDown = new Map<StackDirection, string>([
  [StackDirection.Undecided, ''],
  [StackDirection.Up, 'Up'],
  [StackDirection.Down, 'Down'],
  [StackDirection.Finished, 'Finished'],
]);
