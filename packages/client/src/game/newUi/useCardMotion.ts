// Moves the cards of the redesigned game screen from where they were to where they are, when the
// game advances or the replay steps through a turn, and shows the changes of the score.

import type { CardOrder, GameState, StateClue } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { store } from "../../store.ts";
import type { State } from "../types/State.ts";
import { globals } from "../ui/UiGlobals.ts";
import type { CardPositions, MoveEffects } from "./cardMotion.ts";
import {
  animateCardMoves,
  animateClue,
  areCardsMoving,
  MAX_ANIMATED_SEGMENT_CHANGE,
  measureCards,
  MOVE_BATCH_MILLISECONDS,
  stopCardMoves,
} from "./cardMotion.ts";
import { useWindowSize } from "./hooks.ts";
import type { Misplay } from "./playMotion.ts";
import {
  animateFinale,
  animateMaxScoreDrop,
  animateStackComplete,
  finishScoreSignals,
} from "./scoreMotion.ts";
import { getScreenScaleForWindow, setScreenScale } from "./screenScale.ts";
import { getClueForTurn } from "./screenView.ts";
import type { Drag } from "./useCardDrag.ts";
import { getDropRect } from "./useCardDrag.ts";

/**
 * Returns what the cards did on a move from one state to the next: the cards that were misplayed,
 * and whether plays and misplays show in full. They show only in a game in progress, as on the
 * classic screen, and not when the viewer steps through a replay.
 */
function getMoveEffects(
  state: State,
  before: GameState,
  after: GameState,
  segmentChange: number,
): MoveEffects {
  const { variant } = globals;
  const misplays = new Map<string, Misplay>();
  const earlierStrikes = new Set(before.strikes.map((strike) => strike.order));
  for (const [strikeIndex, strike] of after.strikes.entries()) {
    const suitIndex = after.deck[strike.order]?.suitIndex;
    if (earlierStrikes.has(strike.order) || suitIndex === undefined) {
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
    live: state.replay.segment === undefined && segmentChange >= 0,
    misplays,
  };
}

/**
 * Shows the changes of the score on a move, as the classic screen does. A move can arrive in
 * several updates, so each one starts on the update that changes its numbers.
 *
 * - In a game in progress, a play that completes a stack celebrates it, and a play that gives the
 *   team a perfect score sets off the finale instead.
 * - A lost card that lowers the maximum score shows it, also in a replay, but not when the replay
 *   goes back.
 */
function animateScoreChanges(
  root: HTMLElement,
  before: GameState,
  after: GameState,
  live: boolean,
  segmentChange: number,
) {
  const { variant } = globals;
  if (live) {
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
  }

  if (segmentChange >= 0 && after.stats.maxScore < before.stats.maxScore) {
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
 * Moves the cards when the shown state changes. `drop` is a card that the player dropped, whose
 * move starts from where it was dropped, at the width in `handCardWidthRef`. `clearDrop` is called
 * once its move starts.
 */
export function useCardMotion(
  state: State | undefined,
  drop: Drag | undefined,
  clearDrop: () => void,
  handCardWidthRef: RefObject<number>,
): CardMotion {
  // Move the cards when the game advances or the replay steps through a turn. A game's move arrives
  // in one message, but a shared hypothetical's move arrives as several (such as a play, then a
  // draw, then the turn), and the screen renders after each. So the updates within a short window
  // count as one move: each one starts the cards again from where they were before the move began,
  // toward their newest places. This runs before the page is painted, so the cards never flash in
  // their new places.
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
    readonly move:
      | {
          readonly startPositions: CardPositions;
          readonly startState: GameState;
          readonly startedAt: number;
        }
      | undefined;
  }>({
    settledPositions: new Map(),
    shownState: undefined,
    shownClue: undefined,
    move: undefined,
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
        move: undefined,
      };
      return;
    }

    if (previous.shownState === shownState) {
      // Keep the positions up to date (for example, after a resize), unless cards are moving.
      if (!areCardsMoving()) {
        shown.current = { ...previous, settledPositions: measureCards(root) };
      }
      return;
    }

    const now = performance.now();
    let startPositions = previous.settledPositions;
    // A card that the player dropped starts its move from where it was dropped.
    if (drop !== undefined) {
      const dropped = startPositions.get(drop.order.toString());
      if (dropped !== undefined) {
        startPositions = new Map(startPositions).set(drop.order.toString(), {
          ...dropped,
          rect: getDropRect(drop, handCardWidthRef.current),
        });
      }
      clearDrop();
    }
    const move =
      previous.move !== undefined
      && now - previous.move.startedAt <= MOVE_BATCH_MILLISECONDS
        ? previous.move
        : {
            startPositions,
            startState: previous.shownState,
            startedAt: now,
          };
    stopCardMoves();
    if (move !== previous.move) {
      finishScoreSignals();
    }
    const positions = measureCards(root);
    const segmentChange =
      (shownState.turn.segment ?? 0) - (move.startState.turn.segment ?? 0);
    if (Math.abs(segmentChange) <= MAX_ANIMATED_SEGMENT_CHANGE) {
      const effects = getMoveEffects(
        state,
        move.startState,
        shownState,
        segmentChange,
      );
      animateCardMoves(
        root,
        move.startPositions,
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
          segmentChange,
        );
      }
    }

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
      move,
    };
  });

  return { rootRef, screenScale };
}
