/*
    "notify" WebSocket commands communicate a change in the game state
*/

// Imports
import Konva from 'konva';
import {
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
} from './actions';
import * as arrows from './arrows';
import ClueEntry from './ClueEntry';
import {
    CARD_W,
    CLUE_TYPE,
    LABEL_COLOR,
    MAX_CLUE_NUM,
    STACK_DIRECTION,
} from '../../constants';
import { msgClueToClue, msgSuitToSuit } from './convert';
import fadeCheck from './fadeCheck';
import globals from './globals';
import possibilitiesCheck from './possibilitiesCheck';
import * as stats from './stats';
import strikeRecord from './strikeRecord';
import updateCurrentPlayerArea from './updateCurrentPlayerArea';
import LayoutChild from './LayoutChild';

// The server has sent us a new game action
// (either during an ongoing game or as part of a big list of notifies sent upon loading a new
// game/replay)
export default (data: any) => {
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

    const notifyFunction = notifyFunctions.get(data.type);
    if (typeof notifyFunction === 'undefined') {
        throw new Error(`A WebSocket notify function for the "${data.type}" command is not defined.`);
    }
    notifyFunction(data);
};

// Define a command handler map
const notifyFunctions = new Map();

notifyFunctions.set('clue', (data: ActionClue) => {
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

        card.hideBorders();
        card.cluedBorder!.show();
        if (
            !globals.lobby.settings.get('realLifeMode')
            && !globals.variant.name.startsWith('Cow & Pig')
            && !globals.variant.name.startsWith('Duck')
        ) {
            card.applyClue(clue, true);
            card.checkReapplyRankClues();
            card.checkReapplyColorClues();
            card.setBareImage();
            card.setFade(); // Unfade the card if it is faded
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
                !globals.lobby.settings.get('realLifeMode')
                && !globals.variant.name.startsWith('Cow & Pig')
                && !globals.variant.name.startsWith('Duck')
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
    if (data.clue.type === CLUE_TYPE.RANK) {
        clueName = clue.value.toString();
    } else if (data.clue.type === CLUE_TYPE.COLOR) {
        if (typeof clue.value === 'number') {
            throw new Error('The value of a color clue was a number.');
        }
        clueName = clue.value.name;
    }
    if (globals.variant.name.startsWith('Cow & Pig')) {
        // We want color clues to correspond to the first animal since color buttons are above
        // number buttons, even though rank comes first in the enum
        if (data.clue.type === CLUE_TYPE.RANK) {
            clueName = 'Oink';
        } else if (data.clue.type === CLUE_TYPE.COLOR) {
            clueName = 'Moo';
        }
    } else if (globals.variant.name.startsWith('Duck')) {
        clueName = 'Quack';
    }

    const entry = new ClueEntry({
        width: globals.elements.clueLog!.width(),
        height: 0.017 * globals.stage!.height(),
        giver: globals.playerNames[data.giver],
        target: globals.playerNames[data.target],
        clueName,
        list: data.list,
        negativeList,
        turn: data.turn,
    });
    globals.elements.clueLog!.addClue(entry);

    if (!globals.animateFast) {
        globals.layers.get('card')!.batchDraw();
    }
});

notifyFunctions.set('deckOrder', () => {
    // If we are exiting a hypothetical, we might re-receive a deckOrder command
    // If this is the case, we don't need to do anything,
    // as the order should already be stored in the global variables
});

notifyFunctions.set('discard', (data: ActionDiscard) => {
    // In "Throw It in a Hole" variants, convert misplays to real plays
    if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay && data.failed) {
        notifyFunctions.get('play')(data);
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
    card.setFade(); // Unfade the card if it is faded
    card.hideBorders();

    if (card.isMisplayed && !globals.animateFast && !globals.speedrun) {
        // If this card was misplayed,
        // it will automatically tween to the discard pile after reaching the play stacks
        card.doMisplayAnimation = true;
        card.animateToPlayStacks();
    } else {
        card.animateToDiscardPile();
    }

    // The fact that this card was discarded could make some other cards useless
    fadeCheck();

    if (card.isClued()) {
        stats.updateEfficiency(-1);
    }
});

// A player just drew a card from the deck
notifyFunctions.set('draw', (data: ActionDraw) => {
    // Local variables
    const { order } = data;
    // Suit and rank come from the server as -1 if the card is unknown
    // (e.g. being drawn to the current player's hand)
    // We want to convert this to just being null
    // Suit comes from the server as an integer, so we also need to convert it to a Suit object
    const suit = data.suit === -1 ? null : msgSuitToSuit(data.suit, globals.variant);
    const rank = data.rank === -1 ? null : data.rank;
    const holder = data.who;

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
    card.setFade(); // Fade the card if it is already played

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
    if (suit && rank && possibilitiesCheck()) {
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
});

notifyFunctions.set('play', (data: ActionPlay) => {
    // Local variables
    const card = globals.deck[data.which.order];

    card.isPlayed = true;
    card.turnPlayed = globals.turn;

    // Clear all visible arrows when a new move occurs
    arrows.hideAll();

    card.reveal(data.which.suit, data.which.rank);
    card.removeFromParent();
    card.hideBorders();
    card.animateToPlayStacks();

    // The fact that this card was played could make some other cards useless
    fadeCheck();

    if (!card.isClued()) {
        stats.updateEfficiency(1);
    }
});

notifyFunctions.set('reorder', (data: ActionReorder) => {
    const hand = globals.elements.playerHands[data.target];

    // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
    const newChildOrder = [];
    const handSize = hand.children.length;
    for (let i = 0; i < handSize; i++) {
        const order = data.handOrder[i];
        const child = globals.deck[order].parent! as unknown as LayoutChild;
        newChildOrder.push(child);

        // Take them out of the hand itself
        child.remove();
    }

    // Put them back into the hand in the new order
    for (let i = 0; i < handSize; i++) {
        const child = newChildOrder[i];
        hand.addChild(child);
    }
});

notifyFunctions.set('stackDirections', (data: ActionStackDirections) => {
    // Update the stack directions (only in "Up or Down" variants)
    globals.stackDirections = data.directions;
    if (globals.variant.name.startsWith('Up or Down')) {
        for (let i = 0; i < globals.stackDirections.length; i++) {
            const direction = globals.stackDirections[i];
            let text;
            if (direction === STACK_DIRECTION.UNDECIDED) {
                text = '';
            } else if (direction === STACK_DIRECTION.UP) {
                text = 'Up';
            } else if (direction === STACK_DIRECTION.DOWN) {
                text = 'Down';
            } else if (direction === STACK_DIRECTION.FINISHED) {
                text = 'Finished';
            } else {
                text = 'Unknown';
            }
            globals.elements.suitLabelTexts[i].fitText(text);
            if (!globals.animateFast) {
                globals.layers.get('UI')!.batchDraw();
            }
        }
    }
});

notifyFunctions.set('status', (data: ActionStatus) => {
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

    if (!globals.lobby.settings.get('realLifeMode')) {
        globals.elements.cluesNumberLabel!.fill(globals.clues === 0 ? 'red' : LABEL_COLOR);
        globals.elements.noClueBorder!.visible(globals.clues === 0);

        if (globals.clues === MAX_CLUE_NUM) {
            // Show the red border around the discard pile
            // (to reinforce that the current player cannot discard)
            globals.elements.noDiscardBorder!.show();
            globals.elements.noDoubleDiscardBorder!.hide();
        } else if (data.doubleDiscard && globals.lobby.settings.get('hyphenatedConventions')) {
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
    if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay) {
        scoreLabel.text('?');
    }

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
        globals.layers.get('UI')!.batchDraw();
    }
});

/*
    Data is as follows:
    {
        type: 'strike',
        num: 1,
        order: 4, // The order of the card that was misplayed
        turn: 2,
    }
*/
notifyFunctions.set('strike', (data: ActionStrike) => {
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
notifyFunctions.set('text', (data: ActionText) => {
    globals.elements.actionLog!.setMultiText(data.text);
    globals.elements.fullActionLog!.addMessage(data.text);
    if (!globals.animateFast) {
        globals.layers.get('UI')!.batchDraw();
        globals.layers.get('UI2')!.batchDraw();
    }
});

interface RevealMessage {
    suit: number,
    rank: number,
    order: number,
}

notifyFunctions.set('reveal', (data: RevealMessage) => {
    // This is the reveal for hypotheticals
    // The code here is copied from the "websocket.ts" file
    let card = globals.deck[data.order];
    if (!card) {
        card = globals.stackBases[data.order - globals.deck.length];
    }

    card.reveal(data.suit, data.rank);
    globals.layers.get('card')!.batchDraw();
});

notifyFunctions.set('turn', (data: ActionTurn) => {
    // Store the current turn in memory
    globals.turn = data.num;
    globals.currentPlayerIndex = data.who;

    // Bold the name frame of the current player to indicate that it is their turn
    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.nameFrames[i].setActive(globals.currentPlayerIndex === i);
    }

    // Update the turn count in the score area
    globals.elements.turnNumberLabel!.text(`${globals.turn + 1}`);

    // Update the current player in the middle of the screen
    updateCurrentPlayerArea();

    // If there are no cards left in the deck, update the "Turns left: #" label
    if (globals.deckSize === 0) {
        if (globals.endTurn === null) {
            globals.endTurn = globals.turn + globals.playerNames.length;
        }
        let numTurnsLeft = globals.endTurn - globals.turn;

        // The game is artificially extended by a turn in order to
        // show the times separately from the final action, so account for this
        if (globals.turn === globals.replayMax && globals.replay) {
            numTurnsLeft += 1;
        }

        globals.elements.deckTurnsRemainingLabel2!.text(`left: ${numTurnsLeft}`);
    }

    if (!globals.animateFast) {
        globals.layers.get('UI')!.batchDraw();
    }
});
