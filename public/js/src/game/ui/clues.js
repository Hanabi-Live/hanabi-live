// Imports
import * as arrows from './arrows';
import { ACTION, CLUE_TYPE } from '../../constants';
import { clueToMsgClue } from './convert';
import globals from './globals';
import * as ui from './ui';

export const checkLegal = () => {
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
        // Make an exception for variants where color clues are always allowed
        || (globals.variant.colorCluesTouchNothing && clueButton.clue.type === CLUE_TYPE.COLOR)
        // Make an exception for variants where number clues are always allowed
        || (globals.variant.rankCluesTouchNothing && clueButton.clue.type === CLUE_TYPE.RANK)
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
    if (clue.type === CLUE_TYPE.RANK) {
        if (card.suit.clueRanks === 'all') {
            return true;
        }
        if (card.suit.clueRanks === 'none') {
            return false;
        }
        if (globals.variant.rankCluesTouchNothing) {
            return false;
        }
        if (globals.variant.name.includes('Multi-Fives') && card.rank === 5) {
            return true;
        }
        return clue.value === card.rank;
    }

    if (clue.type === CLUE_TYPE.COLOR) {
        if (globals.variant.colorCluesTouchNothing) {
            return false;
        }
        if (globals.variant.name.includes('Prism-Ones') && card.rank === 1) {
            return true;
        }
        return card.suit.clueColors.includes(clue.value);
    }

    return false;
};

export const give = () => {
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    const clueButton = globals.elements.clueTypeButtonGroup.getPressed();
    if (
        !globals.ourTurn // We can only give clues on our turn
        || globals.clues === 0 // We can only give a clue if there is one available
        || !target // We might have not selected a clue recipient
        || !clueButton // We might have not selected a type of clue
        // We might be trying to give an invalid clue (e.g. an Empty Clue)
        || !globals.elements.giveClueButton.enabled
        // Prevent the user from accidentally giving a clue
        || (Date.now() - globals.UIClickTime < 1000)
    ) {
        return;
    }

    // Send the message to the server
    ui.endTurn({
        type: 'action',
        data: {
            type: ACTION.CLUE,
            target: target.targetIndex,
            clue: clueToMsgClue(clueButton.clue, globals.variant),
        },
    });
};
