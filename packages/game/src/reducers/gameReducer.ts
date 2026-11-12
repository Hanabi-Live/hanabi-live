// Functions for building a game state for every turn.

/* eslint-disable no-param-reassign */

import { assertDefined } from "complete-common";
import type { Draft } from "immer";
import { castDraft, original, produce } from "immer";
import { VALID_PLAYER_INDEXES } from "../constants.ts";
import { getVariantById } from "../gameData.ts";
import type { CardNote } from "../interfaces/CardNote.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import type { Variant } from "../interfaces/Variant.ts";
import {
  getCardStatus,
  isCardCritical,
  isCardNeededForMaxScore,
} from "../rules/card.ts";
import { isCardClued } from "../rules/cardState.ts";
import { isPassTurnClue } from "../rules/clues.ts";
import {
  getClueCost,
  getNewClueTokensAfterAction,
} from "../rules/clueTokens.ts";
import { isInitialDealFinished } from "../rules/deck.ts";
import { getStackDirection, getStackStartRank } from "../rules/playStacks.ts";
import {
  getClueText,
  getDiscardText,
  getGameOverText,
  getGoesFirstText,
  getPlayText,
  getPlayerName,
  millisecondsToClockString,
} from "../rules/text.ts";
import { hasReversedSuits } from "../rules/variants/variantIdentity.ts";
import type {
  ActionDiscard,
  ActionMisplay,
  ActionPlay,
  GameAction,
} from "../types/gameActions.ts";
import type { SuitIndex } from "../types/SuitIndex.ts";
import { cardsReducer } from "./cardsReducer.ts";
import { ddaReducer } from "./ddaReducer.ts";
import { knownTrashReducer } from "./knownTrashReducer.ts";
import { statsReducer } from "./statsReducer.ts";
import { turnReducer } from "./turnReducer.ts";

/** Computes the next game state from a given action. */
export function gameReducer(
  gameState: GameState,
  action: GameAction,
  playing: boolean,
  shadowing: boolean,
  finished: boolean,
  hypothetical: boolean,
  metadata: GameMetadata,
  ourNotes?: readonly CardNote[],
): GameState {
  return produce(gameState, (draft) => {
    gameReducerFunction(
      draft,
      action,
      playing,
      shadowing,
      finished,
      hypothetical,
      metadata,
      ourNotes,
    );
  });
}

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
  const variant = getVariantById(metadata.options.variantId);

  switch (action.type) {
    /**
     * A player just gave a clue:
     *
     * ```ts
     * {
     *   type: "clue",
     *   clue: { type: 0, value: 1 },
     *   playerIndex: 1,
     *   orders: [11],
     *   receiverIndex: 2,
     *   turn: 0,
     * }
     * ```
     */
    case "clue": {
      gameState.clueTokens -= getClueCost(variant);

      assertDefined(
        gameState.turn.segment,
        `A "${action.type}" action happened before all of the initial cards were dealt.`,
      );

      const targetHand = gameState.hands[action.receiverIndex];
      assertDefined(
        targetHand,
        `Failed to find the hand at index: ${action.receiverIndex}`,
      );

      const negativeList =
        action.ignoreNegative === true
          ? []
          : targetHand.filter((i) => !action.orders.includes(i));

      // A pass touches no cards, so it does not belong in the clue log.
      if (!isPassTurnClue(action)) {
        // Even though the objects for each clue type are the exact same, a switch statement is
        // needed to satisfy the TypeScript compiler.
        switch (action.clue.type) {
          case undefined: {
            gameState.clues.push(
              castDraft({
                type: undefined,
                value: undefined,
                giver: action.playerIndex,
                target: action.receiverIndex,
                segment: gameState.turn.segment,
                list: action.orders,
                negativeList,
              }),
            );
            break;
          }

          case "color": {
            const clue = castDraft({
              type: action.clue.type,
              color: action.clue.color,
              giver: action.playerIndex,
              target: action.receiverIndex,
              segment: gameState.turn.segment,
              list: action.orders,
              negativeList,
            });
            gameState.clues.push(clue);
            break;
          }

          case "rank": {
            const clue = castDraft({
              type: action.clue.type,
              rank: action.clue.rank,
              giver: action.playerIndex,
              target: action.receiverIndex,
              segment: gameState.turn.segment,
              list: action.orders,
              negativeList,
            });
            gameState.clues.push(clue);
            break;
          }
        }
      }

      const text = getClueText(action, targetHand, hypothetical, metadata);
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    /**
     * A player just discarded a card, or failed to play it.
     *
     * ```ts
     * {
     *   type: "discard",
     *   playerIndex: 0,
     *   order: 4,
     *   identity: { suitIndex: 2, rank: 1 },
     * }
     * ```
     */
    case "discard":
    case "misplay": {
      // Remove it from the hand.
      const hand = gameState.hands[action.playerIndex];
      assertDefined(
        hand,
        `Failed to find the hand at index: ${action.playerIndex}`,
      );

      const handIndex = hand.indexOf(action.order);
      let slot: number | undefined;
      if (handIndex !== -1) {
        // It is possible for players to misplay the deck.
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      if (action.type === "misplay") {
        // We intentionally do not validate the size of the strikes array because we allow more than
        // 3 strikes in hypotheticals.
        gameState.strikes.push({
          order: action.order,
          segment: gameState.turn.segment ?? 1,
        });
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
        if (action.identity === undefined) {
          throw new Error("The identity of a discarded card is unknown.");
        }

        // Add it to the discard stacks.
        const discardStack = gameState.discardStacks[action.identity.suitIndex];
        assertDefined(
          discardStack,
          `Failed to find the discard stack at index: ${action.identity.suitIndex}`,
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
          action.identity?.suitIndex,
          action.identity?.rank,
          gameState.deck,
          gameState.playStackDirections,
          variant,
        )
        && isCardNeededForMaxScore(
          action.identity?.suitIndex,
          action.identity?.rank,
          gameState.deck,
          gameState.playStacks,
          gameState.playStackDirections,
          gameState.playStackStarts,
          variant,
        );

      const text =
        action.type === "misplay"
          ? getPlayText(
              action,
              slot,
              touched,
              playing,
              shadowing,
              hypothetical,
              metadata,
            )
          : getDiscardText(
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
      // A skipped or repeated card order would leave a hole in the deck that breaks later rules.
      if (action.order !== gameState.deck.length) {
        throw new Error(
          `Received a draw for card order ${action.order}, but the next card order in the deck is: ${gameState.deck.length}`,
        );
      }

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
     *   endCondition: "normal",
     *   playerIndex: 0,
     * }
     * ```ts
     */
    case "gameOver": {
      if (action.endCondition !== "normal") {
        gameState.score = 0;
      }

      const text = getGameOverText(
        action.endCondition,
        action.playerIndex,
        gameState.score,
        metadata,
        action.voters,
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
      let slot: number | undefined;
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
        if (action.identity === undefined) {
          throw new Error("The identity of a played card is unknown.");
        }

        const playStack = gameState.playStacks[action.identity.suitIndex];
        assertDefined(
          playStack,
          `Failed to find the play stack at index: ${action.identity.suitIndex}`,
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
      for (const playerIndex of VALID_PLAYER_INDEXES) {
        const playerTime = action.playerTimesMs[playerIndex];
        if (playerTime === undefined) {
          break;
        }

        const durationString = millisecondsToClockString(playerTime);
        const playerName = getPlayerName(playerIndex, metadata);

        const text =
          metadata.options.timeControl === undefined
            ? `${playerName} took: ${durationString}`
            : `${playerName} had ${durationString} left`;
        gameState.log.push({
          turn: gameState.turn.turnNum + 1,
          text,
        });
      }

      const clockString = millisecondsToClockString(action.durationMs);
      const text = `The total game duration was: ${clockString}`;
      gameState.log.push({
        turn: gameState.turn.turnNum + 1,
        text,
      });

      break;
    }

    // Some actions do not affect the main state or are handled by another reducer.
    case "setEfficiencyModifier":
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
  gameState.deck = castDraft(
    cardsReducer(originalDeck, action, gameState, metadata),
  );

  // Resolve the stack direction.
  if (action.type === "play" && (hasReversedSuits(variant) || variant.sudoku)) {
    const suitIndex =
      action.identity?.suitIndex ?? gameState.deck[action.order]?.suitIndex;

    if (suitIndex !== undefined) {
      // We have to wait until the deck is updated with the information of the card that we played
      // before the `direction` function will work.
      const playStack = gameState.playStacks[suitIndex];
      assertDefined(
        playStack,
        `Failed to find the play stack at index: ${suitIndex}`,
      );

      const direction = getStackDirection(
        suitIndex,
        playStack,
        gameState.deck,
        variant,
      );
      gameState.playStackDirections[suitIndex] = direction;
    }
  }

  // In Sudoku variants, resolve the stack starting value.
  if (action.type === "play" && variant.sudoku) {
    const suitIndex =
      action.identity?.suitIndex ?? gameState.deck[action.order]?.suitIndex;

    if (suitIndex !== undefined) {
      const playStack = gameState.playStacks[suitIndex];
      assertDefined(
        playStack,
        `Failed to find the play stack at index: ${suitIndex}`,
      );

      gameState.playStackStarts[suitIndex] = getStackStartRank(
        playStack,
        gameState.deck,
      );
    }
  }

  // Discarding or playing cards can make other card cards in that suit not playable anymore and can
  // make other cards critical.
  if (
    (action.type === "play"
      || action.type === "discard"
      || action.type === "misplay")
    && action.identity !== undefined
  ) {
    // For a no-variant game, we would only have to iterate over cards of the same suit to check for
    // non-playability. But other variants become more complicated, so we iterate over the entire
    // deck to be safe.
    for (const i of variant.suits.keys()) {
      const suitIndex = i as SuitIndex;
      for (const rank of variant.ranks) {
        gameState.cardStatus[suitIndex][rank] = getCardStatus(
          suitIndex,
          rank,
          gameState.deck,
          gameState.playStacks,
          gameState.playStackDirections,
          gameState.playStackStarts,
          variant,
        );
      }
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
  gameState.stats = castDraft(
    statsReducer(
      original(gameState.stats),
      action,
      originalState,
      gameState,
      playing,
      shadowing,
      metadata,
      ourNotes ?? undefined,
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

function throwItInAHolePlayedOrMisplayed(
  gameState: Draft<GameState>,
  action: ActionPlay | ActionDiscard | ActionMisplay,
  variant: Variant,
  playing: boolean,
  shadowing: boolean,
  finished: boolean,
) {
  if (!variant.throwItInAHole || (!playing && !shadowing) || finished) {
    return false;
  }

  if (action.type === "misplay" || action.type === "play") {
    // In "Throw It in a Hole" variants, plays and unknown misplayed cards go the hole instead of
    // the play stack / discard pile.
    gameState.hole.push(action.order);

    return true;
  }

  return false;
}
