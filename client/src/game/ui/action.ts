// The "gameAction" WebSocket command communicate a change in the game state

// Imports
import Konva from 'konva';
import {
  CARD_W,
  LABEL_COLOR,
} from '../../constants';
import {
  Action,
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionReorder,
  ActionStackDirections,
  ActionStatus,
  ActionStrike,
  ActionText,
  ActionTurn,
} from '../types/actions';
import ClueType from '../types/ClueType';
import { MAX_CLUE_NUM } from '../types/constants';
import StackDirection from '../types/StackDirection';
import * as arrows from './arrows';
import cardStatusCheck from './cardStatusCheck';
import ClueEntry from './ClueEntry';
import { msgClueToClue, msgSuitToSuit } from './convert';
import globals from './globals';
import HanabiCard from './HanabiCard';
import { ActionIncludingHypothetical, ActionReveal } from './hypothetical';
import LayoutChild from './LayoutChild';
import possibilitiesCheck from './possibilitiesCheck';
import * as stats from './stats';
import strikeRecord from './strikeRecord';
import updateCurrentPlayerArea from './updateCurrentPlayerArea';
import * as reversible from './variants/reversible';

// The server has sent us a new game action
// (either during an ongoing game or as part of a big list that was sent upon loading a new
// game/replay)
export default (data: Action) => {
  // If a user is editing a note and an action in the game happens,
  // mark to make the tooltip go away as soon as they are finished editing the note
  if (globals.editingNote !== null) {
    globals.actionOccured = true;
  }

  // Automatically close any tooltips once an action in the game happens
  if (globals.activeHover !== null) {
    globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
    globals.activeHover = null;
  }

  const actionFunction = actionFunctions.get(data.type);
  if (typeof actionFunction === 'undefined') {
    throw new Error(`A WebSocket action function for "${data.type}" is not defined.`);
  }
  actionFunction(data);
};

// Define a command handler map
const actionFunctions = new Map<ActionIncludingHypothetical['type'], any>();

actionFunctions.set('clue', (data: ActionClue) => {
  // The clue comes from the server as an integer, so convert it to an object
  const clue = msgClueToClue(data.clue, globals.variant);

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  globals.cluesSpentPlusStrikes += 1;
  stats.updateEfficiency(0);

  for (let i = 0; i < data.list.length; i++) {
    const card = globals.deck[data.list[i]];

    if (!card.isClued()) {
      stats.updateEfficiency(1);
    } else {
      stats.updateEfficiency(0);
    }

    card.numPositiveClues += 1;

    arrows.set(i, card, data.giver, clue);

    card.setClued();
    if (
      !globals.lobby.settings.realLifeMode
      && !globals.variant.name.startsWith('Cow & Pig')
      && !globals.variant.name.startsWith('Duck')
      && !(
        globals.characterAssignments[data.giver!] === 'Quacker'
        && card.holder === globals.playerUs
        && !globals.replay
      )
    ) {
      card.applyClue(clue, true);
      card.checkReapplyRankClues();
      card.checkReapplyColorClues();
      card.setBareImage();
    }
  }

  const negativeList = [];
  for (let i = 0; i < globals.elements.playerHands[data.target].children.length; i++) {
    const child = globals.elements.playerHands[data.target].children[i];

    const card = child.children[0];
    const { order } = card;

    if (data.list.indexOf(order) < 0) {
      negativeList.push(order);
      if (
        !globals.lobby.settings.realLifeMode
        && !globals.variant.name.startsWith('Cow & Pig')
        && !globals.variant.name.startsWith('Duck')
        && !(
          globals.characterAssignments[data.giver!] === 'Quacker'
          && card.holder === globals.playerUs
          && !globals.replay
        )
      ) {
        card.applyClue(clue, false);
        card.checkReapplyRankClues();
        card.checkReapplyColorClues();
        card.setBareImage();
      }
    }
  }

  // Add an entry to the clue log
  let clueName;
  if (data.clue.type === ClueType.Color) {
    if (typeof clue.value === 'number') {
      throw new Error('The value of a color clue was a number.');
    }
    clueName = clue.value.name;
  } else if (data.clue.type === ClueType.Rank) {
    clueName = clue.value.toString();
  }
  if (globals.variant.name.startsWith('Cow & Pig')) {
    if (data.clue.type === ClueType.Color) {
      clueName = 'Moo';
    } else if (data.clue.type === ClueType.Rank) {
      clueName = 'Oink';
    }
  } else if (
    globals.variant.name.startsWith('Duck')
    || globals.characterAssignments[data.giver!] === 'Quacker'
  ) {
    clueName = 'Quack';
  }

  const entry = new ClueEntry({
    width: globals.elements.clueLog!.width(),
    height: 0.017 * globals.stage.height(),
    giver: globals.playerNames[data.giver],
    target: globals.playerNames[data.target],
    clueName,
    list: data.list,
    negativeList,
    turn: data.turn,
  });
  globals.elements.clueLog!.addClue(entry);

  if (!globals.animateFast) {
    globals.layers.card.batchDraw();
  }
});

actionFunctions.set('deckOrder', () => {
  // If we are exiting a hypothetical, we might re-receive a deckOrder command
  // If this is the case, we don't need to do anything,
  // as the order should already be stored in the global variables
});

actionFunctions.set('discard', (data: ActionDiscard) => {
  // In "Throw It in a Hole" variants, convert misplays to real plays
  if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay && data.failed) {
    actionFunctions.get('play')(data);
    return;
  }

  // Local variables
  const card = globals.deck[data.which.order];

  card.isDiscarded = true;
  card.turnDiscarded = globals.turn;
  card.isMisplayed = data.failed;

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  card.reveal(data.which.suit, data.which.rank);
  card.removeFromParent();
  card.setClued();

  if (card.isMisplayed && !globals.animateFast && !globals.options.speedrun) {
    // If this card was misplayed,
    // it will automatically tween to the discard pile after reaching the play stacks
    card.doMisplayAnimation = true;
    card.animateToPlayStacks();
  } else {
    card.animateToDiscardPile();
  }

  // The fact that this card was discarded could make some other cards useless or critical
  cardStatusCheck();

  if (card.isClued()) {
    stats.updateEfficiency(-1);
  }
});

// A player just drew a card from the deck
actionFunctions.set('draw', (data: ActionDraw) => {
  // Local variables
  const { order } = data;
  // Suit and rank come from the server as -1 if the card is unknown
  // (e.g. being drawn to the current player's hand)
  // We want to convert this to just being null
  // Suit comes from the server as an integer, so we also need to convert it to a Suit object
  let suit = data.suit === -1 ? null : msgSuitToSuit(data.suit, globals.variant);
  let rank = data.rank === -1 ? null : data.rank;
  const holder = data.who;

  // If we are the "Slow-Witted" character, we are not supposed to be able to see other people's
  // cards that are in slot 1
  if (globals.characterAssignments[globals.playerUs] === 'Slow-Witted') {
    if (suit !== null || rank !== null) {
      globals.characterRememberedCards[order] = {
        suit: data.suit,
        rank: data.rank,
      };
      suit = null;
      rank = null;
    }

    // Since we are drawing a card, we can potentially reveal the other cards in the hand
    const hand = globals.elements.playerHands[holder];
    for (const layoutChild of hand.children.toArray()) {
      const card: HanabiCard = layoutChild.children[0];
      const rememberedCard = globals.characterRememberedCards[card.order];
      if (rememberedCard) {
        card.reveal(rememberedCard.suit, rememberedCard.rank);
      }
    }
  }

  // If we are in a shared replay that was converted from a game in which we were one of the
  // players, then suit and rank will be still be null for the cards that were dealt to us
  // Since we are in a shared replay, this is a mistake, because we should have full knowledge of
  // what the card is (from the "deckOrder" message that is sent at the end of the game)
  // The exception is when we are in a hypothetical and "hypoRevealed" is turned off
  if (globals.deckOrder.length !== 0 && (!globals.hypothetical || globals.hypoRevealed)) {
    if (suit === null) {
      const suitNum = globals.deckOrder[order].suit;
      suit = msgSuitToSuit(suitNum, globals.variant);
    }
    if (rank === null) {
      rank = globals.deckOrder[order].rank;
    }
  }

  // Remove one card from the deck
  globals.deckSize -= 1;
  globals.indexOfLastDrawnCard = order;
  globals.elements.deck!.setCount(globals.deckSize);

  // Keep track of which cards we have learned for the purposes of
  // showing the true card face in the in-game replay
  // (this has to be done before the card is initialized)
  if (suit !== null && rank !== null) {
    const learnedCard = globals.learnedCards[order];
    learnedCard.suit = suit;
    learnedCard.rank = rank;
    learnedCard.revealed = true;
  }

  // Cards are created on first initialization for performance reasons
  // So, since this card was just drawn, refresh all the variables on the card
  // (this is necessary because we might be rewinding in a replay)
  const card = globals.deck[order];
  card.holder = holder;
  card.suit = suit; // This will be null if we don't know the suit
  card.rank = rank; // This will be null if we don't know the rank
  card.refresh();
  if (suit && rank) {
    // Hide the pips if we have full knowledge of the suit / rank
    card.suitPips!.visible(false);
    card.rankPips!.visible(false);
  }

  // Each card is contained within a LayoutChild
  // Position the LayoutChild over the deck
  const child = card.parent as unknown as LayoutChild;
  // Sometimes the LayoutChild can get hidden if another card is on top of it in a play stack
  // and the user rewinds to the beginning of the replay
  child!.visible(true);
  child!.opacity(1); // Cards can be faded in certain variants
  const pos = globals.elements.deck!.cardBack.getAbsolutePosition();
  child!.setAbsolutePosition(pos);
  child!.rotation(-globals.elements.playerHands[holder].rotation());
  const scale = globals.elements.deck!.cardBack.width() / CARD_W;
  child!.scale({
    x: scale,
    y: scale,
  });

  // Add it to the player's hand (which will automatically tween the card)
  globals.elements.playerHands[holder].addChild(child);
  globals.elements.playerHands[holder].moveToTop();

  // If this card is known,
  // then remove it from the card possibilities for the players who see this card
  if (suit && rank) {
    if (possibilitiesCheck()) {
      for (let i = 0; i < globals.elements.playerHands.length; i++) {
        if (i === holder) {
          // We can't update the player who drew this card,
          // because they do not know what it is yet
          continue;
        }
        const hand = globals.elements.playerHands[i];
        for (const layoutChild of hand.children.toArray()) {
          const handCard = layoutChild.children[0];
          handCard.removePossibility(suit, rank, false);
        }
      }
    }
  }
});

actionFunctions.set('play', (data: ActionPlay) => {
  // Local variables
  const card = globals.deck[data.which.order];

  card.isPlayed = true;
  card.turnPlayed = globals.turn;
  globals.numCardsPlayed += 1;
  globals.elements.playsNumberLabel!.text(globals.numCardsPlayed.toString());

  // Clear all visible arrows when a new move occurs
  arrows.hideAll();

  card.reveal(data.which.suit, data.which.rank);
  card.removeFromParent();
  card.setClued();
  card.animateToPlayStacks();

  // The fact that this card was played could make some other cards useless or critical
  cardStatusCheck();

  if (!card.isClued()) {
    stats.updateEfficiency(1);
  }
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
    currentCardOrders.push(card.order);
  }

  for (let i = 0; i < data.handOrder.length; i++) {
    const newCardOrderForThisSlot = data.handOrder[i];
    if (typeof newCardOrderForThisSlot !== 'number') {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const currentIndexOfNewCard = currentCardOrders.indexOf(newCardOrderForThisSlot);
    const numMoveDown = currentIndexOfNewCard - i;
    const card = globals.deck[newCardOrderForThisSlot];
    if (typeof card === 'undefined') {
      throw new Error(`Received an invalid card order of ${newCardOrderForThisSlot} in the "reorder" action.`);
    }
    const layoutChild = card.parent as unknown as LayoutChild; // All cards should have parents
    for (let j = 0; j < numMoveDown; j++) {
      layoutChild.moveDown();
    }
  }
});

actionFunctions.set('stackDirections', (data: ActionStackDirections) => {
  if (!reversible.hasReversedSuits()) {
    return;
  }

  // Update the stack directions (which are only used in the "Up or Down" and "Reversed" variants)
  const oldStackDirections = globals.stackDirections.slice(); // Make a copy of the array
  globals.stackDirections = data.directions;
  for (let i = 0; i < globals.stackDirections.length; i++) {
    const stackDirection = globals.stackDirections[i];
    if (stackDirection === oldStackDirections[i]) {
      continue;
    }

    const suit = globals.variant.suits[i];
    let text;
    if (stackDirection === StackDirection.Undecided) {
      text = '';
    } else if (stackDirection === StackDirection.Up) {
      text = reversible.isUpOrDown() ? 'Up' : '';
    } else if (stackDirection === StackDirection.Down) {
      text = reversible.isUpOrDown() ? 'Down' : 'Reversed';
    } else if (stackDirection === StackDirection.Finished) {
      if (reversible.isUpOrDown()) {
        text = 'Finished';
      } else if (suit.reversed) {
        text = 'Reversed';
      } else {
        text = '';
      }
    } else {
      text = 'Unknown';
    }

    globals.elements.suitLabelTexts[i].fitText(text);
    if (!globals.animateFast) {
      globals.layers.UI.batchDraw();
    }

    for (const card of globals.deck) {
      if (card.suit === suit) {
        card.setDirectionArrow();
      }
    }
  }
});

actionFunctions.set('status', (data: ActionStatus) => {
  // Update internal state variables
  globals.clues = data.clues;
  if (globals.variant.name.startsWith('Clue Starved')) {
    // In "Clue Starved" variants, 1 clue is represented on the server by 2
    // Thus, in order to get the "real" clue count, we have to divide by 2
    globals.clues /= 2;
  }
  globals.score = data.score;
  globals.maxScore = data.maxScore;

  // Update the number of clues in the bottom-right hand corner of the screen
  globals.elements.cluesNumberLabel!.text(globals.clues.toString());

  if (!globals.lobby.settings.realLifeMode) {
    if (globals.clues === 0) {
      globals.elements.cluesNumberLabel!.fill('red');
    } else if (globals.clues === 1) {
      globals.elements.cluesNumberLabel!.fill('yellow');
    } else {
      globals.elements.cluesNumberLabel!.fill(LABEL_COLOR);
    }
    globals.elements.noClueBorder!.visible(globals.clues === 0);

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

  // Update the score (in the bottom-right-hand corner)
  const scoreLabel = globals.elements.scoreNumberLabel!;
  scoreLabel.text(globals.score.toString());

  // Reposition the maximum score
  const maxScoreLabel = globals.elements.maxScoreNumberLabel!;
  maxScoreLabel.text(` / ${globals.maxScore}`);
  maxScoreLabel.width(maxScoreLabel.measureSize(maxScoreLabel.text()).width);
  const x = scoreLabel.x() + scoreLabel.measureSize(scoreLabel.text()).width;
  maxScoreLabel.x(x);

  // Update the stats on the middle-left-hand side of the screen
  stats.updatePace();
  stats.updateEfficiency(0);

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
  if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay) {
    return;
  }

  // Local variables
  const i = data.num - 1;
  const strikeX = globals.elements.strikeXs[i];

  // Update the stats
  globals.cluesSpentPlusStrikes += 1;
  stats.updateEfficiency(0);

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
actionFunctions.set('text', (data: ActionText) => {
  globals.elements.actionLog!.setMultiText(data.text);
  globals.elements.fullActionLog!.addMessage(data.text);
  if (!globals.animateFast) {
    globals.layers.UI.batchDraw();
    globals.layers.UI2.batchDraw();
  }
});

actionFunctions.set('reveal', (data: ActionReveal) => {
  // This is the reveal for hypotheticals
  // The code here is mostly copied from the "websocket.ts" file
  let card = globals.deck[data.order];
  if (!card) {
    card = globals.stackBases[data.order - globals.deck.length];
  }
  if (!card) {
    throw new Error('Failed to get the card in the "reveal" command.');
  }

  if (data.suit === -1 && data.rank === -1) {
    card.blank = true;
    card.setBareImage();
  } else {
    card.reveal(data.suit, data.rank);
  }

  globals.layers.card.batchDraw();
});

actionFunctions.set('turn', (data: ActionTurn) => {
  // Store the current turn in memory
  globals.turn = data.num;
  globals.currentPlayerIndex = data.who;

  // Bold the name frame of the current player to indicate that it is their turn
  for (let i = 0; i < globals.playerNames.length; i++) {
    const nameFrame = globals.elements.nameFrames[i];
    if (nameFrame) {
      nameFrame.setActive(globals.currentPlayerIndex === i);
    }
  }

  // Update the turn count in the score area
  globals.elements.turnNumberLabel!.text(`${globals.turn + 1}`);

  // Update the current player in the middle of the screen
  updateCurrentPlayerArea();

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
