/*
    Users can right-click cards to record information on them
*/

// Imports
const globals = require('./globals');

// Variables
let notes; // An array containing all of the player's notes, indexed by card order
// Some variables must be in an object so that they are passed as a reference between files
const vars = {};
exports.vars = vars;

exports.init = () => {
    notes = [];

    // Used to keep track of which card the user is editing;
    // users can only update one note at a time to prevent bugs
    // Equal to the card order number or null
    vars.editing = null;
    // Equal to true if something happened when the note box happens to be open
    vars.actionOccured = false;
    vars.lastNote = ''; // Equal to the last note entered
};

const get = (order) => {
    const note = notes[order];
    if (typeof note === 'undefined') {
        return null;
    }
    return note;
};
exports.get = get;

const set = (order, note, send = true) => {
    const card = globals.deck[order];

    if (note === '') {
        note = undefined;
    }
    const oldNote = notes[order];
    notes[order] = note;
    vars.lastNote = note;

    // Send the note to the server
    if (send && !globals.replay && !globals.spectating) {
        globals.lobby.conn.send('note', {
            order,
            note,
        });
    }

    // Check to see if they wrote a note that implies that they know the exact identity of this card
    if (!note || globals.replay || globals.spectating) {
        if (card.noteSuit) {
            card.noteSuit = null;
            card.noteRank = null;
            card.setBareImage();
            globals.layers.card.batchDraw();
        }
        return;
    }
    // Only examine the new text that they added
    const getDiff = (string, diffBy) => string.split(diffBy).join('');
    let diff = getDiff(note, oldNote);
    // Remove all pipes (which are a conventional way to append new information to a note)
    diff = diff.replace(/\|+/g, '');
    diff = diff.trim(); // Remove all leading and trailing whitespace
    let noteSuit = null;
    let noteRank = null;
    for (const suit of globals.variant.suits) {
        for (const rank of globals.variant.ranks) {
            if (
                diff === `${suit.abbreviation.toLowerCase()}${rank}` // e.g. b1
                || diff === `${suit.abbreviation.toUpperCase()}${rank}` // e.g. B1
                || diff === `${suit.name}${rank}` // e.g. Blue1
                || diff === `${suit.name} ${rank}` // e.g. Blue 1
                || diff === `${suit.name.toLowerCase()}${rank}` // e.g. blue1
                || diff === `${suit.name.toLowerCase()} ${rank}` // e.g. blue 1
                || diff === `${suit.name.toUpperCase()}${rank}` // e.g. BLUE1
                || diff === `${suit.name.toUpperCase()} ${rank}` // e.g. BLUE 1
                || diff === `${rank}${suit.abbreviation.toLowerCase()}` // e.g. 1b
                || diff === `${rank}${suit.abbreviation.toUpperCase()}` // e.g. 1B
                || diff === `${rank}${suit.name}` // e.g. 1Blue
                || diff === `${rank} ${suit.name}` // e.g. 1 Blue
                || diff === `${rank}${suit.name.toLowerCase()}` // e.g. 1blue
                || diff === `${rank} ${suit.name.toLowerCase()}` // e.g. 1 blue
                || diff === `${rank}${suit.name.toUpperCase()}` // e.g. 1BLUE
                || diff === `${rank} ${suit.name.toUpperCase()}` // e.g. 1 BLUE
            ) {
                noteSuit = suit;
                noteRank = rank;
                break;
            }
        }
        if (noteSuit) {
            break;
        }
    }
    if (!noteSuit) {
        if (card.noteSuit) {
            card.noteSuit = null;
            card.noteRank = null;
            card.setBareImage();
            globals.layers.card.batchDraw();
        }
        return;
    }

    // Validate that the note does not contain an impossibility
    const mapIndex = `${noteSuit.name}${noteRank}`;
    if (card.possibleCards.get(mapIndex) === 0) {
        window.alert(`That card cannot possibly be a ${noteSuit.name.toLowerCase()} ${noteRank}.`);
        return;
    }

    // Set the bare image of the card to match the note
    card.noteSuit = noteSuit;
    card.noteRank = noteRank;
    card.setBareImage();
    globals.layers.card.batchDraw();
};
exports.set = set;

const show = (card) => {
    const tooltip = $(`#tooltip-${card.tooltipName}`);
    const tooltipInstance = tooltip.tooltipster('instance');

    // Do nothing if the tooltip is already open
    if (tooltip.tooltipster('status').open) {
        return;
    }

    // We want the tooltip to appear above the card by default
    const pos = card.getAbsolutePosition();
    let posX = pos.x;
    let posY = pos.y - (card.getHeight() * card.parent.scale().y / 2);
    tooltipInstance.option('side', 'top');

    // Flip the tooltip if it is too close to the top of the screen
    if (posY < 200) {
        // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
        posY = pos.y + (card.getHeight() * card.parent.scale().y / 2);
        tooltipInstance.option('side', 'bottom');
    }

    // If there is an clue arrow showing, it will overlap with the tooltip arrow,
    // so move it over to the right a little bit
    for (const arrow of globals.elements.arrows) {
        if (arrow.pointingTo === card.order) {
            posX = pos.x + ((card.getWidth() * card.parent.scale().x / 2) / 2.5);
            break;
        }
    }

    // Update the tooltip and open it
    tooltip.css('left', posX);
    tooltip.css('top', posY);
    const note = get(card.order) || '';
    tooltipInstance.content(note);
    tooltip.tooltipster('open');
};
exports.show = show;

exports.openEditTooltip = (card) => {
    // Don't edit any notes in shared replays
    if (globals.sharedReplay) {
        return;
    }

    // Close any existing note tooltips
    if (vars.editing !== null) {
        const tooltip = $(`#tooltip-card-${vars.editing}`);
        tooltip.tooltipster('close');
    }

    show(card);

    vars.editing = card.order;
    let note = get(card.order);
    if (note === null) {
        note = '';
    }
    const tooltip = $(`#tooltip-${card.tooltipName}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    tooltipInstance.content(`<input id="tooltip-${card.tooltipName}-input" type="text" value="${note}"/>`);

    $(`#tooltip-${card.tooltipName}-input`).on('keydown', (keyEvent) => {
        keyEvent.stopPropagation();
        if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
            return;
        }

        vars.editing = null;

        if (keyEvent.key === 'Escape') {
            note = get(card.order);
            if (note === null) {
                note = '';
            }
        } else if (keyEvent.key === 'Enter') {
            note = $(`#tooltip-${card.tooltipName}-input`).val();

            // Strip any HTML elements
            // (to be thorough, the server will also perform this validation)
            note = stripHTMLtags(note);

            set(card.order, note);

            // Check to see if an event happened while we were editing this note
            if (vars.actionOccured) {
                vars.actionOccured = false;
                tooltip.tooltipster('close');
            }
        }

        update(card);
    });

    // Automatically highlight all of the existing text when a note input box is focused
    $(`#tooltip-${card.tooltipName}-input`).focus(function tooltipCardInputFocus() {
        $(this).select();
    });

    // Automatically focus the new text input box
    $(`#tooltip-${card.tooltipName}-input`).focus();
};

const update = (card) => {
    // Update the tooltip
    const tooltip = $(`#tooltip-${card.tooltipName}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    const note = get(card.order) || '';
    tooltipInstance.content(note);
    if (note.length === 0) {
        tooltip.tooltipster('close');
    }

    // Update the card indicator
    const visibleOld = card.noteGiven.getVisible();
    const visibleNew = note.length > 0;
    card.noteGiven.setVisible(visibleNew);
    if (visibleOld !== visibleNew) {
        globals.layers.card.batchDraw();
    }
};
exports.update = update;

/*
    Misc. functions
*/

const stripHTMLtags = (input) => {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || '';
};
