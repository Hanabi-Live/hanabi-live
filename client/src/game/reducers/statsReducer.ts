// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { getVariant, getCharacter } from '../data/gameData';
import { variantRules, cardRules, clueTokensRules } from '../rules';
import * as statsRules from '../rules/stats';
import { GameAction } from '../types/actions';
import ClueType from '../types/ClueType';
import EndCondition from '../types/EndCondition';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import SoundType from '../types/SoundType';
import StatsState from '../types/StatsState';
import { getCharacterIDForPlayer } from './reducerHelpers';

const statsReducer = produce((
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case 'clue': {
      // A clue was spent
      stats.potentialCluesLost += 1;

      break;
    }

    case 'strike': {
      // TODO: move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      // But don't reveal that a strike has happened to players in an ongoing "Throw It in a Hole"
      // game
      if (!variantRules.isThrowItInAHole(variant) || !playing) {
        stats.potentialCluesLost += clueTokensRules.value(variant);
      }

      break;
    }

    case 'play': {
      if (
        !variantRules.isThrowItInAHole(variant) // We don't get an extra clue in these variants
        && currentState.playStacks[action.suitIndex].length === 5 // Hard code stack length to 5
        && originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        console.log('before:', stats.potentialCluesLost);
        stats.potentialCluesLost += clueTokensRules.value(variant);
        console.log('after:', stats.potentialCluesLost);
      }

      break;
    }

    default: {
      break;
    }
  }

  // Handle double discard calculation
  if (action.type === 'discard') {
    stats.doubleDiscard = statsRules.doubleDiscard(
      action.order,
      currentState.deck,
      currentState.playStacks,
      currentState.playStackDirections,
      variant,
    );
  } else if (action.type === 'play' || action.type === 'clue') {
    stats.doubleDiscard = false;
  }

  // Handle max score calculation
  if (action.type === 'play' || action.type === 'discard') {
    stats.maxScore = statsRules.getMaxScore(
      currentState.deck,
      currentState.playStackDirections,
      variant,
    );
  }

  // Handle pace calculation
  const score = variantRules.isThrowItInAHole(variant) && playing
    ? currentState.numAttemptedCardsPlayed
    : currentState.score;
  stats.pace = statsRules.pace(
    score,
    currentState.cardsRemainingInTheDeck,
    stats.maxScore,
    metadata.options.numPlayers,
    // currentPlayerIndex will be null if the game is over
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);

  // Handle efficiency calculation
  const cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    playing,
    variant,
  );
  stats.efficiency = statsRules.efficiency(cardsGotten, stats.potentialCluesLost);

  // Record the last action
  stats.lastAction = action;

  // Find out which sound effect to play (if this is an ongoing game)
  stats.soundTypeForLastAction = getSoundType(
    stats,
    action,
    originalState,
    currentState,
    metadata,
  );
}, {} as StatsState);

export default statsReducer;

const getSoundType = (
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const ourCharacterID = getCharacterIDForPlayer(
    metadata.ourPlayerIndex,
    metadata.characterAssignments,
  );
  let ourCharacterName = '';
  if (ourCharacterID !== null) {
    const ourCharacter = getCharacter(ourCharacterID);
    ourCharacterName = ourCharacter.name;
  }

  switch (action.type) {
    case 'clue': {
      if (ourCharacterName === 'Quacker') {
        return SoundType.Quack;
      }

      if (variantRules.isCowAndPig(variant)) {
        if (action.clue.type === ClueType.Color) {
          return SoundType.Moo;
        }

        if (action.clue.type === ClueType.Rank) {
          return SoundType.Oink;
        }

        throw new Error('Unknown clue type.');
      }

      if (variantRules.isDuck(variant)) {
        return SoundType.Quack;
      }

      return SoundType.Standard;
    }

    case 'discard': {
      if (action.failed) {
        if (stats.soundTypeForLastAction === SoundType.Fail1) {
          return SoundType.Fail2;
        }

        return SoundType.Fail1;
      }

      if (stats.maxScore < originalState.stats.maxScore) {
        return SoundType.Sad;
      }

      const discardedCard = originalState.deck[action.order];
      const touched = cardRules.isClued(discardedCard);
      if (touched) {
        return SoundType.DiscardClued;
      }

      const lastAction = originalState.stats.lastAction;
      let couldBeLastDiscardedCard = true;
      if (
        lastAction !== null
        && lastAction.type === 'discard'
        && lastAction.suitIndex !== null
        && lastAction.rank !== null
      ) {
        couldBeLastDiscardedCard = discardedCard.possibleCardsFromClues.some(
          ([suitIndex, rank]) => (
            suitIndex === lastAction.suitIndex
            && rank === lastAction.rank
          ),
        );
      }
      if (originalState.stats.doubleDiscard && couldBeLastDiscardedCard) {
        // A player has discarded *in* a double discard situation
        return SoundType.DoubleDiscard;
      }

      if (stats.doubleDiscard) {
        // A player has discarded to *cause* a double discard situation
        return SoundType.DoubleDiscardCause;
      }

      return SoundType.Standard;
    }

    case 'gameOver': {
      if (action.endCondition > EndCondition.Normal) {
        return SoundType.FinishedFail;
      }

      if (currentState.score === variant.maxScore) {
        return SoundType.FinishedPerfect;
      }

      return SoundType.FinishedSuccess;
    }

    case 'play': {
      if (stats.maxScore < originalState.stats.maxScore) {
        return SoundType.Sad;
      }

      const touched = cardRules.isClued(currentState.deck[action.order]);
      if (!touched) {
        if (stats.soundTypeForLastAction === SoundType.Blind1) {
          return SoundType.Blind2;
        }
        if (stats.soundTypeForLastAction === SoundType.Blind2) {
          return SoundType.Blind3;
        }
        if (stats.soundTypeForLastAction === SoundType.Blind3) {
          return SoundType.Blind4;
        }
        if (stats.soundTypeForLastAction === SoundType.Blind4) {
          return SoundType.Blind5;
        }
        if (stats.soundTypeForLastAction === SoundType.Blind5) {
          return SoundType.Blind6;
        }

        return SoundType.Blind1;
      }

      return SoundType.Standard;
    }

    default: {
      // No change
      return stats.soundTypeForLastAction;
    }
  }
};
