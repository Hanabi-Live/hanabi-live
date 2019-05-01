/*
    Users can right-click cards to record information on them
*/

// Imports
const globals = require('./globals');

// Get the contents of the note tooltip
const get = (order, our) => {
    // If we are a player in an ongoing game, return our note
    // (we don't have to check to see if the element exists because
    // all notes are initialized to an empty string)
    if (our || (!globals.replay && !globals.spectating)) {
        return globals.ourNotes[order];
    }

    // Build a string that shows the combined notes from the players & spectators
    let content = '';
    for (const noteObject of globals.allNotes[order]) {
        if (noteObject.note.length > 0) {
            content += `<strong>${noteObject.name}:</strong> ${noteObject.note}<br />`;
        }
    }
    if (content.length !== 0) {
        content = content.substr(0, content.length - 6); // Trim the trailing "<br />"
    }
    return content;
};

// A note has been updated, so:
// 1) update the stored note in memory
// 2) send the new note to the server
// 3) check for new note identities
const set = (order, note) => {
    const oldNote = globals.ourNotes[order];
    globals.ourNotes[order] = note;
    if (globals.spectating) {
        for (const noteObject of globals.allNotes[order]) {
            if (noteObject.name === globals.lobby.username) {
                noteObject.note = note;
            }
        }
    }
    globals.lastNote = note;

    // Send the note to the server
    if (!globals.replay && note !== oldNote) {
        globals.lobby.conn.send('note', {
            order,
            note,
        });
    }

    // The note identity feature does not apply to spectators and replays
    if (globals.spectating || globals.replay) {
        return;
    }

    // If the card previously had a note identity and we deleted the note,
    // then we need to remove the identity and re-draw the card
    const card = globals.deck[order];
    if (!note) {
        if (card.noteSuit !== null || card.noteRank !== null) {
            card.noteSuit = null;
            card.noteRank = null;
            card.setBareImage();
            globals.layers.card.batchDraw();
        }
        return;
    }

    // Check to see if we wrote a note that implies that we know the exact identity of this card
    // Only examine the new text that we added
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
        if (noteSuit !== null) {
            break;
        }
    }
    if (noteSuit === null) {
        if (card.noteSuit !== null) {
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

const update = (card) => {
    // Update the tooltip
    const tooltip = $(`#tooltip-${card.tooltipName}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    const note = get(card.order, false);
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

// Open the tooltip for this card
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
    const note = get(card.order, false);
    tooltipInstance.content(note);
    tooltip.tooltipster('open');
};
exports.show = show;

exports.openEditTooltip = (card) => {
    // Don't edit any notes in replays
    if (globals.replay) {
        return;
    }

    // Close any existing note tooltips
    if (globals.editingNote !== null) {
        const tooltip = $(`#tooltip-card-${globals.editingNote}`);
        tooltip.tooltipster('close');
    }

    show(card);

    globals.editingNote = card.order;
    const note = get(card.order, true);
    const tooltip = $(`#tooltip-${card.tooltipName}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    tooltipInstance.content(`<input id="tooltip-${card.tooltipName}-input" type="text" value="${note}"/>`);

    $(`#tooltip-${card.tooltipName}-input`).on('keydown', (keyEvent) => {
        keyEvent.stopPropagation();
        if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
            return;
        }

        globals.editingNote = null;

        let newNote;
        if (keyEvent.key === 'Escape') {
            // Use the existing note, if any
            newNote = get(card.order, true);
        } else if (keyEvent.key === 'Enter') {
            newNote = $(`#tooltip-${card.tooltipName}-input`).val();

            // Strip any HTML elements
            // (to be thorough, the server will also perform this validation)
            newNote = stripHTMLtags(newNote);

            set(card.order, newNote);
        }

        // Check to see if an event happened while we were editing this note
        if (globals.actionOccured) {
            globals.actionOccured = false;
            tooltip.tooltipster('close');
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

// We just got a list of a bunch of notes, so show the note indicator for currently-visible cards
exports.setAllCardIndicators = () => {
    for (let order = 0; order <= globals.indexOfLastDrawnCard; order++) {
        setCardIndicator(order);
    }
};

const setCardIndicator = (order) => {
    const visible = shouldShowIndicator(order);
    const card = globals.deck[order];
    card.noteGiven.setVisible(visible);

    if (visible && globals.spectating && !card.noteGiven.rotated) {
        card.noteGiven.rotate(15);
        card.noteGiven.rotated = true;
    }

    globals.layers.card.batchDraw();
};
exports.setCardIndicator = setCardIndicator;

const shouldShowIndicator = (order) => {
    if (globals.replay || globals.spectating) {
        for (const noteObject of globals.allNotes[order]) {
            if (noteObject.note.length > 0) {
                return true;
            }
        }
        return false;
    }

    return globals.ourNotes[order] !== '';
};
exports.shouldShowIndicator = shouldShowIndicator;

/*
    Misc. functions
*/

const stripHTMLtags = (input) => {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || '';
};
