/*
    The "Create Game" nav button
*/

// Imports
const globals = require('../globals');
const misc = require('../misc');

$(document).ready(() => {
    // Populate the variant dropdown in the "Create Game" tooltip
    for (const variant of Object.keys(constants.VARIANTS)) {
        const option = new Option(variant, variant);
        $('#create-game-variant').append($(option));
    }

    // Make the extra time fields appear and disappear depending on whether the checkbox is checked
    $('#create-game-timed').change(() => {
        if ($('#create-game-timed').prop('checked')) {
            $('#create-game-timed-option-1').show();
            $('#create-game-timed-option-2').show();
            $('#create-game-timed-option-3').show();
            $('#create-game-timed-option-4').show();
            $('#create-game-timed-option-padding').hide();
        } else {
            $('#create-game-timed-option-1').hide();
            $('#create-game-timed-option-2').hide();
            $('#create-game-timed-option-3').hide();
            $('#create-game-timed-option-4').hide();
            $('#create-game-timed-option-padding').show();
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });

    $('#create-game-tooltip').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#create-game-submit').click();
        }
    });

    $('#create-game-submit').on('click', submit);
});

const submit = (event) => {
    event.preventDefault();

    const name = $('#create-game-name').val();

    const variant = $('#create-game-variant').val();
    localStorage.setItem('createTableVariant', variant);

    const timed = document.getElementById('create-game-timed').checked;
    localStorage.setItem('createTableTimed', timed);

    const baseTimeMinutes = $('#base-time-minutes').val();
    localStorage.setItem('baseTimeMinutes', baseTimeMinutes);

    const timePerTurnSeconds = $('#time-per-turn-seconds').val();
    localStorage.setItem('timePerTurnSeconds', timePerTurnSeconds);

    const deckPlays = document.getElementById('create-game-deck-plays').checked;
    localStorage.setItem('createTableDeckPlays', deckPlays);

    const emptyClues = document.getElementById('create-game-empty-clues').checked;
    localStorage.setItem('createTableEmptyClues', emptyClues);

    const characterAssignments = document.getElementById('create-game-character-assignments').checked;
    localStorage.setItem('createTableCharacterAssignments', characterAssignments);

    let password = $('#create-game-password').val();
    localStorage.setItem('createTablePassword', password);
    if (password !== '') {
        password = hex_sha256(`Hanabi game password ${password}`);
    }

    const alertWaiters = document.getElementById('create-game-alert-waiters').checked;
    localStorage.setItem('createTableAlertWaiters', alertWaiters);

    globals.conn.send('gameCreate', {
        name,
        variant,
        timed,
        baseTimeMinutes: parseFloat(baseTimeMinutes),
        // The server expects this as an float64
        timePerTurnSeconds: parseInt(timePerTurnSeconds, 10),
        // The server expects this as an integer
        deckPlays,
        emptyClues,
        characterAssignments,
        password,
        alertWaiters,
    });

    misc.closeAllTooltips();
};

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
exports.ready = () => {
    // Fill in the "Name" box
    $('#create-game-name').val(globals.randomName);

    // Get a new random name from the server for the next time we click the button
    globals.conn.send('getName');

    if (globals.username.startsWith('test')) {
        $('#create-game-name').val('test game');
    }

    // Fill in the "Variant" dropdown
    let variant = localStorage.getItem('createTableVariant');
    if (typeof variant !== 'string') {
        variant = 'No Variant';
    }
    $('#create-game-variant').val(variant);

    // Fill in the "Timed" checkbox
    let timed;
    try {
        timed = JSON.parse(localStorage.getItem('createTableTimed'));
    } catch (err) {
        timed = false;
    }
    if (typeof timed !== 'boolean') {
        timed = false;
    }
    $('#create-game-timed').prop('checked', timed);
    $('#create-game-timed').change();

    // Fill in the "Base Time" box
    let baseTimeMinutes;
    try {
        // We don't want to do "JSON.parse()" here because it may not be a whole number
        baseTimeMinutes = localStorage.getItem('baseTimeMinutes');
    } catch (err) {
        baseTimeMinutes = 2;
    }
    if (baseTimeMinutes < 0) {
        baseTimeMinutes = 2;
    }
    $('#base-time-minutes').val(baseTimeMinutes);

    // Fill in the "Time Per Turn" box
    let timePerTurnSeconds;
    try {
        timePerTurnSeconds = JSON.parse(localStorage.getItem('timePerTurnSeconds'));
    } catch (err) {
        timePerTurnSeconds = 20;
    }
    if (typeof timePerTurnSeconds !== 'number' || timePerTurnSeconds < 0) {
        timePerTurnSeconds = 20;
    }
    $('#time-per-turn-seconds').val(timePerTurnSeconds);

    // Fill in the "Allow Bottom-Deck Blind Plays" checkbox
    let deckPlays;
    try {
        deckPlays = JSON.parse(localStorage.getItem('createTableDeckPlays'));
    } catch (err) {
        deckPlays = false;
    }
    if (typeof deckPlays !== 'boolean') {
        deckPlays = false;
    }
    $('#create-game-deck-plays').prop('checked', deckPlays);

    // Fill in the "Allow Empty Clues" checkbox
    let emptyClues;
    try {
        emptyClues = JSON.parse(localStorage.getItem('createTableEmptyClues'));
    } catch (err) {
        emptyClues = false;
    }
    if (typeof emptyClues !== 'boolean') {
        emptyClues = false;
    }
    $('#create-game-empty-clues').prop('checked', emptyClues);

    // Fill in the "Detrimental Character Assignments" checkbox
    let characterAssignments;
    try {
        characterAssignments = JSON.parse(localStorage.getItem('createTableCharacterAssignments'));
    } catch (err) {
        characterAssignments = false;
    }
    if (typeof characterAssignments !== 'boolean') {
        characterAssignments = false;
    }
    $('#create-game-character-assignments').prop('checked', characterAssignments);

    // Fill in the "Password" box
    const password = localStorage.getItem('createTablePassword');
    $('#create-game-password').val(password);

    // Fill in the "Alert people" box
    let alertWaiters;
    try {
        alertWaiters = JSON.parse(localStorage.getItem('createTableAlertWaiters'));
    } catch (err) {
        alertWaiters = false;
    }
    if (typeof alertWaiters !== 'boolean') {
        alertWaiters = false;
    }
    $('#create-game-alert-waiters').prop('checked', alertWaiters);

    // Focus the "Name" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the above code)
    setTimeout(() => {
        $('#create-game-name').focus();
    }, 1);
};
