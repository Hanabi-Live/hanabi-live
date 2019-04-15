/*
    Functions for the stats on the middle-right-hand side
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');

exports.updatePace = () => {
    const adjustedScorePlusDeck = globals.score + globals.deckSize - globals.maxScore;

    // Formula derived by Libster;
    // the number of discards that can happen while still getting the maximum score
    // (this is represented to the user as "Pace" on the user interface)
    const endGameThreshold1 = adjustedScorePlusDeck + globals.playerNames.length;

    // Formula derived by Florrat;
    // a strategical estimate of "End-Game" that tries to account for the number of players
    const endGameThreshold2 = adjustedScorePlusDeck + Math.floor(globals.playerNames.length / 2);

    // Formula derived by Hyphen-ated;
    // a more conservative estimate of "End-Game" that does not account for
    // the number of players
    const endGameThreshold3 = adjustedScorePlusDeck;

    // Update the pace
    // (part of the efficiency statistics on the right-hand side of the screen)
    // If there are no cards left in the deck, pace is meaningless
    const label = globals.elements.paceNumberLabel;
    if (globals.deckSize === 0) {
        label.setText('-');
        label.setFill(constants.LABEL_COLOR);
    } else {
        let paceText = endGameThreshold1.toString();
        if (endGameThreshold1 > 0) {
            paceText = `+${endGameThreshold1}`;
        }
        label.setText(paceText);

        // Color the pace label depending on how "risky" it would be to discard
        // (approximately)
        if (endGameThreshold1 <= 0) {
            // No more discards can occur in order to get a maximum score
            label.setFill('#df1c2d'); // Red
        } else if (endGameThreshold2 < 0) {
            // It would probably be risky to discard
            label.setFill('#ef8c1d'); // Orange
        } else if (endGameThreshold3 < 0) {
            // It might be risky to discard
            label.setFill('#efef1d'); // Yellow
        } else {
            // We are not even close to the "End-Game", so give it the default color
            label.setFill(constants.LABEL_COLOR);
        }
    }
};

exports.updateEfficiency = (cardsGottenDelta) => {
    globals.cardsGotten += cardsGottenDelta;
    const efficiency = (globals.cardsGotten / globals.cluesSpentPlusStrikes).toFixed(2);
    // Round it to 2 decimal places

    // Update the labels on the right-hand side of the screen
    const effNumLabel = globals.elements.efficiencyNumberLabel;
    if (globals.cluesSpentPlusStrikes === 0) {
        // First, handle the case in which 0 clues have been given
        effNumLabel.setText('- / ');
    } else {
        effNumLabel.setText(`${efficiency} / `);
        effNumLabel.setWidth(effNumLabel._getTextSize(effNumLabel.getText()).width);
    }
    const x = effNumLabel.getX() + effNumLabel._getTextSize(effNumLabel.getText()).width;
    globals.elements.efficiencyNumberLabelMinNeeded.setX(x);
};


exports.getMinEfficiency = () => {
    /*
        Calculate the minimum amount of efficiency needed in order to win this variant
        First, calculate the starting pace with the following formula:
            total cards in the deck -
            ((number of cards in a player's hand - 1) * number of players) -
            (5 * number of suits)
        https://github.com/Zamiell/hanabi-conventions/blob/master/other-conventions/Efficiency.md
    */

    const totalCardsInTheDeck = getTotalCardsInTheDeck();
    const numPlayers = globals.playerNames.length;
    const cardsInHand = getNumCardsPerHand();
    let startingPace = totalCardsInTheDeck;
    startingPace -= (cardsInHand - 1) * numPlayers;
    startingPace -= 5 * globals.variant.suits.length;

    /*
        Second, use the pace to calculate the minimum efficiency required to win the game
        with the following formula:
            (5 * number of suits) /
            (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
        https://github.com/Zamiell/hanabi-conventions/blob/master/other-conventions/Efficiency.md
    */
    const minEfficiencyNumerator = 5 * globals.variant.suits.length;
    let unusableClues = 1;
    if (numPlayers >= 5) {
        unusableClues = 2;
    }
    let discardsPerClue = 1;
    if (globals.variant.name.startsWith('Clue Starved')) {
        discardsPerClue = 2;
    }
    const minEfficiencyDenominator = 8 + Math.floor(
        (startingPace + globals.variant.suits.length - unusableClues) / discardsPerClue,
    );
    const minEfficiency = (minEfficiencyNumerator / minEfficiencyDenominator).toFixed(2);
    // Round it to 2 decimal places

    return minEfficiency;
};

const getNumCardsPerHand = () => {
    const numPlayers = globals.playerNames.length;
    if (numPlayers === 2 || numPlayers === 3) {
        return 5;
    }
    if (numPlayers === 4 || numPlayers === 5) {
        return 4;
    }
    if (numPlayers === 6) {
        return 3;
    }

    // Default to 3 cards for non-standard player numbers
    return 3;
};
exports.getNumCardsPerHand = getNumCardsPerHand;

const getTotalCardsInTheDeck = () => {
    let totalCardsInTheDeck = 0;
    for (const suit of globals.variant.suits) {
        totalCardsInTheDeck += 10;
        if (suit.oneOfEach) {
            totalCardsInTheDeck -= 5;
        } else if (globals.variant.name.startsWith('Up or Down')) {
            totalCardsInTheDeck -= 1;
        }
    }

    return totalCardsInTheDeck;
};
exports.getTotalCardsInTheDeck = getTotalCardsInTheDeck;
