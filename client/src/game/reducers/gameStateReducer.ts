// Functions for building a state table for every turn

import produce, {
  Draft,
  original,
  castDraft,
} from 'immer';
import { ensureAllCases, millisecondsToClockString } from '../../misc';
import { getVariant } from '../data/gameData';
import {
  clueTokensRules,
  deckRules,
  textRules,
  variantRules,
} from '../rules';
import { GameAction } from '../types/actions';
import EndCondition from '../types/EndCondition';
import GameMetadata, { getPlayerName } from '../types/GameMetadata';
import GameState from '../types/GameState';
import cardsReducer from './cardsReducer';
import statsReducer from './statsReducer';
import turnReducer from './turnReducer';

const gameStateReducer = produce((
  state: Draft<GameState>,
  action: GameAction,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    // A player just gave a clue
    // { type: 'clue', clue: { type: 0, value: 1 }, giver: 1, list: [11], target: 2, turn: 0 }
    case 'clue': {
      state.clueTokens -= 1;
      state.clues.push({
        type: action.clue.type,
        value: action.clue.value,
        giver: action.giver,
        target: action.target,
        turn: action.turn,
        list: action.list,
        negativeList: state.hands[action.target].filter((i) => !action.list.includes(i)),
      });

      const targetHand = state.hands[action.target];
      const text = textRules.clue(action, targetHand, metadata);
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      break;
    }

    // A player just discarded a card
    // { type: 'discard', playerIndex: 0, order: 4, suitIndex: 2, rank: 1, failed: false }
    case 'discard': {
      // Remove it from the hand
      const hand = state.hands[action.playerIndex];
      const handIndex = hand.indexOf(action.order);
      let slot = null;
      if (handIndex !== -1) { // It is possible for players to misplay the deck
        slot = hand.length - handIndex;
        hand.splice(handIndex, 1);
      }

      // Add it to the discard stacks
      state.discardStacks[action.suitIndex].push(action.order);

      if (!action.failed) {
        state.clueTokens = clueTokensRules.gain(variant, state.clueTokens);
      }

      const touched = state.deck[action.order].numPositiveClues > 0;
      const text = textRules.discard(action, slot, touched, metadata);
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });

      break;
    }

    // A player just drew a card from the deck
    // { type: 'draw', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case 'draw': {
      state.deckSize -= 1;
      const hand = state.hands[action.playerIndex];
      if (hand !== undefined) {
        hand.push(action.order);
      }

      if (deckRules.isInitialDealFinished(state.deckSize, metadata)) {
        const text = `${metadata.playerNames[state.turn.currentPlayerIndex!]} goes first`;
        state.log.push({
          turn: state.turn.turnNum + 1,
          text,
        });
      }

      break;
    }

    case 'gameDuration': {
      const clockString = millisecondsToClockString(action.duration);
      const text = `The total game duration was: ${clockString}`;
      state.log.push({
        turn: state.turn.turnNum + 1,
        text,
      });
      break;
    }

    // The game has ended, either by normal means (e.g. max score), or someone ran out of time in a
    // timed game, someone terminated, etc.
    // { type: 'gameOver', endCondition: 1, playerIndex: 0 }
    case 'gameOver': {
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
    case 'play': {
      // Remove it from the hand
      const hand = state.hands[action.playerIndex];
      const handIndex = hand.indexOf(action.order);
      if (handIndex !== -1) {
        hand.splice(handIndex, 1);
      }

      // Add it to the play stacks
      state.playStacks[action.suitIndex].push(action.order);

      // Gain a point
      state.score += 1;

      // Keep track of attempted plays
      state.numAttemptedCardsPlayed += 1;

      // Gain a clue token if the stack is complete
      if (
        state.playStacks[action.suitIndex].length === 5 // Hard-code 5 cards per stack
        // In "Throw It in a Hole" variants, getting a clue back would reveal information about the
        // card that is played, so finishing a stack does not grant a clue
        && !variantRules.isThrowItInAHole(variant)
      ) {
        state.clueTokens = clueTokensRules.gain(variant, state.clueTokens);
      }

      break;
    }

    case 'playerTimes': {
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
      break;
    }

    // At the end of every turn, the server informs us of the stack directions for each suit
    // { type: 'stackDirections', directions: [0, 0, 0, 0, 0] }
    // TODO: This message is unnecessary and will be removed in a future version of the code
    // (the client should be able to determine the stack directions directly)
    case 'stackDirections': {
      state.playStacksDirections = action.directions;
      break;
    }

    // An action has been taken, so there may be a change to game state variables
    // { type: 'status', clues: 5, score: 18, maxScore: 24, doubleDiscard: false }
    // TODO: This message is unnecessary and will be removed in a future version of the code
    case 'status': {
      // TEMP: At this point, check that the local state matches the server
      if (state.clueTokens !== action.clues) {
        console.warn(`The clues from the client and the server do not match on turn ${state.turn.turnNum}.`);
        console.warn(`Client = ${state.clueTokens}, Server = ${action.clues}`);
      }

      // TEMP: At this point, check that the local state matches the server
      if (state.score !== action.score) {
        console.warn(`The scores from the client and the server do not match on turn ${state.turn.turnNum}.`);
        console.warn(`Client = ${state.score}, Server = ${action.score}`);
      }

      // TODO: calculate maxScore instead of using the server one
      state.maxScore = action.maxScore;

      // TODO: calculate doubleDiscard instead of using the server value
      state.doubleDiscard = action.doubleDiscard;

      break;
    }

    // A player failed to play a card
    // { type: 'strike', num: 1, turn: 32, order: 24 }
    // TODO: This message is unnecessary and will be removed in a future version of the code
    case 'strike': {
      state.strikes.push({
        order: action.order,
        turn: action.turn,
      });
      break;
    }

    // Some actions do not affect the main state or are handled by another reducer
    case 'reorder':
    case 'turn': {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  // Use a sub-reducer to calculate changes on cards
  state.deck = castDraft(cardsReducer(
    original(state.deck)!,
    action,
    state,
    metadata,
  ));

  // Use a sub-reducer to calculate the turn
  state.turn = turnReducer(
    original(state.turn),
    action,
    state,
    metadata,
  );

  // Use a sub-reducer to calculate some game statistics
  state.stats = statsReducer(
    original(state.stats),
    action,
    original(state)!,
    state,
    metadata,
  );
}, {} as GameState);

export default gameStateReducer;
