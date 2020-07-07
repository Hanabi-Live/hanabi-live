// The "gameAction" WebSocket command communicate a change in the game state

import Konva from 'konva';
import { nullIfNegative } from '../../misc';
// import { getCharacter } from '../data/gameData';
import * as variantRules from '../rules/variant';
import {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionReorder,
  ActionStatus,
  ActionStrike,
  ActionTurn,
  ActionIncludingHypothetical,
  ActionReveal,
} from '../types/actions';
import { MAX_CLUE_NUM } from '../types/constants';
import * as arrows from './arrows';
import cardStatusCheck from './cardStatusCheck';
import { msgClueToClue } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';
import LayoutChild from './LayoutChild';
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
  if (actionFunction === undefined) {
    throw new Error(`A WebSocket action function for "${data.type}" is not defined.`);
  }
  actionFunction(data);
}

// Define a command handler map
type ActionFunction = (data: any) => void;
const actionFunctions = new Map<ActionIncludingHypothetical['type'], ActionFunction>();

actionFunctions.set('clue', (data: ActionClue) => {
  // The clue comes from the server as an integer, so convert it to an object
  const clue = msgClueToClue(data.clue, globals.variant);

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  for (let i = 0; i < data.list.length; i++) {
    const card = globals.deck[data.list[i]];

    arrows.set(i, card, data.giver, clue);
  }

  if (!globals.animateFast) {
    globals.layers.card.batchDraw();
  }
});

actionFunctions.set('discard', (data: ActionDiscard) => {
  // In "Throw It in a Hole" variants, convert misplays to real plays
  if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay && data.failed) {
    actionFunctions.get('play')!(data);
    return;
  }

  // Local variables
  const card = globals.deck[data.which.order];

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  // Turn off Empathy on this card
  // It is redrawn in the reveal() function
  card.empathy = false;

  // TODO: migrate to states
  // if (card.state.isMisplayed && !globals.animateFast && !globals.options.speedrun) {
  //   // If this card was misplayed,
  //   // it will automatically tween to the discard pile after reaching the play stacks
  //   card.doMisplayAnimation = true;
  //   card.animateToPlayStacks();
  // } else {
  //   card.animateToDiscardPile();
  // }

  // The fact that this card was discarded could make some other cards useless or critical
  cardStatusCheck();
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

actionFunctions.set('gameOver', () => {
  // Do nothing
  // (the "gameOver" command is handled inside the turn reducer)
});

actionFunctions.set('play', (data: ActionPlay) => {
  // Local variables
  const card = globals.deck[data.which.order];

  globals.numCardsPlayed += 1;
  globals.elements.playsNumberLabel!.text(globals.numCardsPlayed.toString());

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  // Turn off Empathy on this card
  // It is redrawn in the reveal() function
  card.empathy = false;

  // The fact that this card was played could make some other cards useless or critical
  cardStatusCheck();
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

actionFunctions.set('stackDirections', () => {

  // Nothing! TODO: delete this
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
  if (globals.animateFast) {
    strikeX.opacity(1);
  } else {
    strikeX.tween = new Konva.Tween({
      node: strikeX,
      opacity: 1,
      duration: 1,
    }).play();
  }

  // Record the turn that the strike happened and the card that was misplayed
  strikeRecord(data);
});

// A new line of text has appeared in the action log
actionFunctions.set('text', () => {
  // Nothing! TODO: remove
});

actionFunctions.set('reveal', (data: ActionReveal) => {
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

  // Update the current player in the middle of the screen
  // Optimization: this function is expensive, so only
  // do it in replays if this is the correct turn
  if (!globals.replay || globals.replayTurn === globals.turn) {
    updateCurrentPlayerArea();
  }

  // Show the black rectangle over the hand that signifies that it is their turn
  if (globals.currentPlayerIndex !== -1) {
    for (const rect of globals.elements.playerHandTurnRects) {
      rect.hide();
    }
    globals.elements.playerHandTurnRects[globals.currentPlayerIndex].show();
  }

  // If there are no cards left in the deck, update the "Turns left: #" label
  if (globals.deckSize === 0) {
    if (globals.endTurn === null) {
      globals.endTurn = globals.turn + globals.playerNames.length;
    }
    let numTurnsLeft = globals.endTurn - globals.turn;

    // Also account for the fact that in non-replays,
    // an extra turn is sent to show the times separately from the final action
    if (numTurnsLeft < 0) {
      numTurnsLeft = 0;
    }

    globals.elements.deckTurnsRemainingLabel2!.text(`left: ${numTurnsLeft}`);
  }

  if (globals.sharedReplay && globals.amSharedReplayLeader) {
    globals.elements.enterHypoButton!.setEnabled(globals.currentPlayerIndex !== -1);
  }

  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
  }
});
