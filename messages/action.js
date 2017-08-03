// Sent when the user performs an in-game action
// "data" example:
/*
    {
        clue: { // Not present if the type is 1 or 2
            type: 0, // 0 is a number clue, 1 is a color clue
            value: 1, // If a number clue, corresponds to the number
            // If a color clue:
            // 0 is blue
            // 1 is green
            // 2 is yellow
            // 3 is red
            // 4 is purple
            // (these mappings change in the mixed variants)
        },
        target: 1,
        // Either the player index of the recipient of the clue, or the card ID
        // (e.g. the first card of the deck drawn is card #1, etc.)
        type: 0,
        // 0 is a clue
        // 1 is a play
        // 2 is a discard
        // 3 is a deck blind play (added in the emulator)
        // 4 is end game (only used by the server when enforcing a time limit)
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');
const messages = require('../messages');

const step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`Game #${data.gameID} does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerError(socket, data);
        return;
    }

    // Get the index of this player
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            data.index = i;
            break;
        }
    }
    const player = game.players[data.index];

    // Validate that it is this player's turn
    if (game.turnPlayerIndex !== data.index) {
        logger.warn(`User "${data.username}" tried to perform an action when it was not their turn.`);
        data.reason = 'You cannot perform an action when it is not your turn.';
        notify.playerError(socket, data);
        return;
    }

    // Remove the "fail" and "blind" states
    game.sound = null;

    // Handle card-reordering
    if (game.turnNum >= game.discardSignalTurnExpiration) {
        game.discardSignalOutstanding = false;
    }
    if (
        game.reorderCards &&
        game.discardSignalOutstanding &&
        data.type !== 1 && // (it doesn't happen on a play or a deck-play)
        data.type !== 3
    ) {
        // Find the chop card
        const chopIndex = getChopIndex(data);

        // We don't need to reorder anything if the chop is slot 1
        // (the left-most card)
        if (chopIndex !== player.hand.length - 1) {
            const chopCard = player.hand[chopIndex];

            // Remove the chop card from their hand
            player.hand.splice(chopIndex, 1);

            // Add it to the end (the left-most position)
            player.hand.push(chopCard);

            // Make an array that represents the order of the player's hand
            const handOrder = [];
            for (let i = 0; i < player.hand.length; i++) {
                const card = player.hand[i];
                handOrder.push(card.order);
            }

            // Notify everyone about the reordering
            game.actions.push({
                type: 'reorder',
                target: data.index,
                handOrder,
            });
            notify.gameAction(data);
        }
    }

    // Do different tasks depending on the action
    if (data.type === 0) { // Clue
        // Validate that the player is not giving a clue to themselves
        if (game.turnPlayerIndex === data.target) {
            logger.warn(`User "${data.username}" tried to give a clue to themself.`);
            data.reason = 'You cannot give a clue to yourself.';
            notify.playerError(socket, data);
            return;
        }

        // Validate that there are clues available to use
        if (game.clueNum === 0) {
            logger.warn(`User "${data.username}" tried to give a clue while at 0 clues.`);
            data.reason = 'You cannot give a clue when you have 0 clues available.';
            notify.playerError(socket, data);
            return;
        }

        playerClue(data);
    } else if (data.type === 1) { // Play
        // Play
        playerRemoveCard(data);
        playerPlayCard(data);
        playerDrawCard(data);
    } else if (data.type === 2) { // Discard
        // We are not allowed to discard while at 8 clues
        // (the client should enforce this, but do a check just in case)
        if (game.clueNum === 8) {
            logger.warn(`User "${data.username}" tried to discard while at 8 clues.`);
            data.reason = 'You cannot discard while at 8 clues.';
            notify.playerError(socket, data);
            return;
        }

        // Discard
        game.clueNum += 1;
        playerRemoveCard(data);
        playerDiscardCard(data);
        playerDrawCard(data);
    } else if (data.type === 3) {
        // We are not allowed to blind play the deck unless there is only 1 card left
        // (the client should enforce this, but do a check just in case)
        if (game.deckIndex !== game.deck.length - 1) {
            return;
        }

        playerBlindPlayDeck(data);
    } else if (data.type === 4) {
        // This is a special action type sent by the server to itself when a
        // player runs out of time
        game.strikes = 3;

        const text = `${game.players[game.turnPlayerIndex].username} ran out of time!`;
        game.actions.push({
            text,
        });
        notify.gameAction(data);
        logger.info(`[Game ${data.gameID}] ${text}`);
    } else {
        logger.error(`Unknown action type: ${data.type}`);
        return;
    }

    // Send messages about the current status
    game.actions.push({
        clues: game.clueNum,
        score: game.score,
        type: 'status',
    });
    notify.gameAction(data);

    // Adjust the timer for the player that just took their turn
    // (if the game is over now due to a player running out of time, we don't
    // need to adjust the timer because we already set it to 0 in the
    // "checkTimer" function)
    if (data.type !== 4) {
        const now = (new Date()).getTime();
        player.time -= now - game.turnBeginTime;
        // (in non-timed games, "player.time" will decrement into negative
        // numbers to show how much time they are taking)

        // In timed games, a player gets an additional X seconds for making a
        // move
        if (game.timed) {
            player.time += globals.extraTurnTime;
        }

        game.turnBeginTime = now;
    }

    // Increment the turn
    game.turnNum += 1;
    game.turnPlayerIndex += 1;
    if (game.turnPlayerIndex === game.players.length) {
        game.turnPlayerIndex = 0;
    }

    // Check for end game states
    data.end = false;
    data.loss = false;
    checkEnd(data);
    if (data.end) {
        let text;
        if (data.loss) {
            text = 'Players lose!';
        } else {
            text = `Players score ${game.score} points`;
        }
        game.actions.push({
            text,
        });
        notify.gameAction(data);
        logger.info(`[Game ${data.gameID}] ${text}`);
    }

    // Send messages about the current turn
    // (we advance a turn even if the game is over so that we have an extra
    // separator before the finishing times are displayed)
    game.actions.push({
        num: game.turnNum,
        type: 'turn',
        who: game.turnPlayerIndex,
    });
    notify.gameAction(data);
    if (!data.end) {
        logger.info(`[Game ${data.gameID}] It is now ${game.players[game.turnPlayerIndex].username}'s turn.`);
    }

    // Tell every client to play a sound as a notification for the action taken
    notify.gameSound(data);

    if (data.end) {
        messages.endGame.step1(data);
        return;
    }

    // Send the "action" message to the next player
    const nextPlayerSocket = game.players[game.turnPlayerIndex].socket;
    notify.playerAction(nextPlayerSocket, data);

    notify.allTableChange(data);
    // (this seems wasteful but this is apparently used so that you can see if
    // it is your turn from the lobby)

    // Send everyone new clock values
    notify.gameTime(data);

    if (game.timed) {
        // Start the function that will check to see if the current player has
        // run out of time (it just got to be their turn)
        data.userID = game.players[game.turnPlayerIndex].userID;
        data.turnNum = game.turnNum;
        setTimeout(() => {
            checkTimer(data);
        }, game.players[game.turnPlayerIndex].time);
    }
};
exports.step1 = step1;

function playerClue(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Decrement the clues
    game.clueNum -= 1;

    // Keep track that someone discarded
    // (used for the "Reorder Cards" feature)
    game.discardSignalOutstanding = false;

    // Find out what cards this clue touches
    const list = [];
    for (const card of game.players[data.target].hand) {
        let touched = false;
        if (data.clue.type === 0) { // Number clue
            if (card.rank === data.clue.value) {
                touched = true;
            }
        } else if (data.clue.type === 1) { // Color clue
            if (game.variant >= 0 && game.variant <= 2) {
                // Normal, black, and black one of each
                if (data.clue.value === card.suit) {
                    touched = true;
                }
            } else if (game.variant === 3 || game.variant === 6) {
                // Multi (Rainbow) and White + Multi
                if (data.clue.value === card.suit || card.suit === 5) {
                    touched = true;
                }
            } else if (game.variant === 4) { // Mixed suits
                // Suits:
                // 0 - Green    (Blue   / Yellow)
                // 1 - Magenta  (Blue   / Red)
                // 2 - Navy     (Blue   / Black)
                // 3 - Orange   (Yellow / Red)
                // 4 - Tan      (Yellow / Black)
                // 5 - Burgundy (Red    / Black)
                if (data.clue.value === 0) { // Blue clue
                    if (card.suit === 0 || card.suit === 1 || card.suit === 2) {
                        touched = true;
                    }
                } else if (data.clue.value === 1) { // Green clue
                    if (card.suit === 0 || card.suit === 3 || card.suit === 4) {
                        touched = true;
                    }
                } else if (data.clue.value === 2) { // Red clue
                    if (card.suit === 1 || card.suit === 3 || card.suit === 5) {
                        touched = true;
                    }
                } else if (data.clue.value === 3) { // Purple clue
                    if (card.suit === 2 || card.suit === 4 || card.suit === 5) {
                        touched = true;
                    }
                }
            } else if (game.variant === 5) { // Mixed and multi suits
                // Suits:
                // 0 - Teal     (Blue / Green)
                // 1 - Lime     (Green / Yellow)
                // 2 - Orange   (Yellow / Red)
                // 3 - Cardinal (Red / Purple)
                // 4 - Indigo   (Purple / Blue)
                // 5 - Rainbow
                if (data.clue.value === 0) { // Blue clue
                    if (card.suit === 0 || card.suit === 4 || card.suit === 5) {
                        touched = true;
                    }
                } else if (data.clue.value === 1) { // Green clue
                    if (card.suit === 0 || card.suit === 1 || card.suit === 5) {
                        touched = true;
                    }
                } else if (data.clue.value === 2) { // Yellow clue
                    if (card.suit === 1 || card.suit === 2 || card.suit === 5) {
                        touched = true;
                    }
                } else if (data.clue.value === 3) { // Red clue
                    if (card.suit === 2 || card.suit === 3 || card.suit === 5) {
                        touched = true;
                    }
                } else if (data.clue.value === 4) { // Black clue
                    if (card.suit === 3 || card.suit === 4 || card.suit === 5) {
                        touched = true;
                    }
                }
            } else if (game.variant === 7) { // Crazy
                // Suits:
                // 0 - Green   (Blue   / Yellow)
                // 1 - Magenta (Blue   / Red)
                // 2 - Orange  (Yellow / Red)
                // 3 - White
                // 4 - Rainbow
                // 5 - Black
                if (data.clue.value === 0) { // Blue clue
                    if (card.suit === 0 || card.suit === 1 || card.suit === 4) {
                        touched = true;
                    }
                } else if (data.clue.value === 1) { // Yellow clue
                    if (card.suit === 0 || card.suit === 2 || card.suit === 4) {
                        touched = true;
                    }
                } else if (data.clue.value === 2) { // Red clue
                    if (card.suit === 1 || card.suit === 2 || card.suit === 4) {
                        touched = true;
                    }
                } else if (data.clue.value === 3) { // Black clue
                    if (card.suit === 4 || card.suit === 5) {
                        touched = true;
                    }
                }
            }
        }

        if (touched) {
            list.push(card.order);
            card.touched = true;
        }
    }
    if (list.length === 0) {
        logger.warn('This clue touches no cards! Something went wrong...');
        return;
    }

    // Send the "notify" message about the clue
    game.actions.push({
        clue: data.clue,
        giver: data.index,
        list,
        target: data.target,
        type: 'clue',
    });
    notify.gameAction(data);

    // Send the "message" message about the clue
    let text = `${game.players[data.index].username} tells `;
    text += `${game.players[data.target].username} about `;
    const words = ['', 'one', 'two', 'three', 'four', 'five'];
    text += `${words[list.length]} `;
    if (data.clue.type === 0) { // Number clue
        text += data.clue.value;
    } else if (data.clue.type === 1) { // Color clue
        text += getClueText(data);
    }
    if (list.length > 1) {
        text += 's';
    }
    game.actions.push({
        text,
    });
    notify.gameAction(data);
    logger.info(`[Game ${data.gameID}] ${text}`);
}

function playerRemoveCard(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const player = game.players[game.turnPlayerIndex];

    // Remove the card from their hand
    for (let i = 0; i < player.hand.length; i++) {
        if (player.hand[i].order === data.target) {
            player.hand.splice(i, 1);
            data.slot = (player.hand.length - i) + 1;
            // Slot 1 is the leftmost slot, but the leftmost slot is index 5
            break;
        }
    }
}

function playerPlayCard(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const card = game.deck[data.target];
    const suitText = getSuitText(data);

    // Find out if this successfully plays
    if (card.rank === game.stacks[card.suit] + 1) {
        // Success
        game.score += 1;
        game.stacks[card.suit] += 1;

        // Send the "notify" message about the play
        game.actions.push({
            type: 'played',
            which: {
                index: data.index,
                rank: card.rank,
                suit: card.suit,
                order: card.order,
            },
        });
        notify.gameAction(data);

        // Send the "message" about the play
        let text = `${game.players[data.index].username} plays `;
        text += `${suitText} ${card.rank} from `;
        if (data.slot === -1) {
            text += 'the deck';
        } else {
            text += `slot #${data.slot}`;
        }
        if (!card.touched) {
            text += ' (blind)';
            game.sound = 'blind';
        }
        game.actions.push({
            text,
        });
        notify.gameAction(data);
        logger.info(`[Game ${data.gameID}] ${text}`);

        // Give the team a clue if a 5 was played
        if (card.rank === 5) {
            game.clueNum += 1;
            if (game.clueNum > 8) {
                // The extra clue is wasted if they are at 8 clues already
                game.clueNum = 8;
            }
        }
    } else {
        // Send the "notify" message about the strike
        game.strikes += 1;
        game.actions.push({
            type: 'strike',
            num: game.strikes,
        });
        notify.gameAction(data);

        playerDiscardCard(data, true);
    }
}

function playerDiscardCard(data, failed = false) {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const card = game.deck[data.target];
    const suitText = getSuitText(data);

    // Keep track that someone discarded
    // (used for the "Reorder Cards" feature)
    game.discardSignalOutstanding = true;
    game.discardSignalTurnExpiration = game.turnNum + (game.players.length - 1);

    // Mark that the card is discarded
    card.discarded = true;

    game.actions.push({
        type: 'discard',
        which: {
            index: data.index,
            rank: card.rank,
            suit: card.suit,
            order: data.target,
        },
    });
    notify.gameAction(data);

    let text = `${game.players[data.index].username} `;
    if (failed) {
        text += 'fails to play';
        game.sound = 'fail';
    } else {
        text += 'discards';
    }
    text += ` ${suitText} ${card.rank} from `;
    if (data.slot === -1) {
        text += 'the deck';
    } else {
        text += `slot #${data.slot}`;
    }
    if (!failed && card.touched) {
        text += ' (clued)';
    }
    if (failed && data.slot !== -1 && !card.touched) {
        text += ' (blind)';
    }
    game.actions.push({
        text,
    });
    notify.gameAction(data);
    logger.info(`[Game ${data.gameID}] ${text}`);
}

// We have to use "data.index" instead of "globals.currentGames[data.gameID].turnPlayerIndex"
// because this is used before the game starts
const playerDrawCard = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Check to see if the deck is empty
    if (game.deckIndex >= game.deck.length) {
        // Don't draw any more cards if the deck is empty
        return;
    }

    // Mark the order (position in the deck) on the card
    // (this was not done upon deck creation because the order would change
    // after it was shuffled)
    const card = game.deck[game.deckIndex];
    card.order = game.deckIndex;

    game.players[data.index].hand.push(card);
    game.actions.push({
        type: 'draw',
        who: data.index,
        rank: card.rank,
        suit: card.suit,
        order: game.deckIndex,
    });
    game.deckIndex += 1;

    if (game.running) {
        notify.gameAction(data);
    }

    game.actions.push({
        type: 'drawSize',
        size: game.deck.length - game.deckIndex,
    });

    if (game.running) {
        notify.gameAction(data);
    }

    // Check to see if that was the last card drawn
    if (game.deckIndex >= game.deck.length) {
        // Mark the turn upon which the game will end
        game.endTurnNum = game.turnNum + game.players.length + 1;
    }
};
exports.playerDrawCard = playerDrawCard;

function playerBlindPlayDeck(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Make the player draw that card
    playerDrawCard(data);

    // Play the card freshly drawn
    data.target = game.deck.length - 1; // The final card
    data.slot = -1;
    playerPlayCard(data);
}

const checkTimer = (data) => {
    // Check to see if the game ended already
    if (!(data.gameID in globals.currentGames)) {
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    // Check to see if we have made a move in the meanwhiled
    if (data.turnNum !== game.turnNum) {
        return;
    }

    // Get the index of this player
    data.index = -1;
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === data.userID) {
            data.index = i;
            break;
        }
    }
    if (data.index === -1) {
        logger.error(`Tried to end timed game #${data.gameID}, but the player index could not be found.`);
        return;
    }
    const player = game.players[data.index];
    player.time = 0;
    logger.info(`Time ran out for "${player.username}" playing game #${data.gameID}.`);

    // End the game
    data.type = 4;
    const fakeSocket = {
        userID: data.userID,
        currentGame: data.gameID,
    };
    step1(fakeSocket, data);
};
exports.checkTimer = checkTimer;

function checkEnd(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Check for 3 strikes
    if (game.strikes === 3) {
        data.end = true;
        data.loss = true;
        return;
    }

    // Check for the final go-around
    // (initiated after the last card is played from the deck)
    if (game.turnNum === game.endTurnNum) {
        data.end = true;
        return;
    }

    // Check to see if the maximum score has been reached
    if (
        (game.variant === 0 && game.score === 25) ||
        (game.variant === 1 && game.score === 30) ||
        (game.variant === 2 && game.score === 30) ||
        (game.variant === 3 && game.score === 30)
    ) {
        data.end = true;
        return;
    }

    // Check to see if there are any cards remaining that can be played on the
    // stacks
    for (let i = 0; i < game.stacks.length; i++) {
        // Search through the deck
        for (let j = 0; j < game.deck.length; j++) {
            const card = game.deck[j];
            const neededSuit = i;
            const neededRank = game.stacks[i] + 1;
            if (
                card.suit === neededSuit &&
                card.rank === neededRank &&
                !card.discarded
            ) {
                return;
            }
        }
    }

    // If we got this far, nothing can be played
    data.end = true;
}

const getSuitText = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const card = game.deck[data.target];

    let suitText = globals.suits[card.suit];
    if (game.variant === 3 && card.suit === 5) {
        // Change "Black" to "Rainbow"
        suitText = globals.suits[6];
    } else if (game.variant === 4) {
        // Set the "Mixed Suits" text
        suitText = globals.mixedSuits[card.suit];
    } else if (game.variant === 5) {
        // Set the "Mixed and Multi Suits" text
        suitText = globals.mmSuits[card.suit];
    } else if (game.variant === 6 && card.suit === 4) {
        // Change "Purple" to "White"
        suitText = globals.suits[7];
    } else if (game.variant === 6 && card.suit === 5) {
        // Change "Black" to "Rainbow"
        suitText = globals.suits[6];
    } else if (game.variant === 7) {
        // Set the "Crazy" suits text
        suitText = globals.crazySuits[6];
    }

    return suitText;
};
exports.getSuitText = getSuitText;

function getClueText(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    let clueText = globals.suits[data.clue.value];
    if (game.variant === 4 || game.variant === 7) {
        // Set the "Mixed Suits" text
        clueText = globals.mixedClues[data.clue.value];
    }

    return clueText;
}

function getChopIndex(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];
    const player = game.players[data.index];

    // Go through their hand
    let chopIndex = -1;
    for (let i = player.hand.length - 1; i >= 0; i--) {
        const card = player.hand[i];
        if (!card.touched) {
            chopIndex = i;
        }
    }
    if (chopIndex === -1) {
        // Their hand is filled with clued cards, so their chop is considered to be their first card
        chopIndex = player.hand.length - 1;
    }

    return chopIndex;
}
