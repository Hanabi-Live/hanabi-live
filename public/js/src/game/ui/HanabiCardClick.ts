/*
    Click functions for the HanabiCard object
*/

// Imports
import * as arrows from './arrows';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as hypothetical from './hypothetical';
import * as notes from './notes';
import * as replay from './replay';
import { STACK_BASE_RANK } from '../../constants';
import { suitToMsgSuit } from './convert';

export default function HanabiCardClick(this: HanabiCard, event: any) {
    // Speedrunning overrides the normal card clicking behavior
    // (but do not use the speedrunning behavior if we are in a
    // solo replay / shared replay / spectating)
    if (
        (globals.speedrun || globals.lobby.settings.get('speedrunMode'))
        && !globals.replay
        && !globals.spectating
    ) {
        return;
    }

    // Disable all click events if the card is tweening
    if (this.tweening) {
        return;
    }

    if (event.evt.which === 1) { // Left-click
        clickLeft(this, event.evt);
    } else if (event.evt.which === 2) { // Middle-click
        clickMiddle(this, event.evt);
    } else if (event.evt.which === 3) { // Right-click
        clickRight(this, event.evt);
    }
}

const clickLeft = (card: any, event: PointerEvent) => { // TODO change to HanabiCard
    // The "Empathy" feature is handled in the "HanabiCardInit.ts" file,
    // so we don't have to worry about it here

    // Disable this for the stack base
    if (card.rank === STACK_BASE_RANK) {
        return;
    }

    // No actions in this function use modifiers other than Alt
    if (event.ctrlKey || event.shiftKey || event.metaKey) {
        return;
    }

    if (event.altKey) {
        // Alt + clicking a card goes to the turn it was drawn
        // (we want to go to the turn before it is drawn, tween the card being drawn,
        // and then indicate the card)
        const turnBeforeDrawn = card.turnDrawn === 0 ? 0 : card.turnDrawn - 1;
        goToTurn(turnBeforeDrawn, true);
        goToTurn(card.turnDrawn, false);
        goToTurnAndIndicateCard(card.turnDrawn, card.order);
    } else if (card.isPlayed) {
        // Clicking on played cards goes to the turn immediately before they were played
        goToTurnAndIndicateCard(card.turnPlayed, card.order);
    } else if (card.isDiscarded) {
        // Clicking on discarded cards goes to the turn immediately before they were discarded
        goToTurnAndIndicateCard(card.turnDiscarded, card.order);
    }
};

const clickMiddle = (card: any, event: PointerEvent) => { // TODO change to HanabiCard
    // Disable this for the stack base
    if (card.rank === STACK_BASE_RANK) {
        return;
    }

    // No actions in this function use modifiers
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
        return;
    }

    // Middle clicking on a card goes to a turn it was first clued
    if (card.turnsClued.length === 0) {
        return;
    }
    goToTurn(card.turnsClued[0], true);
};

const clickRight = (card: any, event: PointerEvent) => { // TODO change to HanabiCard
    // Alt + right-click is a card morph (in a hypothetical)
    if (
        globals.replay
        && globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
        && globals.hypothetical
        && !event.ctrlKey
        && !event.shiftKey
        && event.altKey
        && !event.metaKey
    ) {
        clickMorph(card.order);
        return;
    }

    // Right-click for a leader in a shared replay is to draw an arrow next to the card
    // The arrow is shown to all the members of the reply in order to draw attention to the card
    // (we want it to work no matter what modifiers are being pressed,
    // in case someone is pushing their push-to-talk hotkey while highlighting cards)
    if (
        globals.replay
        && globals.sharedReplay
        && globals.amSharedReplayLeader
        && globals.useSharedTurns
    ) {
        arrows.send(card.order, card);
        return;
    }

    // Right-click in a solo replay just displays what card order (in the deck) that it is
    if (globals.replay && !globals.sharedReplay) {
        console.log(`This card's order is: ${card.order}`);
    }

    // Ctrl + shift + right-click is a shortcut for entering the same note as previously entered
    // (this must be above the other note code because of the modifiers)
    if (
        event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.replay
        && !globals.spectating
    ) {
        card.setNote(globals.lastNote);
        return;
    }

    // Shift + right-click is a "f" note
    // (this is a common abbreviation for "this card is Finessed")
    if (
        !event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.replay
        && !globals.spectating
    ) {
        card.setNote('f');
        return;
    }

    // Alt + right-click is a "cm" note
    // (this is a common abbreviation for "this card is chop moved")
    if (
        !event.ctrlKey
        && !event.shiftKey
        && event.altKey
        && !event.metaKey
        && !globals.replay
        && !globals.spectating
    ) {
        card.setNote('cm');
        return;
    }

    // Alt + shift + right-click is a "p" note
    // (this is a common abbreviation for "this card was told to play")
    if (
        !event.ctrlKey
        && event.shiftKey
        && event.altKey
        && !event.metaKey
    ) {
        card.setNote('p');
    }

    // Ctrl + right-click is a local arrow
    // Even if they are not a leader in a shared replay,
    // a user might still want to draw an arrow on a card for demonstration purposes
    // However, we don't want this functionality in shared replays because
    // it could be misleading as to who the real replay leader is
    if (
        event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.sharedReplay
    ) {
        arrows.toggle(card);
        return;
    }

    // A normal right-click is edit a note
    if (
        !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.replay
    ) {
        notes.openEditTooltip(card);
    }
};

const goToTurn = (turn: number, fast: boolean) => {
    if (globals.replay) {
        replay.checkDisableSharedTurns();
    } else {
        replay.enter();
    }
    replay.goto(turn, fast);
};

const goToTurnAndIndicateCard = (turn: number, order: number) => {
    goToTurn(turn, true);

    // We indicate the card to make it easier to find
    arrows.hideAll(); // We hide all the arrows first to ensure that the arrow is always shown
    arrows.toggle(globals.deck[order]);
};

// Morphing cards allows for creation of hypothetical situations
const clickMorph = (order: number) => {
    const card = prompt('What card do you want to morph it into?\n(e.g. "b1", "k2", "m3")');
    if (card === null) {
        return;
    }
    if (card.length !== 2) {
        alert('You entered an invalid card.');
        return;
    }
    const suitLetter = card[0];
    let suit = null;
    for (const variantSuit of globals.variant.suits) {
        if (suitLetter.toLowerCase() === variantSuit.abbreviation.toLowerCase()) {
            suit = variantSuit;
        }
    }
    if (suit === null) {
        let msg = `I don't know what suit corresponds to the letter "${suitLetter}".\n`;
        const abbreviations = globals.variant.suits.map(
            (variantSuit) => variantSuit.abbreviation.toLowerCase(),
        );
        msg += `The available acronyms are: ${abbreviations}`;
        alert(msg);
        return;
    }
    suit = suitToMsgSuit(suit, globals.variant);

    const rank = parseInt(card[1], 10);
    if (Number.isNaN(rank) || rank < 0 || rank > 7) {
        alert(`The rank of "${card[1]}" is not valid.`);
        return;
    }

    // Tell the server that we are doing a hypothetical
    hypothetical.sendHypoAction({
        type: 'reveal',
        order,
        suit,
        rank,
    });
};
