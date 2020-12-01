// Functions for building a state table for every turn

import produce, { castDraft, Draft, original } from "immer";
import { ensureAllCases, millisecondsToClockString } from "../../misc";
import { getVariant } from "../data/gameData";
import {
  cardRules,
  clueTokensRules,
  deckRules,
  handRules,
  playStacksRules,
  textRules,
  variantRules,
} from "../rules";
import { ActionDiscard, ActionPlay, GameAction } from "../types/actions";
import CardNote from "../types/CardNote";
import CardState from "../types/CardState";
import EndCondition from "../types/EndCondition";
import GameMetadata, { getPlayerName } from "../types/GameMetadata";
import GameState from "../types/GameState";
import Variant from "../types/Variant";
import cardsReducer from "./cardsReducer";
import statsReducer from "./statsReducer";
import turnReducer from "./turnReducer";

const gameStateReducer = produce(gameStateReducerFunction, {} as GameState);
export default gameStateReducer;

function gameStateReducerFunction(
  state: Draft<GameState>,
  action: GameAction,
  playing: boolean,
  metadata: GameMetadata,
  ourNotes?: CardNote[],
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    // A player just gave a clue
    // { type: 'clue', clue: { type: 0, value: 1 }, giver: 1, list: [11], target: 2, turn: 0 }
    case "clue": {
      state.clueTokens -= clueTokensRules.getAdjusted(1, variant);

      if (state.turn.segment === null) {
        throw new Error(
          `A "${action.type}" action happened before all of the initial cards were dealt.`,
        );
      }

      state.clues.push({
        type: action.clue.type,
        value: action.clue.value,
        giver: action.giver,
        target: action.target,
        segment: state.turn.segment,
        list: action.list,
        negativeList: state.hands[action.target].filter(
          (i) => !action.list.includes(i),
        ),
      });

      const targetHand = state.hands[action.target];
      const text = textRules.clue(action, targetHand, metadata);
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      // Handle the "Card Cycling" game option
      const giverHand = state.hands[action.giver];
      cardCycle(giverHand, castDraft(state.deck), metadata);

      break;
    }

    // A player just discarded a card
    // { type: 'discard', playerIndex: 0, order: 4, suitIndex: 2, rank: 1, failed: false }
    case "discard": {
      // Remove it from the hand
      const hand = state.hands[action.playerIndex];
      const handIndex = hand.indexOf(action.order);
      let slot = null;
      if (handIndex !== -1) {
        // It is possible for players to misplay the deck
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      if (!throwItInAHolePlayedOrMisplayed(state, action, variant, playing)) {
        if (typeof action.suitIndex !== "number" || action.suitIndex < 0) {
          throw new Error(
            `The suit index for the discarded card was: ${action.suitIndex}`,
          );
        }

        // Add it to the discard stacks
        state.discardStacks[action.suitIndex].push(action.order);

        // Discarding cards grants clue tokens under certain circumstances
        state.clueTokens = clueTokensRules.gain(
          action,
          state.clueTokens,
          variant,
        );
      }

      const touched = cardRules.isClued(state.deck[action.order]);
      const text = textRules.discard(action, slot, touched, playing, metadata);
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      break;
    }

    // A player just drew a card from the deck
    // { type: 'draw', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case "draw": {
      state.cardsRemainingInTheDeck -= 1;
      const hand = state.hands[action.playerIndex];
      if (hand !== undefined) {
        hand.push(action.order);
      }

      if (
        deckRules.isInitialDealFinished(state.cardsRemainingInTheDeck, metadata)
      ) {
        const text = `${
          metadata.playerNames[state.turn.currentPlayerIndex!]
        } goes first`;
        state.log.push({
          turn: state.turn.turnNum + 1,
          text,
        });
      }

      break;
    }

    // The game has ended, either by normal means (e.g. max score),
    // or someone ran out of time in a timed game, someone terminated, etc.
    // { type: 'gameOver', endCondition: 1, playerIndex: 0 }
    case "gameOver": {
      if (action.endCondition !== EndCondition.Normal) {
        state.score = 0;
      }

      const text = textRules.gameOver(
        action.endCondition,
        action.playerIndex,
        state.score,
        metadata,
      );
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      break;
    }

    // A player just played a card
    // { type: 'play', playerIndex: 0, order: 4, suitIndex: 2, rank: 1 }
    case "play": {
      // Remove it from the hand
      const hand = state.hands[action.playerIndex];
      const handIndex = hand.indexOf(action.order);
      let slot = null;
      if (handIndex !== -1) {
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      // Add it to the play stacks
      if (!throwItInAHolePlayedOrMisplayed(state, action, variant, playing)) {
        if (typeof action.suitIndex !== "number" || action.suitIndex < 0) {
          throw new Error(
            `The suit index for the played card was: ${action.suitIndex}`,
          );
        }

        const playStack = state.playStacks[action.suitIndex];
        playStack.push(action.order);

        // Playing cards grants clue tokens under certain circumstances
        state.clueTokens = clueTokensRules.gain(
          action,
          state.clueTokens,
          variant,
          playStack.length === 5,
        );
      }

      // Gain a point
      state.score += 1;

      const touched = cardRules.isClued(state.deck[action.order]);
      const text = textRules.play(action, slot, touched, playing, metadata);
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      break;
    }

    case "playerTimes": {
      for (let i = 0; i < action.playerTimes.length; i++) {
        // Player times are negative in untimed games
        const modifier = metadata.options.timed ? 1 : -1;
        const milliseconds = action.playerTimes[i] * modifier;
        const durationString = millisecondsToClockString(milliseconds);
        const playerName = getPlayerName(i, metadata);

        let text;
        if (metadata.options.timed) {
          text = `${playerName} had ${durationString} left`;
        } else {
          text = `${playerName} took: ${durationString}`;
        }
        state.log.push({
          turn: state.turn.turnNum + 1,
          text,
        });
      }

      const clockString = millisecondsToClockString(action.duration);
      const text = `The total game duration was: ${clockString}`;
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });
      break;
    }

    // A player failed to play a card
    // { type: 'strike', num: 1, turn: 32, order: 24 }
    // TODO: This message is unnecessary and will be removed in a future version of the code
    case "strike": {
      state.strikes.push({
        order: action.order,
        segment: state.turn.segment!,
      });
      break;
    }

    // Some actions do not affect the main state or are handled by another reducer
    case "setEffMod":
    case "editNote":
    case "noteList":
    case "noteListPlayer":
    case "receiveNote":
    case "turn":
    case "cardIdentity": {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  if (action.type === "noteList" || action.type === "receiveNote") {
    // This has no effect, so don't bother computing anything
    return;
  }

  // Use a sub-reducer to calculate changes on cards
  state.deck = castDraft(
    cardsReducer(original(state.deck)!, action, state, playing, metadata),
  );

  // Resolve the stack direction
  if (action.type === "play" && variantRules.hasReversedSuits(variant)) {
    // We have to wait until the deck is updated with the information of the card that we played
    // before the "direction()" function will work
    const playStack = state.playStacks[action.suitIndex];
    const direction = playStacksRules.direction(
      action.suitIndex,
      playStack,
      state.deck,
      variant,
    );
    state.playStackDirections[action.suitIndex] = direction;
  }

  // Discarding or playing cards can make other card cards in that suit
  // not playable anymore and can make other cards critical
  if (
    (action.type === "play" || action.type === "discard") &&
    action.suitIndex >= 0 &&
    action.rank >= 0
  ) {
    variant.ranks.forEach((rank) => {
      state.cardStatus[action.suitIndex][rank] = cardRules.status(
        action.suitIndex,
        rank,
        state.deck,
        state.playStacks,
        state.playStackDirections,
        variant,
      );
    });
  }

  // Use a sub-reducer to calculate the turn
  state.turn = turnReducer(original(state.turn), action, state, metadata);

  // Use a sub-reducer to calculate some game statistics
  state.stats = statsReducer(
    original(state.stats),
    action,
    original(state)!,
    state,
    playing,
    metadata,
    ourNotes ?? null,
  );
}

function cardCycle(
  hand: number[],
  deck: readonly CardState[],
  metadata: GameMetadata,
) {
  if (!metadata.options.cardCycle) {
    return;
  }

  // We don't need to reorder anything if the chop is slot 1 (the left-most card)
  const chopIndex = handRules.chopIndex(hand, deck);
  if (chopIndex === hand.length - 1) {
    return;
  }

  // Remove the chop card from their hand
  const removedCardOrder = hand.splice(chopIndex, 1)[0];

  // Add it to the end (the left-most position)
  hand.push(removedCardOrder);
}

function throwItInAHolePlayedOrMisplayed(
  state: Draft<GameState>,
  action: ActionPlay | ActionDiscard,
  variant: Variant,
  playing: boolean,
) {
  if (!variantRules.isThrowItInAHole(variant) || !playing) {
    return false;
  }

  if ((action.type === "discard" && action.failed) || action.type === "play") {
    // In "Throw It in a Hole" variants, plays and unknown misplayed cards
    // go the hole instead of the play stack / discard pile
    state.hole.push(action.order);

    // Keep track of attempted plays
    state.numAttemptedCardsPlayed += 1;

    return true;
  }

  return false;
}
