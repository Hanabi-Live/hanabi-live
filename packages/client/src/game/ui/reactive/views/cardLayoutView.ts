import type {
  CardOrder,
  GameState,
  StackDirection,
  SuitIndex,
} from "@hanabi-live/game";
import { getTotalCardsInDeck, hasReversedSuits } from "@hanabi-live/game";
import equal from "fast-deep-equal";
import type Konva from "konva";
import { store } from "../../../../store.ts";
import { areReplayAnimationsOn } from "../../../replayAnimations.ts";
import {
  getStackDirectionLabel,
  getSudokuStackLabels,
} from "../../../stackLabels.ts";
import type { HanabiCard } from "../../HanabiCard.ts";
import type { LayoutChild } from "../../LayoutChild.ts";
import { globals } from "../../UiGlobals.ts";
import { CARD_ANIMATION_LENGTH_SECONDS } from "../../constants.ts";
import {
  startMaxScoreDropAnimation,
  stopMaxScoreDropAnimation,
} from "../../signalAnimations.ts";
import { startStackCompleteAnimation } from "../../stackCompleteAnimation.ts";
import { updateCardVisuals } from "./cardsView.ts";

export function onPlayStackDirectionsChanged(
  directions: readonly StackDirection[],
  previousDirections: readonly StackDirection[] | undefined,
): void {
  if (!hasReversedSuits(globals.variant)) {
    return;
  }

  // Update the stack directions (which are only used in the "Up or Down" and "Reversed" variants).
  for (const [i, direction] of directions.entries()) {
    if (
      previousDirections !== undefined
      && direction === previousDirections[i]
    ) {
      continue;
    }

    const text = getStackDirectionLabel(
      globals.variant,
      i as SuitIndex,
      direction,
    );
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
      return globals.elements.discardStacks.get(suit)!;
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

interface StackCompletionData {
  playStacks: GameState["playStacks"];
  clueTokens: number;
  score: number;
}

/** Celebrates a card that completes its play stack. */
export function onStackCompletionDataChanged(
  data: StackCompletionData,
  previousData: StackCompletionData | undefined,
): void {
  // Celebrate only in a game in progress, not in a replay (unless the `animations()` console
  // command is on), and not with reduced motion.
  if (
    previousData === undefined
    || globals.animateFast
    || store.getState().session.settings.reducedMotion
    || (globals.state.replay.segment !== undefined && !areReplayAnimationsOn())
  ) {
    return;
  }

  const { stackSize } = globals.variant;
  for (const [suitIndex, stack] of data.playStacks.entries()) {
    const previousStack = previousData.playStacks[suitIndex];
    if (stack.length !== stackSize || previousStack?.length !== stackSize - 1) {
      continue;
    }

    const card = globals.deck[stack.at(-1)!];
    if (card === undefined) {
      continue;
    }
    const suit = globals.variant.suits[suitIndex]!;
    const playStack = globals.elements.playStacks.get(suit)!;
    const gainedClue = data.clueTokens > previousData.clueTokens;
    const { layout } = card;
    layout.stopAnimations();
    layout.stackCompleteAnimation = startStackCompleteAnimation(
      layout,
      playStack,
      gainedClue ? previousData.clueTokens : undefined,
      data.score === globals.variant.maxScore,
      () => {
        layout.stackCompleteAnimation = undefined;
      },
    );
  }
}

interface MaxScoreData {
  maxScore: number;
  discardStacks: GameState["discardStacks"];
}

/** Shows when a lost card lowers the maximum score. */
export function onMaxScoreOrDiscardStacksChanged(
  data: MaxScoreData,
  previousData: MaxScoreData | undefined,
): void {
  if (previousData === undefined || data.maxScore === previousData.maxScore) {
    return;
  }

  stopMaxScoreDropAnimation();
  // Show it only in a game in progress, not in a replay (unless the `animations()` console command
  // is on). Skip it when going backwards or with reduced motion.
  if (
    globals.animateFast
    || data.maxScore > previousData.maxScore
    || store.getState().session.settings.reducedMotion
    || (globals.state.replay.segment !== undefined && !areReplayAnimationsOn())
  ) {
    return;
  }

  // Find the card that was just lost.
  const previousDiscards = new Set(previousData.discardStacks.flat());
  const order = data.discardStacks
    .flat()
    .find((discardedOrder) => !previousDiscards.has(discardedOrder));
  const layoutChild =
    order === undefined ? undefined : globals.deck[order]?.layout;
  const delay =
    layoutChild?.misplayAnimation?.seconds ?? CARD_ANIMATION_LENGTH_SECONDS;
  startMaxScoreDropAnimation(layoutChild, previousData.maxScore, delay);
}

export function onPlayStacksChanged(
  playStacks: GameState["playStacks"],
  previousPlayStacks: GameState["playStacks"] | undefined,
): void {
  syncChildren(
    playStacks,
    (i) => {
      const suit = globals.variant.suits[i]!;
      return globals.elements.playStacks.get(suit)!;
    },
    (card) => {
      card.animateToPlayStacks();
    },
  );

  for (const [suitIndex, stack] of playStacks.entries()) {
    if (
      previousPlayStacks !== undefined
      && equal(stack, previousPlayStacks[suitIndex])
    ) {
      continue;
    }

    const suit = globals.variant.suits[suitIndex]!;
    const playStack = globals.elements.playStacks.get(suit)!;
    playStack.hideCardsUnderneathTheTopCard();
  }

  if (globals.variant.sudoku) {
    const labels = getSudokuStackLabels(
      globals.variant,
      playStacks,
      globals.state.visibleState!.playStackStarts,
    );
    for (const [suitIndex, text] of labels.entries()) {
      globals.elements.suitLabelTexts[suitIndex]?.fitText(text);
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
  const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
  for (const suitIndex of globals.variant.suits.keys()) {
    const playStackOrder = (totalCardsInDeck + suitIndex) as CardOrder;
    updateCardVisuals(playStackOrder);
  }
}

function syncChildren(
  collections: ReadonlyArray<readonly CardOrder[]>,
  getCollectionUi: (i: number) => Konva.Container,
  addToCollectionUi: (card: HanabiCard, i: number) => void,
) {
  for (const [i, collection] of collections.entries()) {
    // eslint-disable-next-line func-style
    const getCurrentSorting = () =>
      ([...getCollectionUi(i).children] as LayoutChild[])
        .map((layoutChild) => layoutChild.card)
        .filter((card) => !card.isStackBase)
        .map((card) => card.order);

    let current = getCurrentSorting();

    // Remove the elements that were removed.
    const removedCardOrders = current.filter((n) => !collection.includes(n));
    const removedCards = removedCardOrders.map(getCard);
    for (const card of removedCards) {
      const realState =
        store.getState().game.current?.visibleState?.deck[card!.order];
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
      addToCollectionUi(card!, i);
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
