import Konva from 'konva';
import * as variantRules from '../../../rules/variant';
import StackDirection from '../../../types/StackDirection';
import globals from '../../globals';
import HanabiCard from '../../HanabiCard';
import PlayStack from '../../PlayStack';

export function onStackDirectionsChanged(directions: readonly StackDirection[]) {
  if (!variantRules.hasReversedSuits(globals.variant)) {
    return;
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

  // Update the stack directions (which are only used in the "Up or Down" and "Reversed" variants)
  directions
    .forEach((direction, i) => {
      if (globals.stackDirections[i] === direction) {
        return;
      }

      globals.stackDirections[i] = direction;

      const suit = globals.variant.suits[i];
      let text = '';
      const isUpOrDown = variantRules.isUpOrDown(globals.variant);
      if (isUpOrDown || suit.reversed) {
        const stackStrings = isUpOrDown ? stackStringsUpOrDown : stackStringsReversed;
        if (stackStrings.get(direction) === undefined) {
          throw new Error(`Not a valid stackDirection: ${direction}`);
        }
        text = stackStrings.get(direction)!;
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

export function onHandsChanged(hands: ReadonlyArray<readonly number[]>) {
  removeAndReAddChildren(
    hands,
    (i) => (globals.elements.playerHands[i] as unknown as Konva.Group).removeChildren(),
    (card, i) => card.animateToPlayerHand(i),
  );
}

export function onDiscardStacksChanged(discardStacks: ReadonlyArray<readonly number[]>) {
  removeAndReAddChildren(
    discardStacks,
    (i) => {
      const suit = globals.variant.suits[i];
      const discardStackUI = globals.elements.discardStacks.get(suit)! as unknown as Konva.Group;
      discardStackUI.removeChildren();
    },
    (card) => card.animateToDiscardPile(),
  );
}

export function onPlayStacksChanged(playStacks: ReadonlyArray<readonly number[]>) {
  removeAndReAddChildren(
    playStacks,
    (i) => {
      const suit = globals.variant.suits[i];
      const playStackUI = globals.elements.playStacks.get(suit)! as unknown as PlayStack;
      playStackUI.removeChildren();

      // Re-add the stack base to the play stacks
      const stackBase = globals.stackBases[i];
      const stackBaseLayoutChild = stackBase.parent!;
      playStackUI.addChild(stackBaseLayoutChild as any);

      // The stack base might have been hidden if there was a card on top of it
      stackBaseLayoutChild.visible(true);

      // The stack base might have been morphed
      /*
      TODO
      if (stackBase.state.rank !== 0 || stackBase.state.suitIndex !== i) {
        stackBase.convert(i, 0);
      }
      */
    },
    (card) => card.animateToPlayStacks(),
  );
}

function removeAndReAddChildren(
  collections: ReadonlyArray<readonly number[]>,
  cleanCollectionUI: (i: number) => void,
  addToCollectionUI: (card: HanabiCard, i: number) => void,
) {
  const oldAnimateFast = globals.animateFast;
  globals.animateFast = true;
  collections.forEach((collection, i) => {
    cleanCollectionUI(i);
    for (const card of collection.map((order) => globals.deck[order])) {
      addToCollectionUI(card, i);
    }
  });
  globals.animateFast = oldAnimateFast;
}
