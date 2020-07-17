// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from '../../misc';
import { getVariant } from '../data/gameData';
import { cluesRules } from '../rules';
import { removePossibilities, checkAllPipPossibilities } from '../rules/applyClueCore';
import { GameAction } from '../types/actions';
import CardState, { PipState } from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import Variant from '../types/Variant';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const cardsReducer = (
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = deck.concat([]);

  switch (action.type) {
    // The server just told us about a card that was previously hidden
    // { type: 'cardIdentity', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case 'cardIdentity': {
      if (action.suitIndex === -1 || action.rank === -1) {
        // The server scrubbed the identity information to prevent leaking information
        // (e.g. the card happens to be in our own hand and we are not supposed to know the identity
        // yet)
        break;
      }

      const order = action.order;
      const card = getCard(deck, order);
      if (card.identityDetermined) {
        // We already know the full identity of this card, so we can safely ignore this action
        break;
      }

      const suitIndex = action.suitIndex;
      const rank = action.rank;

      // Now that we know the identity of this card, we can remove card possibilities on other cards
      revealCard(suitIndex, rank, card, newDeck, game, metadata);

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        identityDetermined: true,
      };

      break;
    }

    case 'clue': {
      const clue = action.clue.type === ClueType.Color
        ? colorClue(variant.clueColors[action.clue.value])
        : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // Clues do not have to be applied in certain situations
        if (!cluesRules.shouldApplyClue(action.giver, metadata, variant)) {
          return;
        }

        const card = getCard(newDeck, order);
        const wasKnown = (
          card.rankClueMemory.possibilities.length === 1
          && card.colorClueMemory.possibilities.length === 1
        );

        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        newDeck[order] = newCard;

        if (
          !wasKnown
          && newCard.rankClueMemory.possibilities.length === 1
          && newCard.colorClueMemory.possibilities.length === 1
        ) {
          // If we are currently playing this game and we got clued,
          // this is the first time we identify this card, from the point of view of all hands
          const handsSeeingCardForFirstTime = (
            !metadata.spectating
            && metadata.ourPlayerIndex === card.location
          )
            ? game.hands // All hands
            : [game.hands[card.location as number]]; // Just who is seeing this for the first time
          for (const hand of handsSeeingCardForFirstTime) {
            removePossibilityOnHand(
              newDeck,
              hand,
              order,
              newCard.suitIndex!,
              newCard.rank!,
              variant,
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
          segmentFirstClued: game.turn.segment!,
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
      const suitIndex = nullIfNegative(action.suitIndex);
      const rank = nullIfNegative(action.rank);

      // If we know the full identity of this card, we can remove card possibilities on other cards
      const identityDetermined = revealCard(suitIndex, rank, card, newDeck, game, metadata);

      let segmentPlayed = card.segmentPlayed;
      let segmentDiscarded = card.segmentDiscarded;
      let location = card.location;
      let isMisplayed = card.isMisplayed;

      if (action.type === 'play') {
        location = 'playStack';
        segmentPlayed = game.turn.segment;
      } else {
        location = 'discard';
        segmentDiscarded = game.turn.segment;
        if (action.failed) {
          isMisplayed = true;
        }
      }

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        identityDetermined,
        segmentPlayed,
        segmentDiscarded,
        location,
        isMisplayed,
      };
      break;
    }

    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (
        game.turn.currentPlayerIndex !== action.playerIndex
        // Prevent validation during the initial draw; during this phase of the game,
        // the person drawing cards will not necessarily correspond to the person whose turn it is
        && game.turn.turnNum > 0
      ) {
        console.warn(`The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`);
        console.warn(`Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`);
      }

      const initial = initialCardState(action.order, variant);

      // Remove all possibilities of all cards previously drawn and visible
      const possibilitiesToRemove = deck.slice(0, action.order)
        .filter((card) => card.suitIndex !== null && card.rank !== null)
        .filter((card) => card.location !== action.playerIndex
        || (
          card.colorClueMemory.possibilities.length === 1
          && card.rankClueMemory.possibilities.length === 1
        ))
        .map((card) => ({ suitIndex: card.suitIndex!, rank: card.rank!, all: false }));

      const possibleCards = removePossibilities(initial.possibleCards, possibilitiesToRemove);
      const pipPossibilities = checkAllPipPossibilities(possibleCards, variant);

      const suitPipStates = initial.colorClueMemory.pipStates.map(
        (pipState, suitIndex) => (
          !pipPossibilities.suitsPossible[suitIndex] && pipState !== 'Hidden'
            ? 'Eliminated'
            : pipState
        ),
      );

      const rankPipStates = initial.rankClueMemory.pipStates.map(
        (pipState, rank) => (
          !pipPossibilities.ranksPossible[rank] && pipState !== 'Hidden'
            ? 'Eliminated'
            : pipState
        ),
      );

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        segmentDrawn: game.turn.segment,
        colorClueMemory: {
          ...initial.colorClueMemory,
          pipStates: suitPipStates,
        },
        rankClueMemory: {
          ...initial.rankClueMemory,
          pipStates: rankPipStates,
        },
        possibleCards,
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
            variant,
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

const removePossibilityOnHand = (
  deck: CardState[],
  hand: readonly number[],
  order: number,
  suitIndex: number,
  rank: number,
  variant: Variant,
) => {
  const cardsExceptCardBeingRemoved = hand
    .filter((o) => o !== order)
    .map((o) => deck[o]);

  for (const handCard of cardsExceptCardBeingRemoved) {
    const newCard = removePossibility(handCard, suitIndex, rank, false, variant);
    deck[handCard.order] = newCard;
  }
};

const removePossibility = (
  state: CardState,
  suitIndex: number,
  rank: number,
  all: boolean,
  variant: Variant,
) => {
  // Every card has a possibility map that maps card identities to count
  const possibleCards = Array.from(state.possibleCards, (arr) => Array.from(arr));
  let cardsLeft = possibleCards[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "possibleCards" map for card.`);
  }
  if (cardsLeft > 0) {
    // Remove one or all possibilities for this card,
    // (depending on whether the card was clued or if we saw someone draw a copy of this card)
    cardsLeft = all ? 0 : cardsLeft - 1;
  }

  possibleCards[suitIndex][rank] = cardsLeft;

  // Check to see if we can put an X over this suit pip or this rank pip
  const suitPipStates = Array.from(state.colorClueMemory.pipStates);
  const suitPossible = variant.ranks.some((r) => possibleCards[suitIndex][r] > 0);

  if (!suitPossible && suitPipStates[suitIndex] !== 'Hidden') {
    suitPipStates[suitIndex] = 'Eliminated';
  }

  const rankPipStates: PipState[] = [];
  variant.ranks.forEach((r) => { rankPipStates[r] = state.rankClueMemory.pipStates[r]; });
  const rankPossible = variant.suits.some((_, i) => possibleCards[i][rank] > 0);

  if (!rankPossible && rankPipStates[rank] !== 'Hidden') {
    rankPipStates[rank] = 'Eliminated';
  }

  return {
    ...state,
    possibleCards,
    colorClueMemory: {
      ...state.colorClueMemory,
      pipStates: suitPipStates,
    },
    rankClueMemory: {
      ...state.rankClueMemory,
      pipStates: rankPipStates,
    },
  };
};

const getCard = (deck: readonly CardState[], order: number) => {
  const card = deck[order];
  if (card === undefined) {
    throw new Error(`Failed to get the card for index ${order}.`);
  }
  return card;
};

const revealCard = (
  suitIndex: number | null,
  rank: number | null,
  card: CardState,
  newDeck: CardState[],
  game: GameState,
  metadata: GameMetadata,
) => {
  // Local variables
  const variant = getVariant(metadata.options.variantName);

  // The action from the server did not specify the identity of the card, so we cannot reveal it
  // (e.g. we are playing a special variant where cards are not revealed when they are played)
  if (suitIndex === null || rank === null) {
    return false;
  }

  // If the card was already fully-clued,
  // we have already revealed it and updated the possibilities on other cards
  if (card.identityDetermined) {
    return true;
  }

  // If we are currently playing this game, this is the first time we see this card,
  // from the point of view of all hands
  const handsSeeingCardForFirstTime = (
    !metadata.spectating
    && metadata.ourPlayerIndex === card.location
  )
    ? game.hands // All hands
    : [game.hands[card.location as number]]; // Just who's seeing this for the first time
  for (const hand of handsSeeingCardForFirstTime) {
    removePossibilityOnHand(newDeck, hand, card.order, suitIndex, rank, variant);
  }

  return true;
};
