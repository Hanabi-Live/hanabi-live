// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from '../../misc';
import { getVariant, getCharacter } from '../data/gameData';
import { variantRules } from '../rules';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';
import { getCharacterIDForPlayer } from './reducerHelpers';

const cardsReducer = (
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = deck.concat([]);

  switch (action.type) {
    case 'clue': {
      const clue = action.clue.type === ClueType.Color
        ? colorClue(variant.clueColors[action.clue.value])
        : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // Clues do not have to be applied in certain situations
        const giverCharacterID = getCharacterIDForPlayer(
          action.giver,
          metadata.characterAssignments,
        );
        let giverCharacterName = '';
        if (giverCharacterID !== null) {
          const giverCharacter = getCharacter(giverCharacterID);
          giverCharacterName = giverCharacter.name;
        }
        if (
          variantRules.isCowAndPig(variant)
        || variantRules.isDuck(variant)
        || giverCharacterName === 'Quacker'
        ) {
          return;
        }

        const card = getCard(newDeck, order);
        const wasKnown = (card.possibleCardsFromClues.length === 1);

        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        newDeck[order] = newCard;

        if (
          !wasKnown
          && newCard.possibleCardsFromClues.length === 1
        ) {
          // If we're currently playing this game and we got clued, this is the first time
          // we identify this card, from the point of view of all hands
          const handsSeeingCardForFirstTime = (
            !metadata.spectating
            && metadata.ourPlayerIndex === card.location
          )
            ? game.hands // All hands
            : [game.hands[card.location as number]]; // Just who's seeing this for the first time
          for (const hand of handsSeeingCardForFirstTime) {
            removePossibilityOnHand(
              newDeck,
              hand,
              order,
              newCard.suitIndex!,
              newCard.rank!,
            );
          }
        }
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(newDeck, order);
        newDeck[order] = {
          ...getCard(newDeck, order),
          numPositiveClues: card.numPositiveClues + 1,
          turnsClued: [...card.turnsClued, game.turn.turnNum],
        };
        applyClue(order, true);
      });

      // Negative clues
      game.hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => applyClue(order, false));

      break;
    }

    case 'discard':
    case 'play': {
      const order = action.order;
      const card = getCard(deck, order);

      // Reveal all cards played and discarded
      const suitIndex = nullIfNegative(action.suitIndex);
      const rank = nullIfNegative(action.rank);

      const identityDetermined = card.possibleCardsFromClues.length === 1;

      // If the card was already fully-clued,
      // we already updated the possibilities for it on other cards
      if (suitIndex !== null && rank !== null && !identityDetermined) {
        // If we're currently playing this game, this is the first time
        // we see this card, from the point of view of all hands
        const handsSeeingCardForFirstTime = (
          !metadata.spectating
          && metadata.ourPlayerIndex === card.location
        )
          ? game.hands // All hands
          : [game.hands[card.location as number]]; // Just who's seeing this for the first time
        for (const hand of handsSeeingCardForFirstTime) {
          removePossibilityOnHand(newDeck, hand, order, suitIndex, rank);
        }
      }

      let turnPlayed = card.turnPlayed;
      let turnDiscarded = card.turnDiscarded;
      let location = card.location;
      let isMisplayed = card.isMisplayed;

      if (action.type === 'play') {
        turnPlayed = game.turn.turnNum;
        location = 'playStack';
      } else {
        turnDiscarded = game.turn.turnNum;
        location = 'discard';
        if (action.failed) {
          isMisplayed = true;
        }
      }

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        turnPlayed,
        turnDiscarded,
        location,
        isMisplayed,
        suitDetermined: card.suitDetermined || suitIndex !== null,
        rankDetermined: card.rankDetermined || rank !== null,
      };
      break;
    }

    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (
        game.turn.currentPlayerIndex !== action.playerIndex
        // Prevent validation during the initial draw; during this phase of the game, the person
        // drawing cards will not necessarily correspond to the person whose turn it is
        && game.turn.turnNum > 0
      ) {
        console.warn(`The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`);
        console.warn(`Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`);
      }

      const initial = initialCardState(action.order, variant);
      const possibleCardsFromObservation = Array.from(
        initial.possibleCardsFromObservation,
        (arr) => Array.from(arr),
      );
      // Remove all possibilities of all cards previously drawn and visible
      deck.slice(0, action.order)
        .filter((card) => card.suitIndex !== null && card.rank !== null)
        .filter((card) => card.location !== action.playerIndex
          || card.possibleCardsFromClues.length === 1)
        .forEach((card) => { possibleCardsFromObservation[card.suitIndex!][card.rank!] -= 1; });

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        turnDrawn: game.turn.turnNum,
        possibleCardsFromObservation,
      };

      newDeck[action.order] = drawnCard;

      // If the card was drawn by a player we can see, update possibilities
      // on all hands, except for the player that didn't see it
      if (drawnCard.suitIndex != null && drawnCard.rank != null) {
        for (const hand of game.hands.filter((_, i) => i !== drawnCard.location)) {
          removePossibilityOnHand(
            newDeck,
            hand,
            action.order,
            drawnCard.suitIndex!,
            drawnCard.rank!,
          );
        }
      }

      break;
    }

    // Some actions do not affect the card state
    case 'gameOver':
    case 'gameDuration':
    case 'playerTimes':
    case 'playStackDirections':
    case 'reorder':
    case 'status':
    case 'strike':
    case 'turn': {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }
  return newDeck;
};

export default cardsReducer;

// -------
// Helpers
// -------

function removePossibilityOnHand(
  deck: CardState[],
  hand: readonly number[],
  order: number,
  suitIndex: number,
  rank: number,
) {
  const cardsExceptCardBeingRemoved = hand
    .filter((o) => o !== order)
    .map((o) => deck[o]);

  for (const handCard of cardsExceptCardBeingRemoved) {
    const newCard = removePossibility(handCard, suitIndex, rank);
    deck[handCard.order] = newCard;
  }
}

function removePossibility(
  state: CardState,
  suitIndex: number,
  rank: number,
) {
  // Every card has a possibility map that maps card identities to count
  const possibleCardsFromObservation = Array.from(
    state.possibleCardsFromObservation,
    (arr) => Array.from(arr),
  );
  const cardsLeft = possibleCardsFromObservation[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "possibleCardsFromObservation" map for card.`);
  }

  possibleCardsFromObservation[suitIndex][rank] = cardsLeft - 1;

  return {
    ...state,
    possibleCardsFromObservation,
  };
}

function getCard(deck: readonly CardState[], order: number) {
  const card = deck[order];
  if (card === undefined) {
    console.error(`Failed to get the card for index ${order}.`);
  }
  return card;
}
