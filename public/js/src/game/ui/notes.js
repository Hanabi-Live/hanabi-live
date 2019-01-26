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
};

const get = (order) => {
    const note = notes[order];
    if (typeof note === 'undefined') {
        return null;
    }
    return note;
};
exports.get = get;

const set = (order, note) => {
    if (note === '') {
        note = undefined;
    }
    notes[order] = note;
};
exports.set = set;

const show = (card) => {
    const tooltip = $(`#tooltip-card-${card.order}`);
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
    if (card.indicatorArrow.visible()) {
        posX = pos.x + ((card.getWidth() * card.parent.scale().x / 2) / 2.5);
    }

    // Update the tooltip and open it
    tooltip.css('left', posX);
    tooltip.css('top', posY);
    tooltipInstance.content(get(card.order) || '');
    tooltip.tooltipster('open');
};
exports.show = show;

exports.edit = (card, event) => {
    if (event.evt.which !== 3) { // Right-click
        // We only care about right clicks
        return;
    }

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
    const tooltip = $(`#tooltip-card-${card.order}`);
    const tooltipInstance = tooltip.tooltipster('instance');
    tooltipInstance.content(`<input id="tooltip-card-${card.order}-input" type="text" value="${note}"/>`);

    $(`#tooltip-card-${card.order}-input`).on('keydown', (keyEvent) => {
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
            note = $(`#tooltip-card-${card.order}-input`).val();

            // Strip any HTML elements
            // (to be thorough, the server will also perform this validation)
            note = stripHTMLtags(note);

            set(card.order, note);

            // Also send the note to the server
            if (!globals.replay && !globals.spectating) {
                globals.lobby.conn.send('note', {
                    order: card.order,
                    note,
                });
            }

            // Check to see if an event happened while we were editing this note
            if (vars.actionOccured) {
                vars.actionOccured = false;
                tooltip.tooltipster('close');
            }
        }

        tooltipInstance.content(note);
        card.noteGiven.setVisible(note.length > 0);
        if (note.length === 0) {
            tooltip.tooltipster('close');
        }

        globals.layers.UI.draw();
        globals.layers.card.draw();
    });

    // Automatically highlight all of the existing text when a note input box is focused
    $(`#tooltip-card-${card.order}-input`).focus(function tooltipCardInputFocus() {
        $(this).select();
    });

    // Automatically focus the new text input box
    $(`#tooltip-card-${card.order}-input`).focus();
};

/*
    Misc. functions
*/

const stripHTMLtags = (input) => {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || '';
};
