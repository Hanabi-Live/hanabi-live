// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from 'immer';
import { getVariant, getCharacter } from '../data/gameData';
import { variantRules, cardRules } from '../rules';
import * as clueTokensRules from '../rules/clueTokens';
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
        stats.potentialCluesLost += clueTokensRules.value(variant);
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

  // Record the last card discarded
  if (action.type === 'discard') {
    stats.lastCardDiscarded = {
      suitIndex: action.suitIndex,
      rank: action.rank,
    };
  }

  // Find out which sound effect to play (if this is an ongoing game)
  switch (action.type) {
    case 'clue': {
      if (ourCharacterName === 'Quacker') {
        stats.soundTypeForLastAction = SoundType.Quack;
      } else if (variantRules.isCowAndPig(variant)) {
        if (action.clue.type === ClueType.Color) {
          stats.soundTypeForLastAction = SoundType.Moo;
        } else if (action.clue.type === ClueType.Rank) {
          stats.soundTypeForLastAction = SoundType.Oink;
        } else {
          throw new Error('Unknown clue type.');
        }
      } else if (variantRules.isDuck(variant)) {
        stats.soundTypeForLastAction = SoundType.Quack;
      } else {
        stats.soundTypeForLastAction = SoundType.Standard;
      }

      break;
    }

    case 'discard': {
      const touched = cardRules.isClued(currentState.deck[action.order]);
      const cardDiscarded = originalState.deck[action.order];
      const lastCardDiscarded = originalState.stats.lastCardDiscarded;
      let couldBeLastDiscardedCard = true;
      if (
        lastCardDiscarded !== null
        && lastCardDiscarded.suitIndex !== null
        && lastCardDiscarded.rank !== null
      ) {
        couldBeLastDiscardedCard = cardDiscarded.possibleCardsFromClues.some(
          ([suitIndex, rank]) => (
            suitIndex === lastCardDiscarded.suitIndex
            && rank === lastCardDiscarded.rank
          ),
        );
      }

      if (action.failed) {
        if (stats.soundTypeForLastAction === SoundType.Fail1) {
          stats.soundTypeForLastAction = SoundType.Fail2;
        } else {
          stats.soundTypeForLastAction = SoundType.Fail1;
        }
      } else if (stats.maxScore < originalState.stats.maxScore) {
        stats.soundTypeForLastAction = SoundType.Sad;
      } else if (false) {
        // TODO
        stats.soundTypeForLastAction = SoundType.Surprise;
      } else if (touched) {
        stats.soundTypeForLastAction = SoundType.DiscardClued;
      } else if (originalState.stats.doubleDiscard && couldBeLastDiscardedCard) {
        // A player has discarded *in* a double discard situation
        stats.soundTypeForLastAction = SoundType.DoubleDiscard;
      } else if (stats.doubleDiscard) {
        // A player has discarded to *cause* a double discard situation
        stats.soundTypeForLastAction = SoundType.DoubleDiscardCause;
      } else {
        stats.soundTypeForLastAction = SoundType.Standard;
      }

      break;
    }

    case 'gameOver': {
      if (action.endCondition > EndCondition.Normal) {
        stats.soundTypeForLastAction = SoundType.FinishedFail;
      } else if (currentState.score === variant.maxScore) {
        stats.soundTypeForLastAction = SoundType.FinishedPerfect;
      } else {
        stats.soundTypeForLastAction = SoundType.FinishedSuccess;
      }

      break;
    }

    case 'play': {
      const touched = cardRules.isClued(currentState.deck[action.order]);
      if (stats.maxScore < originalState.stats.maxScore) {
        stats.soundTypeForLastAction = SoundType.Sad;
      } else if (false) {
        // TODO
        stats.soundTypeForLastAction = SoundType.Surprise;
      } else if (!touched) {
        if (stats.soundTypeForLastAction === SoundType.Blind1) {
          stats.soundTypeForLastAction = SoundType.Blind2;
        } else if (stats.soundTypeForLastAction === SoundType.Blind2) {
          stats.soundTypeForLastAction = SoundType.Blind3;
        } else if (stats.soundTypeForLastAction === SoundType.Blind3) {
          stats.soundTypeForLastAction = SoundType.Blind4;
        } else if (stats.soundTypeForLastAction === SoundType.Blind4) {
          stats.soundTypeForLastAction = SoundType.Blind5;
        } else if (stats.soundTypeForLastAction === SoundType.Blind5) {
          stats.soundTypeForLastAction = SoundType.Blind6;
        } else {
          stats.soundTypeForLastAction = SoundType.Blind1;
        }
      } else {
        stats.soundTypeForLastAction = SoundType.Standard;
      }

      break;
    }

    default: {
      break;
    }
  }
}, {} as StatsState);

export default statsReducer;
