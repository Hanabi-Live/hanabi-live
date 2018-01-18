/*
    The "Create Game" nav button
*/

const constants = require('../constants');
const globals = require('../globals');
const misc = require('../misc');

$(document).ready(() => {
    // Populate the variant dropdown
    for (let i = 0; i < constants.VARIANT_INTEGER_MAPPING.length; i++) {
        const name = constants.VARIANT_INTEGER_MAPPING[i].nameShort;
        const option = new Option(name, i);
        $('#create-game-variant').append($(option));
    }

    // Make the extra time fields appear and disappear depending on whether the checkbox is checked
    $('#create-game-timed').change((data) => {
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

    $('#create-game-submit').on('click', (event) => {
        event.preventDefault();

        const gameName = $('#create-game-name').val();

        const variant = parseInt($('#create-game-variant').val(), 10);
        localStorage.setItem('createTableVariant', variant);

        const timed = document.getElementById('create-game-timed').checked;
        localStorage.setItem('createTableTimed', timed);

        const baseTimeMinutes = $('#base-time-minutes').val();
        localStorage.setItem('baseTimeMinutes', baseTimeMinutes);

        const timePerTurnSeconds = $('#time-per-turn-seconds').val();
        localStorage.setItem('timePerTurnSeconds', timePerTurnSeconds);

        const reorderCards = document.getElementById('create-game-reorder-cards').checked;
        localStorage.setItem('createTableReorderCards', reorderCards);

        globals.conn.send('gameCreate', {
            name: gameName,
            variant,
            timed,
            baseTimeMinutes: parseFloat(baseTimeMinutes), // The server expects this as an float64
            timePerTurnSeconds: parseInt(timePerTurnSeconds, 10), // The server expects this as an integer
            reorderCards,
        });

        misc.closeAllTooltips();
    });
});

// This function is executed every time the button is clicked (after the tooltip is added to the DOM)
exports.ready = () => {
    // Fill in the "Name" box
    $('#create-game-name').val(globals.randomName);

    // Get a new random name from the server for the next time we click the button
    globals.conn.send('getName', {});

    // Fill in the "Variant" dropdown
    let variant;
    try {
        variant = JSON.parse(localStorage.getItem('createTableVariant'));
    } catch (err) {
        variant = 0;
    }
    if (typeof variant !== 'number' || variant < 0 || variant >= constants.VARIANT_INTEGER_MAPPING.length) {
        variant = 0;
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
        baseTimeMinutes = JSON.parse(localStorage.getItem('baseTimeMinutes'));
    } catch (err) {
        baseTimeMinutes = 2;
    }
    if (typeof baseTimeMinutes !== 'number' || baseTimeMinutes < 0) {
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

    // Fill in the "Reorder Cards" checkbox
    let reorderCards;
    try {
        reorderCards = JSON.parse(localStorage.getItem('createTableReorderCards'));
    } catch (err) {
        reorderCards = false;
    }
    if (typeof timed !== 'boolean') {
        timed = false;
    }
    $('#create-game-reorder-cards').prop('checked', reorderCards);

    // Focus the "Name" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the above code)
    setTimeout(() => {
        $('#create-game-name').focus();
    }, 1);
};
