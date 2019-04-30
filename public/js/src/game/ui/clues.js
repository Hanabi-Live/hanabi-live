// Imports
const arrows = require('./arrows');
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const ui = require('./ui');

exports.checkLegal = () => {
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    const clueButton = globals.elements.clueTypeButtonGroup.getPressed();

    if (!target || !clueButton) {
        globals.elements.giveClueButton.setEnabled(false);
        return;
    }

    const who = target.targetIndex;
    const touchedAtLeastOneCard = showClueMatch(who, clueButton.clue);

    // By default, only enable the "Give Clue" button if the clue "touched"
    // one or more cards in the hand
    const enabled = touchedAtLeastOneCard
        // Make an exception if they have the optional setting for "Empty Clues" turned on
        || globals.emptyClues
        // Make an exception for the "Color Blind" variants (color clues touch no cards),
        // "Number Blind" variants (rank clues touch no cards),
        // and "Totally Blind" variants (all clues touch no cards)
        || (globals.variant.name.startsWith('Color Blind')
            && clueButton.clue.type === constants.CLUE_TYPE.COLOR)
        || (globals.variant.name.startsWith('Number Blind')
            && clueButton.clue.type === constants.CLUE_TYPE.RANK)
        || globals.variant.name.startsWith('Totally Blind')
        // Make an exception for certain characters
        || (globals.characterAssignments[globals.playerUs] === 'Blind Spot'
            && who === (globals.playerUs + 1) % globals.playerNames.length)
        || (globals.characterAssignments[globals.playerUs] === 'Oblivious'
            && who === (globals.playerUs - 1 + globals.playerNames.length)
            % globals.playerNames.length);

    globals.elements.giveClueButton.setEnabled(enabled);
};

const showClueMatch = (target, clue) => {
    arrows.hideAll();

    let touchedAtLeastOneCard = false;
    const hand = globals.elements.playerHands[target].children;
    for (let i = 0; i < hand.length; i++) {
        const child = globals.elements.playerHands[target].children[i];
        const card = child.children[0];
        if (variantIsCardTouched(clue, card)) {
            touchedAtLeastOneCard = true;
            arrows.set(i, card, null, clue);
        }
    }

    return touchedAtLeastOneCard;
};

// This mirrors the function in "variants.go"
const variantIsCardTouched = (clue, card) => {
    if (globals.variant.name.startsWith('Totally Blind')) {
        return false;
    }

    if (clue.type === constants.CLUE_TYPE.RANK) {
        if (card.suit.clueRanks === 'all') {
            return true;
        }
        if (card.suit.clueRanks === 'none') {
            return false;
        }
        if (
            globals.variant.name.startsWith('Number Blind')
            || globals.variant.name.startsWith('Number Mute')
        ) {
            return false;
        }
        if (globals.variant.name.startsWith('Multi-Fives') && card.rank === 5) {
            return true;
        }
        return clue.value === card.rank;
    }

    if (clue.type === constants.CLUE_TYPE.COLOR) {
        if (
            globals.variant.name.startsWith('Color Blind')
            || globals.variant.name.startsWith('Color Mute')
        ) {
            return false;
        }
        if (globals.variant.name.startsWith('Prism-Ones') && card.rank === 1) {
            return true;
        }
        return card.suit.clueColors.includes(clue.value);
    }

    return false;
};

exports.give = () => {
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    const clueButton = globals.elements.clueTypeButtonGroup.getPressed();
    if (
        !globals.ourTurn // We can only give clues on our turn
        || globals.clues === 0 // We can only give a clue if there is one available
        || !target // We might have not selected a clue recipient
        || !clueButton // We might have not selected a type of clue
        // We might be trying to give an invalid clue (e.g. an Empty Clue)
        || !globals.elements.giveClueButton.enabled
        // Prevent the user from accidentally giving a clue in certain situations
        || (Date.now() - globals.accidentalClueTimer < 1000)
    ) {
        return;
    }

    arrows.hideAll();

    // Send the message to the server
    ui.endTurn({
        type: 'action',
        data: {
            type: constants.ACT.CLUE,
            target: target.targetIndex,
            clue: convert.clueToMsgClue(clueButton.clue, globals.variant),
        },
    });
};
