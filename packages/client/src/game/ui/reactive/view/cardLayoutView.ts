import type { CardOrder, SuitIndex } from "@hanabi/data";
import { ReadonlyMap, assertDefined, assertNotNull } from "@hanabi/utils";
import equal from "fast-deep-equal";
import type Konva from "konva";
import * as deck from "../../../rules/deck";
import { stackStartRank } from "../../../rules/playStacks";
import * as variantRules from "../../../rules/variant";
import type { GameState } from "../../../types/GameState";
import { StackDirection } from "../../../types/StackDirection";
import type { HanabiCard } from "../../HanabiCard";
import type { LayoutChild } from "../../LayoutChild";
import { globals } from "../../UIGlobals";
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
    for (const [i, direction] of directions.entries()) {
      if (
        previousDirections !== undefined &&
        direction === previousDirections[i]
      ) {
        continue;
      }

      const suit = globals.variant.suits[i]!;
      let text = "";
      const isUpOrDown = globals.variant.upOrDown;
      if (isUpOrDown || suit.reversed) {
        const stackStrings = isUpOrDown
          ? STACK_STRINGS_UP_OR_DOWN
          : STACK_STRINGS_REVERSED;

        const stackText = stackStrings.get(direction);
        assertDefined(
          stackText,
          `Failed to find the stack string for the stack direction of: ${direction}`,
        );

        text = stackText;
      }

      globals.elements.suitLabelTexts[i]!.fitText(text);

      const visibleCardsOfThisSuit = globals.deck.filter(
        (card) => card.visibleSuitIndex === i,
      );
      for (const card of visibleCardsOfThisSuit) {
        const suitIndex = i as SuitIndex;
        card.setDirectionArrow(suitIndex, direction);
      }
    }
    globals.layers.UI.batchDraw();
  }
}

export function onHandsChanged(hands: GameState["hands"]): void {
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
  discardStacks: GameState["discardStacks"],
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
  playStacks: GameState["playStacks"],
  previousPlayStacks: GameState["playStacks"] | undefined,
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

  for (const [suitIndex, stack] of playStacks.entries()) {
    if (
      previousPlayStacks === undefined ||
      !equal(stack, previousPlayStacks[suitIndex])
    ) {
      const suit = globals.variant.suits[suitIndex]!;
      const playStack = globals.elements.playStacks.get(suit)!;
      playStack.hideCardsUnderneathTheTopCard();
    }
  }

  if (globals.variant.sudoku) {
    // First, we will find out all available stack starts.
    const availableStackStartsFlags: boolean[] = [true, true, true, true, true];
    for (const playStack of playStacks) {
      const stackStart = stackStartRank(
        playStack,
        globals.state.visibleState!.deck,
      );
      if (stackStart !== null) {
        availableStackStartsFlags[stackStart - 1] = false;
      }
    }
    const availableStackStarts: number[] = [];
    for (const [index, available] of availableStackStartsFlags.entries()) {
      if (available) {
        availableStackStarts.push(index + 1);
      }
    }

    // Now, add the suit label texts, showing current progress or the possible remaining starting
    // values.
    for (const [suitIndex, playStack] of playStacks.entries()) {
      let text = "";
      if (playStack.length === globals.variant.ranks.length) {
        text = "Finished";
      } else if (playStack.length > 0) {
        const firstPlayedCardOrder = playStack[0];
        assertDefined(
          firstPlayedCardOrder,
          `Failed to get the first card order from the play stack at suit index: ${suitIndex}`,
        );
        const firstPlayedCard = globals.deck[firstPlayedCardOrder];
        assertDefined(
          firstPlayedCard,
          `Failed to get the first played card at index: ${firstPlayedCardOrder}`,
        );
        const firstPlayedRank = firstPlayedCard.getCardIdentity().rank;
        assertNotNull(
          firstPlayedRank,
          `Failed to get the rank of the first played card at index: ${firstPlayedCardOrder}`,
        );
        const playedRanks = playStack.map(
          (_stack, rankOffset) => ((rankOffset + firstPlayedRank - 1) % 5) + 1,
        );
        const ranksText =
          playedRanks.join(" ") + " _".repeat(5 - playStack.length);
        text = `[ ${ranksText} ]`;
      } else {
        const bracketText =
          availableStackStarts.length === globals.variant.singleStackSize
            ? "Any"
            : availableStackStarts.join("");
        text = `Start: [${bracketText}]`;
      }
      const fitText = globals.elements.suitLabelTexts[suitIndex];
      assertDefined(
        fitText,
        `Failed to get the fit text at suit index: ${suitIndex}`,
      );
      fitText.fitText(text);
    }
  }

  globals.layers.card.batchDraw();
}

export function onHoleChanged(
  hole: readonly CardOrder[],
  previousHole: readonly CardOrder[] | undefined,
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
  const totalCards = deck.totalCards(globals.variant);
  for (const suitIndex of globals.variant.suits.keys()) {
    const playStackOrder = (totalCards + suitIndex) as CardOrder;
    updateCardVisuals(playStackOrder);
  }
}

function syncChildren(
  collections: ReadonlyArray<readonly CardOrder[]>,
  getCollectionUI: (i: number) => Konva.Container,
  addToCollectionUI: (card: HanabiCard, i: number) => void,
) {
  for (const [i, collection] of collections.entries()) {
    // eslint-disable-next-line func-style
    const getCurrentSorting = () =>
      (getCollectionUI(i).children.toArray() as LayoutChild[])
        .map((layoutChild) => layoutChild.card)
        .filter((card) => !card.isStackBase)
        .map((card) => card.state.order);

    let current = getCurrentSorting();

    // Remove the elements that were removed.
    const removedCardOrders = current.filter((n) => !collection.includes(n));
    const removedCards = removedCardOrders.map(getCard);
    for (const card of removedCards) {
      const realState =
        globals.store?.getState().visibleState?.deck[card!.state.order];
      if (realState === undefined || realState.location === "deck") {
        card!.animateToDeck();
      } else {
        card!.removeLayoutChildFromParent();
      }
    }

    // Add the elements that were added.
    const addedCardOrders = collection.filter((n) => !current.includes(n));
    const addedCards = addedCardOrders.map(getCard);
    for (const card of addedCards) {
      addToCollectionUI(card!, i);
    }

    // Reorder the elements to match the collection.
    for (const [pos, order] of collection.entries()) {
      current = getCurrentSorting();
      if (current.length !== collection.length) {
        throw new Error("The UI collection is out of sync with the state.");
      }

      const card = getCard(order)!;
      const layoutChild = card.parent as unknown as LayoutChild;
      let sourcePosition = current.indexOf(order);
      while (sourcePosition < pos) {
        layoutChild.moveUp();
        sourcePosition++;
      }
      while (sourcePosition > pos) {
        layoutChild.moveDown();
        sourcePosition--;
      }
    }

    // Verify the final result.
    current = getCurrentSorting();
    if (!equal(current, collection)) {
      throw new Error("The UI collection is out of sync with the state.");
    }
  }
}

function getCard(order: CardOrder): HanabiCard | undefined {
  return globals.deck[order];
}
