/*
    "notify" WebSocket commands communicate a change in the game state
*/

// Imports
const ClueEntry = require('./ClueEntry');
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const graphics = require('./graphics');
const HanabiCard = require('./HanabiCard');
const LayoutChild = require('./LayoutChild');
const stats = require('./stats');

// Define a command handler map
const commands = {};

commands.clue = (data) => {
    globals.cluesSpentPlusStrikes += 1;
    stats.updateEfficiency(0);

    const clue = convert.msgClueToClue(data.clue, globals.variant);
    globals.lobby.ui.showClueMatch(-1);

    for (let i = 0; i < data.list.length; i++) {
        const card = globals.deck[data.list[i]];
        if (!card.isClued()) {
            stats.updateEfficiency(1);
        } else {
            stats.updateEfficiency(0);
        }
        card.numPositiveClues += 1;
        card.setIndicator(true, data.giver, data.target, clue);
        card.cluedBorder.show();
        card.applyClue(clue, true);
        card.setBareImage();
    }

    const neglist = [];

    for (let i = 0; i < globals.elements.playerHands[data.target].children.length; i++) {
        const child = globals.elements.playerHands[data.target].children[i];

        const card = child.children[0];
        const { order } = card;

        if (data.list.indexOf(order) < 0) {
            neglist.push(order);
            card.applyClue(clue, false);
            card.setBareImage();
        }
    }

    let clueName;
    if (data.clue.type === constants.CLUE_TYPE.RANK) {
        clueName = clue.value.toString();
    } else {
        clueName = clue.value.name;
    }

    const entry = new ClueEntry({
        width: globals.elements.clueLog.getWidth(),
        height: 0.017 * globals.stage.getHeight(),
        giver: globals.playerNames[data.giver],
        target: globals.playerNames[data.target],
        clueName,
        list: data.list,
        neglist,
        turn: data.turn,
    });

    globals.elements.clueLog.add(entry);

    globals.elements.clueLog.checkExpiry();
};

commands.deckOrder = (data) => {
    // At the end of a game, the server sends a list that reveals what the entire deck is
    globals.deckOrder = data.deck;
};

commands.discard = (data) => {
    // Local variables
    const card = globals.deck[data.which.order];

    card.isDiscarded = true;
    card.turnDiscarded = globals.turn;
    card.isMisplayed = data.failed;

    revealCard(data);

    /*
    if (!globals.animateFast && data.failed) {
        // If this card was misplayed,
        // it will automatically tween to the discard pile after reaching the play stacks
        card.animateToPlayStacks();
    } else {
        card.animateToDiscardPile();
    }
    */
    card.animateToDiscardPile();

    if (card.isClued()) {
        stats.updateEfficiency(-1);
        card.hideClues(); // This must be after the efficiency update
    }
};

// A player just drew a card from the deck
commands.draw = (data) => {
    globals.deckSize -= 1;
    globals.elements.drawDeck.setCount(globals.deckSize);

    if (data.suit === -1) {
        delete data.suit;
    }
    if (data.rank === -1) {
        delete data.rank;
    }
    const suit = convert.msgSuitToSuit(data.suit, globals.variant);
    if (!globals.learnedCards[data.order]) {
        globals.learnedCards[data.order] = {
            possibleSuits: globals.variant.suits.slice(),
            possibleRanks: globals.variant.ranks.slice(),
        };
    }
    globals.deck[data.order] = new HanabiCard({
        suit,
        rank: data.rank,
        order: data.order,
        suits: globals.variant.suits.slice(),
        ranks: globals.variant.ranks.slice(),
        holder: data.who,
    });

    const child = new LayoutChild();
    child.add(globals.deck[data.order]);

    const pos = globals.elements.drawDeck.cardback.getAbsolutePosition();

    child.setAbsolutePosition(pos);
    child.setRotation(-globals.elements.playerHands[data.who].getRotation());

    const scale = globals.elements.drawDeck.cardback.getWidth() / constants.CARDW;
    child.setScale({
        x: scale,
        y: scale,
    });

    globals.elements.playerHands[data.who].add(child);
    globals.elements.playerHands[data.who].moveToTop();
};

// A new line of text has appeared in the action log
commands.text = (data) => {
    globals.elements.msgLogGroup.addMessage(data.text);

    globals.elements.messagePrompt.setMultiText(data.text);
    if (!globals.animateFast) {
        globals.layers.UI.batchDraw();
        globals.layers.overtop.batchDraw();
    }
};

commands.play = (data) => {
    // Local variables
    const card = globals.deck[data.which.order];

    card.isPlayed = true;
    card.turnPlayed = globals.turn;

    revealCard(data);

    card.animateToPlayStacks();

    if (card.isClued()) {
        card.hideClues();
    } else {
        stats.updateEfficiency(1);
    }
};

commands.reorder = (data) => {
    const hand = globals.elements.playerHands[data.target];

    // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
    const newChildOrder = [];
    const handSize = hand.children.length;
    for (let i = 0; i < handSize; i++) {
        const order = data.handOrder[i];
        const child = globals.deck[order].parent;
        newChildOrder.push(child);

        // Take them out of the hand itself
        child.remove();
    }

    // Put them back into the hand in the new order
    for (let i = 0; i < handSize; i++) {
        const child = newChildOrder[i];
        hand.add(child);
    }
};

commands.stackDirections = (data) => {
    // Update the stack directions (only in "Up or Down" variants)
    if (globals.variant.name.startsWith('Up or Down')) {
        for (let i = 0; i < data.directions.length; i++) {
            const direction = data.directions[i];
            let text;
            if (direction === 0) {
                text = ''; // Undecided
            } else if (direction === 1) {
                text = 'Up';
            } else if (direction === 2) {
                text = 'Down';
            } else if (direction === 3) {
                text = 'Finished';
            } else {
                text = 'Unknown';
            }
            globals.elements.suitLabelTexts[i].setText(text);
            if (!globals.animateFast) {
                globals.layers.UI.batchDraw();
            }
        }
    }
};

commands.status = (data) => {
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
    globals.elements.cluesNumberLabel.setText(globals.clues.toString());
    globals.elements.cluesNumberLabel.setFill(globals.clues === 0 ? 'red' : globals.labelColor);

    if (globals.clues === 8) {
        // Show the red border around the discard pile
        // (to reinforce the fact that being at 8 clues is a special situation)
        globals.elements.noDiscardLabel.show();
        globals.elements.noDoubleDiscardLabel.hide();
    } else if (data.doubleDiscard) {
        // Show a yellow border around the discard pile
        // (to reinforce that this is a "Double Discard" situation)
        globals.elements.noDiscardLabel.hide();
        globals.elements.noDoubleDiscardLabel.show();
    } else {
        globals.elements.noDiscardLabel.hide();
        globals.elements.noDoubleDiscardLabel.hide();
    }

    // Update the score (in the bottom-right-hand corner)
    const scoreLabel = globals.elements.scoreNumberLabel;
    scoreLabel.setText(globals.score.toString());

    // Reposition the maximum score
    const maxScoreLabel = globals.elements.maxScoreNumberLabel;
    maxScoreLabel.setText(` / ${globals.maxScore}`);
    maxScoreLabel.setWidth(maxScoreLabel._getTextSize(maxScoreLabel.getText()).width);
    const x = scoreLabel.getX() + scoreLabel._getTextSize(scoreLabel.getText()).width;
    maxScoreLabel.setX(x);

    // Update the stats on the middle-left-hand side of the screen
    stats.updatePace();
    stats.updateEfficiency(0);

    if (!globals.animateFast) {
        globals.layers.UI.batchDraw();
    }
};

commands.strike = (data) => {
    // Local variables
    const i = data.num - 1;
    const strike = globals.elements.strikes[i];

    // Update the stats
    globals.cluesSpentPlusStrikes += 1;
    stats.updateEfficiency(0);

    // Record the turn that the strike happened and the card that was misplayed
    globals.lobby.ui.recordStrike(data);

    // Animate the strike square fading in
    if (globals.animateFast) {
        strike.setOpacity(1.0);
    } else {
        strike.tween = new graphics.Tween({
            node: strike,
            opacity: 1.0,
            duration: 1.0,
            runonce: true,
        }).play();
    }
};

commands.turn = (data) => {
    // Store the current turn in memory
    globals.turn = data.num;
    globals.currentPlayerIndex = data.who;

    // Keep track of whether or not it is our turn (speedrun)
    globals.ourTurn = (globals.currentPlayerIndex === globals.playerUs);
    if (!globals.ourTurn) {
        // Adding this here to avoid bugs with pre-moves
        globals.elements.clueArea.hide();
    }

    // Bold the name frame of the current player to indicate that it is their turn
    for (let i = 0; i < globals.playerNames.length; i++) {
        globals.elements.nameFrames[i].setActive(globals.currentPlayerIndex === i);
    }

    // Update the turn count in the score area
    globals.elements.turnNumberLabel.setText(`${globals.turn + 1}`);

    // Update the current player in the middle of the screen
    globals.elements.currentPlayerArea.update(globals.currentPlayerIndex);

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

        globals.elements.deckTurnsRemainingLabel2.setText(`left: ${numTurnsLeft}`);
    }

    if (!globals.animateFast) {
        globals.layers.UI.batchDraw();
    }
};

module.exports = commands;

/*
    Misc. subroutines
*/

const revealCard = (data) => {
    // Local variables
    const suit = convert.msgSuitToSuit(data.which.suit, globals.variant);
    const card = globals.deck[data.which.order];
    const child = card.parent; // This is the LayoutChild

    // Hide all of the existing arrows on the cards
    globals.lobby.ui.showClueMatch(-1);

    // Unflip the arrow, if it is flipped
    card.initArrowLocation();

    const learnedCard = globals.learnedCards[data.which.order];
    learnedCard.suit = suit;
    learnedCard.rank = data.which.rank;
    learnedCard.possibleSuits = [suit];
    learnedCard.possibleRanks = [data.which.rank];
    learnedCard.revealed = true;

    card.showOnlyLearned = false;
    card.trueSuit = suit;
    card.trueRank = data.which.rank;

    const pos = child.getAbsolutePosition();
    child.setRotation(child.parent.getRotation());
    card.suitPips.hide();
    card.rankPips.hide();
    child.remove();
    child.setAbsolutePosition(pos);
    card.setBareImage();

    globals.elements.clueLog.checkExpiry();
};
