// The "gameAction" WebSocket command communicate a change in the game state

import { nullIfNegative } from '../../misc';
// import { getCharacter } from '../data/gameData';
import * as variantRules from '../rules/variant';
import {
  ActionDiscard,
  ActionDraw,
  ActionIncludingHypothetical,
  ActionMorph,
  ActionPlay,
  ActionReorder,
  ActionStatus,
  ActionStrike,
  ActionTurn,
} from '../types/actions';
import { MAX_CLUE_NUM } from '../types/constants';
import globals from './globals';
import HanabiCard from './HanabiCard';
import { animate } from './konvaHelpers';
import LayoutChild from './LayoutChild';
import statusCheckOnAllCards from './statusCheckOnAllCards';
import strikeRecord from './strikeRecord';
import updateCurrentPlayerArea from './updateCurrentPlayerArea';

// The server has sent us a new game action
// (either during an ongoing game or as part of a big list that was sent upon loading a new
// game/replay)
export default function action(data: ActionIncludingHypothetical) {
  // If a user is editing a note and an action in the game happens,
  // mark to make the tooltip go away as soon as they are finished editing the note
  if (globals.editingNote !== null) {
    globals.actionOccurred = true;
  }

  const actionFunction = actionFunctions.get(data.type);
  if (actionFunction !== undefined) {
    actionFunction(data);
  }
}

// Define a command handler map
type ActionFunction = (data: any) => void;
const actionFunctions = new Map<ActionIncludingHypothetical['type'], ActionFunction>();

actionFunctions.set('discard', (data: ActionDiscard) => {
  // In "Throw It in a Hole" variants, convert misplays to real plays
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay && data.failed) {
    actionFunctions.get('play')!(data);
    return;
  }

  // Local variables
  const card = globals.deck[data.which.order];

  // Turn off Empathy on this card
  // It is redrawn in the reveal() function
  card.empathy = false;

  // The fact that this card was discarded could make some other cards useless or critical
  statusCheckOnAllCards();
});

// A player just drew a card from the deck
actionFunctions.set('draw', (data: ActionDraw) => {
  // Local variables
  const { order } = data;
  // Suit and rank come from the server as -1 if the card is unknown
  // (e.g. being drawn to the current player's hand)
  // We want to convert this to just being null
  const suitIndex = nullIfNegative(data.suitIndex);
  const rank = nullIfNegative(data.rank);
  // const holder = data.who;

  // If we are the "Slow-Witted" character, we are not supposed to be able to see other people's
  // cards that are in slot 1
  /*
  const ourCharacterID = globals.characterAssignments[globals.playerUs];
  if (ourCharacterID !== null) {
    const ourCharacter = getCharacter(ourCharacterID);
    if (ourCharacter.name === 'Slow-Witted') {
      if (suitIndex !== null || rank !== null) {
        globals.characterRememberedCards[order] = {
          suitIndex,
          rank,
        };
        suitIndex = null;
        rank = null;
      }

      // Since someone is drawing a card, we can potentially reveal the other cards in the hand
      const hand = globals.elements.playerHands[holder];
      hand.children.each((layoutChild) => {
        const card: HanabiCard = layoutChild.children[0] as HanabiCard;
        const rememberedCard = globals.characterRememberedCards[card.state.order];
        if (rememberedCard && rememberedCard.suitIndex !== null && rememberedCard.rank !== null) {
          card.reveal(rememberedCard.suitIndex, rememberedCard.rank);
        }
      });
    }
  }
  */

  /*
  if (globals.cardIdentities.length !== 0) {
    // If we are in a shared replay that was converted from a game in which we were one of the
    // players, then suit and rank will be still be null for the cards that were dealt to us
    // Since we are in a shared replay, this is a mistake, because we should have full knowledge of
    // what the card is (from the "cardIdentities" message that is sent at the end of the game)
    const card = globals.deck[order];
    card.replayRedraw();
    suitIndex = card.state.suitIndex;
    rank = card.state.rank;
  }
  */

  // Remove one card from the deck
  globals.deckSize -= 1;
  globals.indexOfLastDrawnCard = order;
  globals.elements.deck!.setCount(globals.deckSize);

  // Cards are created on first initialization for performance reasons
  // So, since this card was just drawn, refresh all the variables on the card
  // (this is necessary because we might be rewinding in a replay)
  const card = globals.deck[order];
  // Suit and rank will be null if we don't know the suit/rank
  card.refresh(suitIndex, rank);
  card.parent!.show();
});

actionFunctions.set('play', (data: ActionPlay) => {
  // Local variables
  const card = globals.deck[data.which.order];

  // Turn off Empathy on this card
  // It is redrawn in the reveal() function
  card.empathy = false;

  // The fact that this card was played could make some other cards useless or critical
  statusCheckOnAllCards();
});

// Has the following data:
// {
//   type: 'reorder',
//   target: 0, // The index of the player
//   handOrder: [1, 2, 3, 4, 0], // An array of card orders
// }
actionFunctions.set('reorder', (data: ActionReorder) => {
  // Make a list of card orders currently in the hand
  const hand = globals.elements.playerHands[data.target];
  const currentCardOrders: number[] = [];
  for (const layoutChild of hand.children.toArray() as LayoutChild[]) {
    const card = layoutChild.children[0] as unknown as HanabiCard;
    currentCardOrders.push(card.state.order);
  }

  for (let i = 0; i < data.handOrder.length; i++) {
    const newCardOrderForThisSlot = data.handOrder[i];
    if (typeof newCardOrderForThisSlot !== 'number') {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const currentIndexOfNewCard = currentCardOrders.indexOf(newCardOrderForThisSlot);
    const numMoveDown = currentIndexOfNewCard - i;
    const card = globals.deck[newCardOrderForThisSlot];
    if (card === undefined) {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const layoutChild = card.parent as unknown as LayoutChild; // All cards should have parents
    for (let j = 0; j < numMoveDown; j++) {
      layoutChild.moveDown();
    }
  }
});

actionFunctions.set('status', (data: ActionStatus) => {
  // Update internal state variables
  globals.clues = data.clues;
  if (variantRules.isClueStarved(globals.variant)) {
    // In "Clue Starved" variants, 1 clue is represented on the server by 2
    // Thus, in order to get the "real" clue count, we have to divide by 2
    globals.clues /= 2;
  }
  globals.score = data.score;
  globals.maxScore = data.maxScore;

  if (!globals.lobby.settings.realLifeMode) {
    if (globals.clues === MAX_CLUE_NUM) {
      // Show the red border around the discard pile
      // (to reinforce that the current player cannot discard)
      globals.elements.noDiscardBorder!.show();
      globals.elements.noDoubleDiscardBorder!.hide();
    } else if (data.doubleDiscard && globals.lobby.settings.hyphenatedConventions) {
      // Show a yellow border around the discard pile
      // (to reinforce that this is a "Double Discard" situation)
      globals.elements.noDiscardBorder!.hide();
      globals.elements.noDoubleDiscardBorder!.show();
    } else {
      globals.elements.noDiscardBorder!.hide();
      globals.elements.noDoubleDiscardBorder!.hide();
    }
  }

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
  }
});

// Data is as follows:
// {
//   type: 'strike',
//   num: 1,
//   order: 4, // The order of the card that was misplayed
//   turn: 2,
// }
actionFunctions.set('strike', (data: ActionStrike) => {
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay) {
    return;
  }

  // Local variables
  const i = data.num - 1;
  const strikeX = globals.elements.strikeXs[i];

  // Animate the strike square fading in
  animate(strikeX, { duration: 1, opacity: 1 });

  // Record the turn that the strike happened and the card that was misplayed
  strikeRecord(data);
});

actionFunctions.set('morph', (data: ActionMorph) => {
  console.log(data, 'TODO');
  /*
  // This is the reveal for hypotheticals when a card is morphed
  // The code here is copied from the "websocket.ts" file
  let card = globals.deck[data.order];
  if (!card) {
    card = globals.stackBases[data.order - globals.deck.length];
  }
  if (!card) {
    throw new Error('Failed to get the card in the "reveal" command.');
  }

  card.convert(data.suitIndex, data.rank);
  globals.layers.card.batchDraw();
  */
});

actionFunctions.set('turn', (data: ActionTurn) => {
  // Store the current turn in memory
  globals.turn = data.num;
  globals.currentPlayerIndex = data.who;

  // Update the "Current Player" area in the middle of the screen
  // Optimization: this function is expensive, so only
  // do it in replays if this is the correct turn
  if (!globals.replay || globals.replayTurn === globals.turn) {
    updateCurrentPlayerArea();
  }

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
  }
});
