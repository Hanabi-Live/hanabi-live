// Moves the cards of the redesigned game screen from where they were to where they are, when the
// game advances or the replay steps through a turn, and shows the changes of the score.

import type { CardOrder, GameState, StateClue } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { store } from "../../store.ts";
import { currentVariant } from "../gameSession.ts";
import { areReplayAnimationsOn } from "../replayAnimations.ts";
import type { State } from "../types/State.ts";
import type { CardPositions, MoveEffects } from "./cardMotion.ts";
import {
  animateCardMoves,
  animateClue,
  areCardsMoving,
  DECK_KEY,
  MAX_ANIMATED_SEGMENT_CHANGE,
  measureCards,
  measureMovingCards,
  revealMovedCardMarkers,
  stopCardMoves,
} from "./cardMotion.ts";
import { useWindowSize } from "./hooks.ts";
import type { Misplay } from "./playMotion.ts";
import { stopPlayEffects } from "./playMotion.ts";
import {
  animateEmptyDeck,
  animateFinale,
  animateMaxScoreDrop,
  animateStackComplete,
  finishScoreSignals,
  stopFinale,
} from "./scoreMotion.ts";
import { getScreenScaleForWindow, setScreenScale } from "./screenScale.ts";
import { getClueForTurn } from "./screenView.ts";

/**
 * Returns what the cards did on a move from one state to the next: the cards that were misplayed,
 * and whether plays and misplays show in full. They show only in a game in progress, as on the
 * classic screen, and not when the viewer steps through a replay, unless the `animations()` console
 * command is on.
 */
function getMoveEffects(
  state: State,
  before: GameState,
  after: GameState,
  segmentChange: number,
): MoveEffects {
  const variant = currentVariant();
  const misplays = new Map<string, Misplay>();
  const earlierStrikes = new Set(before.strikes.map((strike) => strike.order));
  for (const [strikeIndex, strike] of after.strikes.entries()) {
    const suitIndex = after.deck[strike.order]?.suitIndex;
    if (suitIndex === undefined || earlierStrikes.has(strike.order)) {
      continue;
    }
    misplays.set(strike.order.toString(), {
      suitIndex,
      // The strikes are hidden in the "Throw It in a Hole" variant.
      strikeIndex: variant.throwItInAHole ? undefined : strikeIndex,
    });
  }

  return {
    // A play or a misplay comes a moment before its turn, so the segment does not change yet.
    live:
      (state.replay.segment === undefined || areReplayAnimationsOn())
      && segmentChange >= 0,
    misplays,
  };
}

/**
 * Shows the changes of the score on a move, as the classic screen does.
 *
 * They show only in a game in progress, not in a replay.
 *
 * - A play that completes a stack celebrates it, and a play that gives the team a perfect score
 *   sets off the finale instead.
 * - A lost card that lowers the maximum score shows it.
 */
function animateScoreChanges(
  root: HTMLElement,
  before: GameState,
  after: GameState,
  live: boolean,
) {
  if (!live) {
    return;
  }

  const variant = currentVariant();
  // Each player has one more turn once the last card leaves the deck.
  if (
    after.cardsRemainingInTheDeck === 0
    && before.cardsRemainingInTheDeck > 0
  ) {
    animateEmptyDeck(root);
  }

  const completed = after.playStacks.findIndex(
    (stack, suitIndex) =>
      stack.length === variant.stackSize
      && before.playStacks[suitIndex]?.length === variant.stackSize - 1,
  );
  const playedCard = getLastPlayedCard(root, before, after);
  if (after.score === variant.maxScore && before.score < variant.maxScore) {
    animateFinale(root, variant.suits, playedCard);
  } else if (completed !== -1) {
    animateStackComplete(
      root,
      variant.suits,
      completed,
      playedCard,
      after.clueTokens > before.clueTokens ? before.clueTokens : undefined,
    );
  }

  if (after.stats.maxScore >= before.stats.maxScore) {
    return;
  }

  const discarded = new Set(before.discardStacks.flat());
  const lost = after.discardStacks
    .flat()
    .find((order) => !discarded.has(order));
  animateMaxScoreDrop(
    root,
    before.stats.maxScore,
    lost === undefined ? undefined : getCardElement(root, lost),
  );
}

function getCardElement(
  root: HTMLElement,
  order: CardOrder,
): HTMLElement | undefined {
  return (
    root.querySelector<HTMLElement>(
      `[data-card-order="${CSS.escape(order.toString())}"]`,
    ) ?? undefined
  );
}

/** The card that was just played onto a stack, if there is one. */
function getLastPlayedCard(
  root: HTMLElement,
  before: GameState,
  after: GameState,
): HTMLElement | undefined {
  for (const [suitIndex, stack] of after.playStacks.entries()) {
    const order = stack.at(-1);
    if (
      order !== undefined
      && stack.length > (before.playStacks[suitIndex]?.length ?? 0)
    ) {
      return getCardElement(root, order);
    }
  }
  return undefined;
}

interface CardMotion {
  /** The element that holds the whole screen, whose cards move. */
  readonly rootRef: RefObject<HTMLDivElement | null>;
  /** How much the whole screen grows with the window (see "screenScale.ts"). */
  readonly screenScale: number;
}

/**
 * Moves the cards when the shown state changes. `dropOrder` is a card that the player dropped,
 * whose move starts from where it is drawn now, in `dropRectRef`. `clearDrop` is called once its
 * move starts.
 */
export function useCardMotion(
  state: State | undefined,
  dropOrder: CardOrder | undefined,
  dropRectRef: RefObject<DOMRect | undefined>,
  clearDrop: () => void,
): CardMotion {
  // Move the cards when the game advances or the replay steps through a turn. Each move arrives in
  // one message, so the screen renders it once. This runs before the page is painted, so the cards
  // never flash in their new places.
  const rootRef = useRef<HTMLDivElement>(null);

  // The whole screen grows with the window (see "screenScale.ts"). The card moves below measure
  // with the new scale, so it is set first.
  const windowSize = useWindowSize();
  const screenScale = getScreenScaleForWindow(
    windowSize.width,
    windowSize.height,
  );
  useLayoutEffect(() => {
    setScreenScale(screenScale);
  }, [screenScale]);

  const shown = useRef<{
    /** Where the cards were the last time that nothing was moving. */
    readonly settledPositions: CardPositions;
    readonly shownState: GameState | undefined;
    /** The clue whose markers show, so that they fly in only once. */
    readonly shownClue: StateClue | undefined;
    readonly finished: boolean;
  }>({
    settledPositions: new Map(),
    shownState: undefined,
    shownClue: undefined,
    finished: false,
  });
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null || state?.visibleState === undefined) {
      return;
    }
    const shownState = state.visibleState;

    const previous = shown.current;
    if (previous.shownState === undefined) {
      shown.current = {
        settledPositions: measureCards(root),
        shownState,
        shownClue: getClueForTurn(shownState),
        finished: state.finished,
      };
      return;
    }

    if (previous.shownState === shownState) {
      // Keep the positions up to date (for example, after a resize), unless cards are moving.
      if (!areCardsMoving()) {
        shown.current = {
          ...previous,
          settledPositions: measureCards(root),
        };
      }
      return;
    }

    // The end of a game ("gameFinished") arrives just after its last move, and turns the game into
    // a replay, which shows the turn before the end. The cards of the last move go on to their
    // places, and the score's animations, such as the finale, go on too.
    const endsGame = state.finished && !previous.finished;
    const segmentChange =
      (shownState.turn.segment ?? 0) - (previous.shownState.turn.segment ?? 0);
    const animated = Math.abs(segmentChange) <= MAX_ANIMATED_SEGMENT_CHANGE;
    if (!endsGame) {
      finishScoreSignals();
      // A play or a misplay goes on through the next update of a game in progress, since the server
      // sends the turn a moment after the play. A step in a replay shows another turn, so it stops
      // them.
      if (state.replay.segment !== undefined) {
        stopPlayEffects();
        stopFinale();
      }
    }

    // Cards that still move from the last turn go on, as on the classic screen, unless this move
    // jumps over turns.
    let positions: CardPositions;
    let startPositions = previous.settledPositions;
    if (animated) {
      ({ positions, startPositions } = measureMovingCards(
        root,
        previous.settledPositions,
      ));
    } else {
      stopCardMoves();
      positions = measureCards(root);
    }

    // A card that the player dropped starts its move from where it was dropped. The last card of
    // the deck, which the player can play from the deck, was not on the table before.
    if (dropOrder !== undefined) {
      const dropped =
        startPositions.get(dropOrder.toString())
        ?? startPositions.get(DECK_KEY);
      const rect = dropRectRef.current;
      if (dropped !== undefined && rect !== undefined) {
        startPositions = new Map(startPositions).set(dropOrder.toString(), {
          ...dropped,
          rect,
        });
      }
      clearDrop();
    }
    if (animated) {
      const effects = getMoveEffects(
        state,
        previous.shownState,
        shownState,
        segmentChange,
      );
      animateCardMoves(
        root,
        startPositions,
        positions,
        segmentChange > 0,
        effects,
      );

      if (!store.getState().session.settings.reducedMotion) {
        animateScoreChanges(
          root,
          previous.shownState,
          shownState,
          effects.live,
        );
      }
    }

    revealMovedCardMarkers(root);

    // A clue that was just given flies in from its giver, when the game moves forward a turn.
    const newClue = getClueForTurn(shownState);
    if (
      newClue !== undefined
      && newClue !== previous.shownClue
      && segmentChange > 0
      && segmentChange <= MAX_ANIMATED_SEGMENT_CHANGE
    ) {
      animateClue(root);
    }
    shown.current = {
      settledPositions: positions,
      shownState,
      shownClue: newClue,
      finished: state.finished,
    };
  });

  return {
    rootRef,
    screenScale,
  };
}
