import equal from 'fast-deep-equal';
import Konva from 'konva';
import { variantRules } from '../../../rules';
import { STACK_BASE_RANK } from '../../../types/constants';
import StackDirection from '../../../types/StackDirection';
import globals from '../../globals';
import HanabiCard from '../../HanabiCard';
import LayoutChild from '../../LayoutChild';

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

export const onPlayStackDirectionsChanged = (
  directions: readonly StackDirection[],
  previousDirections: readonly StackDirection[] | undefined,
) => {
  if (!variantRules.hasReversedSuits(globals.variant)) {
    return;
  }

  // Update the stack directions (which are only used in the "Up or Down" and "Reversed" variants)
  directions.forEach((direction, i) => {
    if (previousDirections !== undefined && direction === previousDirections[i]) {
      return;
    }

    const suit = globals.variant.suits[i];
    let text = '';
    const isUpOrDown = variantRules.isUpOrDown(globals.variant);
    if (isUpOrDown || suit.reversed) {
      const stackStrings = isUpOrDown ? stackStringsUpOrDown : stackStringsReversed;
      const stackText = stackStrings.get(direction);
      if (stackText === undefined) {
        throw new Error(`Failed to find the stack string for the stack direction of ${direction}.`);
      }
      text = stackText;
    }

    globals.elements.suitLabelTexts[i].fitText(text);

    globals.deck
      .filter((c) => c.visibleSuitIndex === i)
      .forEach((c) => c.setDirectionArrow(i, direction));
  });

  globals.layers.UI.batchDraw();
};

export const onHandsChanged = (hands: ReadonlyArray<readonly number[]>) => {
  syncChildren(
    hands,
    (i) => globals.elements.playerHands[i] as unknown as Konva.Container,
    (card, i) => card.animateToPlayerHand(i),
  );

  globals.layers.card.batchDraw();
};

export const onDiscardStacksChanged = (discardStacks: ReadonlyArray<readonly number[]>) => {
  syncChildren(
    discardStacks,
    (i) => {
      const suit = globals.variant.suits[i];
      return globals.elements.discardStacks.get(suit)! as unknown as Konva.Container;
    },
    (card) => {
      if (card.state.isMisplayed) {
        card.layout.doMisplayAnimation = true;
      }
      card.animateToDiscardPile();
    },
  );

  globals.layers.card.batchDraw();
};

export const onPlayStacksChanged = (
  playStacks: ReadonlyArray<readonly number[]>,
  previousPlayStacks: ReadonlyArray<readonly number[]> | undefined,
) => {
  syncChildren(
    playStacks,
    (i) => {
      const suit = globals.variant.suits[i];
      return globals.elements.playStacks.get(suit)! as unknown as Konva.Container;
    },
    (card) => card.animateToPlayStacks(),
  );

  playStacks.forEach((stack, i) => {
    if (previousPlayStacks === undefined || !equal(stack, previousPlayStacks[i])) {
      const suit = globals.variant.suits[i];
      const playStack = globals.elements.playStacks.get(suit)!;
      playStack.hideCardsUnderneathTheTopCard();
    }
  });

  globals.layers.card.batchDraw();
};

export const onHoleChanged = (
  hole: readonly number[],
  previousHole: readonly number[] | undefined,
) => {
  if (previousHole === undefined) {
    return;
  }
  syncChildren(
    [hole],
    () => globals.elements.playStacks.get('hole') as unknown as Konva.Container,
    (card) => card.animateToHole(),
  );

  globals.layers.card.batchDraw();
};

const syncChildren = (
  collections: ReadonlyArray<readonly number[]>,
  getCollectionUI: (i: number) => Konva.Container,
  addToCollectionUI: (card: HanabiCard, i: number) => void,
) => {
  const getCard = (order: number) => globals.deck[order];

  collections.forEach((collection, i) => {
    const getCurrentSorting = () => (getCollectionUI(i).children.toArray() as LayoutChild[])
      .map((layoutChild) => layoutChild.card)
      .filter((card) => card.state.rank !== STACK_BASE_RANK)
      .map((card) => card.state.order);

    let current = getCurrentSorting();

    // Remove the elements that were removed
    current
      .filter((n) => !collection.includes(n))
      .map(getCard)
      .forEach((card) => {
        const realState = globals.store?.getState().visibleState?.deck[card.state.order];
        if (!realState || realState.location === 'deck') {
          card.animateToDeck();
        } else {
          card.removeLayoutChildFromParent();
        }
      });

    // Add the elements that were added
    collection
      .filter((n) => !current.includes(n))
      .map(getCard)
      .forEach((card) => addToCollectionUI(card, i));

    // Reorder the elements to match the collection
    collection.forEach((order, pos) => {
      current = getCurrentSorting();
      if (current.length !== collection.length) {
        throw new Error('The UI collection is out of sync with the state.');
      }

      const layoutChild = getCard(order).parent as unknown as LayoutChild;
      let sourcePosition = current.indexOf(order);
      while (sourcePosition < pos) {
        layoutChild.moveUp();
        sourcePosition += 1;
      }
      while (sourcePosition > pos) {
        layoutChild.moveDown();
        sourcePosition -= 1;
      }
    });

    // Verify the final result
    current = getCurrentSorting();
    if (!equal(current, collection)) {
      throw new Error('The UI collection is out of sync with the state.');
    }
  });
};
