// Functions for building a game state for every turn.

/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */

import { assertDefined, assertNotNull, tupleEntries } from "complete-common";
import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import { ClueType } from "../enums/ClueType";
import { EndCondition } from "../enums/EndCondition";
import { getVariant } from "../gameData";
import type { CardNote } from "../interfaces/CardNote";
import type { CardState } from "../interfaces/CardState";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import {
  getCardStatus,
  isCardCritical,
  isCardNeededForMaxScore,
} from "../rules/card";
import { isCardClued } from "../rules/cardState";
import {
  getAdjustedClueTokens,
  getNewClueTokensAfterAction,
} from "../rules/clueTokens";
import { isInitialDealFinished } from "../rules/deck";
import { getChopIndex } from "../rules/hand";
import { getStackDirection, getStackStartRank } from "../rules/playStacks";
import {
  getClueText,
  getDiscardText,
  getGameOverText,
  getGoesFirstText,
  getPlayText,
  getPlayerName,
  millisecondsToClockString,
} from "../rules/text";
import { hasReversedSuits } from "../rules/variants/variantIdentity";
import type {
  ActionDiscard,
  ActionPlay,
  GameAction,
} from "../types/gameActions";
import { cardsReducer } from "./cardsReducer";
import { ddaReducer } from "./ddaReducer";
import { knownTrashReducer } from "./knownTrashReducer";
import { statsReducer } from "./statsReducer";
import { turnReducer } from "./turnReducer";

/** Computes the next game state from a given action. */
export const gameReducer = produce(gameReducerFunction, {} as GameState);

function gameReducerFunction(
  gameState: Draft<GameState>,
  action: GameAction,
  playing: boolean,
  shadowing: boolean,
  finished: boolean,
  hypothetical: boolean,
  metadata: GameMetadata,
  ourNotes?: readonly CardNote[],
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    /**
     * A player just gave a clue:
     *
     * ```ts
     * {
     *   type: "clue",
     *   clue: { type: 0, value: 1 },
     *   giver: 1,
     *   list: [11],
     *   target: 2,
     *   turn: 0,
     * }
     * ```
     */
    case "clue": {
      gameState.clueTokens -= getAdjustedClueTokens(1, variant);

      assertNotNull(
        gameState.turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      const targetHand = gameState.hands[action.target];
      assertDefined(
        targetHand,
        `Failed to find the hand at index: ${action.target}`,
      );

      const negativeList = action.ignoreNegative
        ? []
        : targetHand.filter((i) => !action.list.includes(i));

      // Even though the objects for each clue type are the exact same, a switch statement is needed
      // to satisfy the TypeScript compiler.
      switch (action.clue.type) {
        case ClueType.Color: {
          const clue = castDraft({
            type: action.clue.type,
            value: action.clue.value,
            giver: action.giver,
            target: action.target,
            segment: gameState.turn.segment,
            list: action.list,
            negativeList,
          });
          gameState.clues.push(clue);
          break;
        }

        case ClueType.Rank: {
          const clue = castDraft({
            type: action.clue.type,
            value: action.clue.value,
            giver: action.giver,
            target: action.target,
            segment: gameState.turn.segment,
            list: action.list,
            negativeList,
          });
          gameState.clues.push(clue);
          break;
        }
      }

      const text = getClueText(action, targetHand, hypothetical, metadata);
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      // Handle the "Card Cycling" game option.
      const giverHand = gameState.hands[action.giver];
      assertDefined(
        giverHand,
        `Failed to find the hand at index: ${action.giver}`,
      );

      cardCycle(giverHand, castDraft(gameState.deck), metadata);

      break;
    }

    /**
     * A player just discarded a card.
     *
     * ```ts
     * {
     *   type: "discard",
     *   playerIndex: 0,
     *   order: 4,
     *   suitIndex: 2,
     *   rank: 1,
     *   failed: false,
     * }
     * ```
     */
    case "discard": {
      // Remove it from the hand.
      const hand = gameState.hands[action.playerIndex];
      assertDefined(
        hand,
        `Failed to find the hand at index: ${action.playerIndex}`,
      );

      const handIndex = hand.indexOf(action.order);
      let slot: number | null = null;
      if (handIndex !== -1) {
        // It is possible for players to misplay the deck.
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      if (
        !throwItInAHolePlayedOrMisplayed(
          gameState,
          action,
          variant,
          playing,
          shadowing,
          finished,
        )
      ) {
        if (action.suitIndex === -1) {
          throw new Error(
            `The suit index for a discarded card was: ${action.suitIndex}`,
          );
        }

        // Add it to the discard stacks.
        const discardStack = gameState.discardStacks[action.suitIndex];
        assertDefined(
          discardStack,
          `Failed to find the discard stack at index: ${action.suitIndex}`,
        );

        discardStack.push(action.order);

        // Discarding cards grants clue tokens under certain circumstances.
        gameState.clueTokens = getNewClueTokensAfterAction(
          action,
          gameState.clueTokens,
          variant,
        );
      }

      const cardState = gameState.deck[action.order];
      assertDefined(
        cardState,
        `Failed to find the card state at order: ${action.order}`,
      );

      const touched = isCardClued(cardState);

      // We do not want include the "(critical)" text for dead suits.
      const critical =
        isCardCritical(
          action.suitIndex,
          action.rank,
          gameState.deck,
          gameState.playStackDirections,
          variant,
        ) &&
        isCardNeededForMaxScore(
          action.suitIndex,
          action.rank,
          gameState.deck,
          gameState.playStacks,
          gameState.playStackDirections,
          gameState.playStackStarts,
          variant,
        );

      const text = getDiscardText(
        action,
        slot,
        touched,
        critical,
        playing,
        shadowing,
        hypothetical,
        metadata,
      );
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    /**
     * A player just drew a card from the deck.
     *
     * ```ts
     * {
     *   type: "draw",
     *   playerIndex: 0,
     *   order: 0,
     *   rank: 1,
     *   suitIndex: 4,
     * }
     * ```
     */
    case "draw": {
      gameState.cardsRemainingInTheDeck--;
      const hand = gameState.hands[action.playerIndex];
      if (hand !== undefined) {
        hand.push(action.order);
      }

      if (isInitialDealFinished(gameState.cardsRemainingInTheDeck, metadata)) {
        const text = getGoesFirstText(
          gameState.turn.currentPlayerIndex,
          metadata.playerNames,
        );
        gameState.log.push({
          turn: gameState.turn.turnNum + 1,
          text,
        });
      }

      break;
    }

    /**
     * The game has ended, either by normal means (e.g. max score), or someone ran out of time in a
     * timed game, someone terminated, etc.
     *
     * ```ts
     * {
     *   type: "gameOver",
     *   endCondition: 1,
     *   playerIndex: 0,
     * }
     * ```ts
     */
    case "gameOver": {
      if (action.endCondition !== EndCondition.Normal) {
        gameState.score = 0;
      }

      const text = getGameOverText(
        action.endCondition,
        action.playerIndex,
        gameState.score,
        metadata,
        action.votes,
      );
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    /**
     * A player just played a card.
     *
     * ```ts
     * {
     *   type: "play",
     *   playerIndex: 0,
     *   order: 4,
     *   suitIndex: 2,
     *   rank: 1,
     * }
     * ```
     */
    case "play": {
      // Remove it from the hand.
      const hand = gameState.hands[action.playerIndex];
      assertDefined(
        hand,
        `Failed to find the hand at index: ${action.playerIndex}`,
      );

      const handIndex = hand.indexOf(action.order);
      let slot: number | null = null;
      if (handIndex !== -1) {
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      // Add it to the play stacks.
      if (
        !throwItInAHolePlayedOrMisplayed(
          gameState,
          action,
          variant,
          playing,
          shadowing,
          finished,
        )
      ) {
        if (action.suitIndex === -1) {
          throw new Error(
            `The suit index for a played card was: ${action.suitIndex}`,
          );
        }

        const playStack = gameState.playStacks[action.suitIndex];
        assertDefined(
          playStack,
          `Failed to find the play stack at index: ${action.suitIndex}`,
        );

        playStack.push(action.order);

        // Playing cards grants clue tokens under certain circumstances.
        gameState.clueTokens = getNewClueTokensAfterAction(
          action,
          gameState.clueTokens,
          variant,
          playStack.length === variant.stackSize,
        );
      }

      // Gain a point.
      gameState.score++;

      const cardState = gameState.deck[action.order];
      assertDefined(
        cardState,
        `Failed to find the card state at order: ${action.order}`,
      );

      const touched = isCardClued(cardState);
      const text = getPlayText(
        action,
        slot,
        touched,
        playing,
        shadowing,
        hypothetical,
        metadata,
      );
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    case "playerTimes": {
      for (const [playerIndex, playerTime] of tupleEntries(
        action.playerTimes,
      )) {
        // Player times are negative in untimed games.
        const modifier = metadata.options.timed ? 1 : -1;
        const milliseconds = playerTime * modifier;
        const durationString = millisecondsToClockString(milliseconds);
        const playerName = getPlayerName(playerIndex, metadata);

        const text = metadata.options.timed
          ? `${playerName} had ${durationString} left`
          : `${playerName} took: ${durationString}`;
        gameState.log.push({
          turn: gameState.turn.turnNum + 1,
          text,
        });
      }

      const clockString = millisecondsToClockString(action.duration);
      const text = `The total game duration was: ${clockString}`;
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    /**
     * A player failed to play a card.
     *
     * ```ts
     * {
     *   type: "strike",
     *   num: 1,
     *   turn: 32,
     *   order: 24,
     * }
     * ```
     */
    // TODO: This message is unnecessary and will be removed in a future version of the code
    case "strike": {
      // We intentionally do not validate the size of the strikes array because we allow more than 3
      // strikes in hypotheticals.
      gameState.strikes.push({
        order: action.order,
        segment: gameState.turn.segment ?? 1,
      });

      break;
    }

    // Some actions do not affect the main state or are handled by another reducer.
    case "setEffMod":
    case "editNote":
    case "noteList":
    case "noteListPlayer":
    case "receiveNote":
    case "turn":
    case "cardIdentity": {
      break;
    }
  }

  if (action.type === "noteList" || action.type === "receiveNote") {
    // This has no effect, so do not bother computing anything.
    return;
  }

  // Use a sub-reducer to calculate changes on cards.
  const originalDeck = original(gameState.deck);
  assertDefined(originalDeck, "Failed to find the original deck.");
  gameState.deck = castDraft(
    cardsReducer(originalDeck, action, gameState, metadata),
  );

  // Resolve the stack direction.
  if (
    action.type === "play" &&
    (hasReversedSuits(variant) || variant.sudoku) &&
    action.suitIndex !== -1
  ) {
    // We have to wait until the deck is updated with the information of the card that we played
    // before the `direction` function will work.
    const playStack = gameState.playStacks[action.suitIndex];
    assertDefined(
      playStack,
      `Failed to find the play stack at index: ${action.suitIndex}`,
    );

    const direction = getStackDirection(
      action.suitIndex,
      playStack,
      gameState.deck,
      variant,
    );
    gameState.playStackDirections[action.suitIndex] = direction;
  }

  // In Sudoku variants, resolve the stack starting value.
  if (action.type === "play" && variant.sudoku && action.suitIndex !== -1) {
    const playStack = gameState.playStacks[action.suitIndex];
    assertDefined(
      playStack,
      `Failed to find the play stack at index: ${action.suitIndex}`,
    );

    gameState.playStackStarts[action.suitIndex] = getStackStartRank(
      playStack,
      gameState.deck,
    );
  }

  // Discarding or playing cards can make other card cards in that suit not playable anymore and can
  // make other cards critical.
  if (
    (action.type === "play" || action.type === "discard") &&
    action.suitIndex !== -1 &&
    action.rank !== -1
  ) {
    for (const rank of variant.ranks) {
      gameState.cardStatus[action.suitIndex][rank] = getCardStatus(
        action.suitIndex,
        rank,
        gameState.deck,
        gameState.playStacks,
        gameState.playStackDirections,
        gameState.playStackStarts,
        variant,
      );
    }
  }

  // Use a sub-reducer to calculate the turn.
  gameState.turn = turnReducer(
    original(gameState.turn),
    action,
    gameState,
    metadata,
  );

  // Use a sub-reducer to calculate some game statistics.
  const originalState = original(gameState);
  assertDefined(originalState, "Failed to get the original state.");
  gameState.stats = castDraft(
    statsReducer(
      original(gameState.stats),
      action,
      originalState,
      gameState,
      playing,
      shadowing,
      metadata,
      ourNotes ?? null,
    ),
  );

  // After stats calculated, compute DDA property on all card states.
  gameState.deck = castDraft(
    ddaReducer(
      gameState.deck,
      gameState.stats.doubleDiscardCard,
      gameState.turn.currentPlayerIndex,
    ),
  );

  // Finally, mark cards as known-trash.
  gameState.deck = castDraft(
    knownTrashReducer(
      gameState.deck,
      gameState.playStacks,
      gameState.playStackDirections,
      gameState.playStackStarts,
      variant,
    ),
  );
}

function cardCycle(
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  hand: number[],
  deck: readonly CardState[],
  metadata: GameMetadata,
) {
  if (!metadata.options.cardCycle) {
    return;
  }

  // We do not need to reorder anything if the chop is slot 1 (the left-most card).
  const chopIndex = getChopIndex(hand, deck);
  if (chopIndex === hand.length - 1) {
    return;
  }

  // Remove the chop card from their hand.
  const newHand = hand.splice(chopIndex, 1);
  const removedCardOrder = newHand[0];
  if (removedCardOrder !== undefined) {
    // Add it to the end (the left-most position).
    hand.push(removedCardOrder);
  }
}

function throwItInAHolePlayedOrMisplayed(
  gameState: Draft<GameState>,
  action: ActionPlay | ActionDiscard,
  variant: Variant,
  playing: boolean,
  shadowing: boolean,
  finished: boolean,
) {
  if (!variant.throwItInAHole || (!playing && !shadowing) || finished) {
    return false;
  }

  if ((action.type === "discard" && action.failed) || action.type === "play") {
    // In "Throw It in a Hole" variants, plays and unknown misplayed cards go the hole instead of
    // the play stack / discard pile.
    gameState.hole.push(action.order);

    return true;
  }

  return false;
}
