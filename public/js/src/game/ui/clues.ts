// Imports
import * as arrows from './arrows';
import { ACTION, CLUE_TYPE } from '../../constants';
import Clue from './Clue';
import { clueToMsgClue, msgClueToClue } from './convert';
import Color from '../../Color';
import ColorButton from './ColorButton';
import globals from './globals';
import HanabiCard from './HanabiCard';
import MsgClue from './MsgClue';
import PlayerButton from './PlayerButton';
import * as turn from './turn';
import RankButton from './RankButton';

export const checkLegal = () => {
    let clueTargetButtonGroup;
    if (globals.hypothetical) {
        clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
    } else {
        clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
    }
    const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
    const { clueTypeButtonGroup } = globals.elements;
    const clueButton = clueTypeButtonGroup!.getPressed() as ColorButton | RankButton;

    if (
        !target // They have not selected a target player
        || !clueButton // They have not selected a clue type
    ) {
        globals.elements.giveClueButton!.setEnabled(false);
        return;
    }

    const who = (target as PlayerButton).targetIndex;
    if (who === globals.currentPlayerIndex) {
        // They are in a hypothetical and trying to give a clue to the current player
        globals.elements.giveClueButton!.setEnabled(false);
        return;
    }

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

    globals.elements.giveClueButton!.setEnabled(enabled);
};

const showClueMatch = (target: number, clue: Clue) => {
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

export const getTouchedCardsFromClue = (target: number, clue: MsgClue) => {
    const hand = globals.elements.playerHands[target];
    const cardsTouched: Array<number> = []; // An array of the card orders
    for (const child of hand.children.toArray()) {
        const card = child.children[0];
        if (variantIsCardTouched(msgClueToClue(clue, globals.variant), card)) {
            cardsTouched.push(card.order);
        }
    }

    return cardsTouched;
};

// This mirrors the function in "variants.go"
const variantIsCardTouched = (clue: Clue, card: HanabiCard) => {
    if (clue.type === CLUE_TYPE.RANK) {
        if (card.suit!.clueRanks === 'all') {
            return true;
        }
        if (card.suit!.clueRanks === 'none') {
            return false;
        }
        if (globals.variant.rankCluesTouchNothing) {
            return false;
        }
        if (
            (globals.variant.name.includes('Pink-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Omni-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Pink-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Omni-Fives') && card.rank === 5)
        ) {
            return true;
        }
        if (
            (globals.variant.name.includes('Brown-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Null-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Muddy-Rainbow-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Brown-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Null-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Muddy-Rainbow-Fives') && card.rank === 5)
        ) {
            return false;
        }
        return clue.value === card.rank;
    }

    if (clue.type === CLUE_TYPE.COLOR) {
        if (globals.variant.colorCluesTouchNothing) {
            return false;
        }
        if (
            (globals.variant.name.includes('Rainbow-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Omni-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Rainbow-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Omni-Fives') && card.rank === 5)
        ) {
            return true;
        }
        if (
            (globals.variant.name.includes('White-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Null-Ones') && card.rank === 1)
            || (globals.variant.name.includes('Light-Pink-Ones') && card.rank === 1)
            || (globals.variant.name.includes('White-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Null-Fives') && card.rank === 5)
            || (globals.variant.name.includes('Light-Pink-Fives') && card.rank === 5)
        ) {
            return false;
        }
        return card.suit!.clueColors.includes(clue.value as Color);
    }

    return false;
};

export const give = () => {
    let clueTargetButtonGroup;
    if (globals.hypothetical) {
        clueTargetButtonGroup = globals.elements.clueTargetButtonGroup2;
    } else {
        clueTargetButtonGroup = globals.elements.clueTargetButtonGroup;
    }
    const target = clueTargetButtonGroup!.getPressed() as PlayerButton;
    const { clueTypeButtonGroup } = globals.elements;
    const clueButton = clueTypeButtonGroup!.getPressed() as ColorButton | RankButton;
    if (
        (!globals.ourTurn && !globals.hypothetical) // We can only give clues on our turn
        || globals.clues === 0 // We can only give a clue if there is one available
        || !target // We might have not selected a clue recipient
        || !clueButton // We might have not selected a type of clue
        // We might be trying to give an invalid clue (e.g. an Empty Clue)
        || !globals.elements.giveClueButton!.enabled
        // Prevent the user from accidentally giving a clue
        || (Date.now() - globals.UIClickTime < 1000)
    ) {
        return;
    }

    // Send the message to the server
    turn.end({
        type: ACTION.CLUE,
        target: target.targetIndex,
        clue: clueToMsgClue(clueButton.clue, globals.variant),
    });
};
