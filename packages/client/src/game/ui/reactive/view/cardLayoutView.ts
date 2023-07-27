import { STACK_BASE_RANK, UNKNOWN_CARD_RANK } from "@hanabi/data";
import equal from "fast-deep-equal";
import { ReadonlyMap } from "isaacscript-common-ts";
import Konva from "konva";
import * as deck from "../../../rules/deck";
import { stackStartRank } from "../../../rules/playStacks";
import * as variantRules from "../../../rules/variant";
import { StackDirection } from "../../../types/StackDirection";
import { globals } from "../../globals";
import { HanabiCard } from "../../HanabiCard";
import { LayoutChild } from "../../LayoutChild";
import { updateCardVisuals } from "./cardsView";

const STACK_STRINGS_REVERSED = new ReadonlyMap<StackDirection, string>([
  [StackDirection.Undecided, ""],
  [StackDirection.Up, ""],
  [StackDirection.Down, "Reversed"],
  [StackDirection.Finished, "Reversed"],
]);

const STACK_STRINGS_UP_OR_DOWN = new ReadonlyMap<StackDirection, string>([
  [StackDirection.Undecided, ""],
  [StackDirection.Up, "Up"],
  [StackDirection.Down, "Down"],
  [StackDirection.Finished, "Finished"],
]);

export function onPlayStackDirectionsChanged(
  directions: readonly StackDirection[],
  previousDirections: readonly StackDirection[] | undefined,
): void {
  if (variantRules.hasReversedSuits(globals.variant)) {
    // Update the stack directions (which are only used in the "Up or Down" and "Reversed"
    // variants).
    directions.forEach((direction, i) => {
      if (
        previousDirections !== undefined &&
        direction === previousDirections[i]
      ) {
        return;
      }

      const suit = globals.variant.suits[i]!;
      let text = "";
      const isUpOrDown = variantRules.isUpOrDown(globals.variant);
      if (isUpOrDown || suit.reversed) {
        const stackStrings = isUpOrDown
          ? STACK_STRINGS_UP_OR_DOWN
          : STACK_STRINGS_REVERSED;
        const stackText = stackStrings.get(direction);
        if (stackText === undefined) {
          throw new Error(
            `Failed to find the stack string for the stack direction of: ${direction}`,
          );
        }
        text = stackText;
      }

      globals.elements.suitLabelTexts[i]!.fitText(text);

      globals.deck
        .filter((c) => c.visibleSuitIndex === i)
        .forEach((c) => {
          c.setDirectionArrow(i, direction);
        });
    });
    globals.layers.UI.batchDraw();
  }
}

export function onHandsChanged(hands: ReadonlyArray<readonly number[]>): void {
  syncChildren(
    hands,
    (i) => globals.elements.playerHands[i] as unknown as Konva.Container,
    (card, i) => {
      card.animateToPlayerHand(i);
    },
  );

  globals.layers.card.batchDraw();
}

export function onDiscardStacksChanged(
  discardStacks: ReadonlyArray<readonly number[]>,
): void {
  syncChildren(
    discardStacks,
    (i) => {
      const suit = globals.variant.suits[i]!;
      return globals.elements.discardStacks.get(
        suit,
      )! as unknown as Konva.Container;
    },
    (card) => {
      if (card.state.isMisplayed) {
        card.layout.doMisplayAnimation = true;
      }
      card.animateToDiscardPile();
    },
  );

  globals.layers.card.batchDraw();
}

export function onPlayStacksChanged(
  playStacks: ReadonlyArray<readonly number[]>,
  previousPlayStacks: ReadonlyArray<readonly number[]> | undefined,
): void {
  syncChildren(
    playStacks,
    (i) => {
      const suit = globals.variant.suits[i]!;
      return globals.elements.playStacks.get(
        suit,
      )! as unknown as Konva.Container;
    },
    (card) => {
      card.animateToPlayStacks();
    },
  );

  playStacks.forEach((stack, i) => {
    if (
      previousPlayStacks === undefined ||
      !equal(stack, previousPlayStacks[i])
    ) {
      const suit = globals.variant.suits[i]!;
      const playStack = globals.elements.playStacks.get(suit)!;
      playStack.hideCardsUnderneathTheTopCard();
    }
  });

  if (variantRules.isSudoku(globals.variant)) {
    // First, we will find out all available stack starts.

    const availableStackStartsFlags: boolean[] = [true, true, true, true, true];
    playStacks.forEach((playStack) => {
      const stackStart = stackStartRank(
        playStack,
        globals.state.visibleState!.deck,
        globals.variant,
      );
      if (stackStart !== UNKNOWN_CARD_RANK) {
        availableStackStartsFlags[stackStart - 1] = false;
      }
    });
    const availableStackStarts: number[] = [];
    availableStackStartsFlags.forEach((available, index) => {
      if (available) {
        availableStackStarts.push(index + 1);
      }
    });

    // Now, add the suit label texts, showing current progress or the possible remaining starting
    // values.
    playStacks.forEach((stack, i) => {
      let text = "";
      if (stack.length === 5) {
        text = "Finished";
      } else if (stack.length !== 0) {
        const stackStart = globals.deck[stack[0]!]!.visibleRank!;
        const playedRanks = Array.from(
          { length: stack.length },
          (_, rankOffset) => ((rankOffset + stackStart - 1) % 5) + 1,
        );
        text = `[ ${playedRanks.join(" ")}${Array(6 - stack.length).join(
          " _",
        )} ]`;
      } else {
        text = `Start: [${availableStackStarts.join("")}]`;
      }
      globals.elements.suitLabelTexts[i]!.fitText(text);
    });
  }

  globals.layers.card.batchDraw();
}

export function onHoleChanged(
  hole: readonly number[],
  previousHole: readonly number[] | undefined,
): void {
  if (previousHole === undefined) {
    return;
  }
  syncChildren(
    [hole],
    () => globals.elements.playStacks.get("hole") as unknown as Konva.Container,
    (card) => {
      card.animateToHole();
    },
  );

  globals.layers.card.batchDraw();
}

export function updatePlayStackVisuals(): void {
  const totalCards: number = deck.totalCards(globals.variant);
  for (let i = 0; i < globals.variant.suits.length; i++) {
    updateCardVisuals(totalCards + i);
  }
}

function syncChildren(
  collections: ReadonlyArray<readonly number[]>,
  getCollectionUI: (i: number) => Konva.Container,
  addToCollectionUI: (card: HanabiCard, i: number) => void,
) {
  const getCard = (order: number) => globals.deck[order];

  collections.forEach((collection, i) => {
    const getCurrentSorting = () =>
      (getCollectionUI(i).children.toArray() as LayoutChild[])
        .map((layoutChild) => layoutChild.card)
        .filter((card) => card.state.rank !== STACK_BASE_RANK)
        .map((card) => card.state.order);

    let current = getCurrentSorting();

    // Remove the elements that were removed.
    current
      .filter((n) => !collection.includes(n))
      .map(getCard)
      .forEach((card) => {
        const realState =
          globals.store?.getState().visibleState?.deck[card!.state.order];
        if (realState === undefined || realState.location === "deck") {
          card!.animateToDeck();
        } else {
          card!.removeLayoutChildFromParent();
        }
      });

    // Add the elements that were added.
    collection
      .filter((n) => !current.includes(n))
      .map(getCard)
      .forEach((card) => {
        addToCollectionUI(card!, i);
      });

    // Reorder the elements to match the collection.
    collection.forEach((order, pos) => {
      current = getCurrentSorting();
      if (current.length !== collection.length) {
        throw new Error("The UI collection is out of sync with the state.");
      }

      const layoutChild = getCard(order)!.parent as unknown as LayoutChild;
      let sourcePosition = current.indexOf(order);
      while (sourcePosition < pos) {
        layoutChild.moveUp();
        sourcePosition++;
      }
      while (sourcePosition > pos) {
        layoutChild.moveDown();
        sourcePosition--;
      }
    });

    // Verify the final result.
    current = getCurrentSorting();
    if (!equal(current, collection)) {
      throw new Error("The UI collection is out of sync with the state.");
    }
  });
}
