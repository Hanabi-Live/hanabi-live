/*
    The "Create Game" nav button
*/

// Imports
const constants = require('../constants');
const globals = require('../globals');
const misc = require('../misc');

$(document).ready(() => {
    // Populate the variant dropdown in the "Create Game" tooltip
    for (const variant of Object.keys(constants.VARIANTS)) {
        const option = new Option(variant, variant);
        $('#createTableVariant').append($(option));
    }

    // Make the extra time fields appear and disappear depending on whether the checkbox is checked
    $('#createTableTimed').change(() => {
        if ($('#createTableTimed').prop('checked')) {
            $('#create-game-timed-label').removeClass('col-3');
            $('#create-game-timed-label').addClass('col-2');
            $('#create-game-timed-option-1').show();
            $('#create-game-timed-option-2').show();
            $('#create-game-timed-option-3').show();
            $('#create-game-timed-option-4').show();
        } else {
            $('#create-game-timed-label').addClass('col-3');
            $('#create-game-timed-label').removeClass('col-2');
            $('#create-game-timed-option-1').hide();
            $('#create-game-timed-option-2').hide();
            $('#create-game-timed-option-3').hide();
            $('#create-game-timed-option-4').hide();
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });
    $('#createTableSpeedrun').change(() => {
        if ($('#createTableSpeedrun').prop('checked')) {
            $('#create-game-timed-row').hide();
            $('#create-game-timed-row-spacing').hide();
        } else {
            $('#create-game-timed-row').show();
            $('#create-game-timed-row-spacing').show();
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

const submit = () => {
    // We need to mutate some values before sending them to the server
    const baseTimeMinutes = getTextbox('createTableBaseTimeMinutes');
    const baseTime = Math.round(baseTimeMinutes * 60); // The server expects this in seconds
    const timePerTurnSeconds = getTextbox('createTableTimePerTurnSeconds');
    const timePerTurn = parseInt(timePerTurnSeconds, 10); // The server expects this in seconds

    // All "Create Game" settings are stored on the server with the exception of passwords;
    // passwords are stored locally as cookies
    let password = $('#createTablePassword').val();
    localStorage.setItem('createTablePassword', password);
    if (password !== '') {
        password = hex_sha256(`Hanabi game password ${password}`);
    }

    globals.conn.send('gameCreate', {
        name: $('#createTableName').val(), // We don't bother to store the table name
        variant: getTextbox('createTableVariant'),
        timed: getCheckbox('createTableTimed'),
        baseTime,
        timePerTurn,
        speedrun: getCheckbox('createTableSpeedrun'),
        deckPlays: getCheckbox('createTableDeckPlays'),
        emptyClues: getCheckbox('createTableEmptyClues'),
        characterAssignments: getCheckbox('createTableCharacterAssignments'),
        password,
        alertWaiters: getCheckbox('createTableAlertWaiters'),
    });

    misc.closeAllTooltips();
};

const getCheckbox = (setting) => {
    const value = document.getElementById(setting).checked;
    checkChanged(setting, value);
    return value;
};

const getTextbox = (setting) => {
    const value = $(`#${setting}`).val();
    checkChanged(setting, value);
    return value;
};

const checkChanged = (setting, value) => {
    // If we are creating a new kind of table than the last one one,
    // update our local variables and then send the new setting to the server
    if (value !== globals.settings[setting]) {
        globals.settings[setting] = value;
        globals.conn.send('setting', {
            name: setting,
            value: value.toString(), // The server expects all settings as strings
        });
    }
};

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
exports.ready = () => {
    // Fill in the "Name" box
    if (globals.username.startsWith('test')) {
        $('#createTableName').val('test game');
    } else {
        $('#createTableName').val(globals.randomName);

        // Get a new random name from the server for the next time we click the button
        globals.conn.send('getName');
    }

    // Fill in the "Variant" dropdown
    $('#createTableVariant').val(globals.settings.createTableVariant);

    // Fill in the "Timed" checkbox
    $('#createTableTimed').prop('checked', globals.settings.createTableTimed);
    $('#createTableTimed').change();

    // Fill in the "Base Time" box
    $('#createTableBaseTimeMinutes').val(globals.settings.createTableBaseTimeMinutes);

    // Fill in the "Time Per Turn" box
    $('#createTableTimePerTurnSeconds').val(globals.settings.createTableTimePerTurnSeconds);

    // Fill in the "Speedrun" checkbox
    $('#createTableSpeedrun').prop('checked', globals.settings.createTableSpeedrun);
    $('#createTableSpeedrun').change();

    // Fill in the "Allow Bottom-Deck Blind Plays" checkbox
    $('#createTableDeckPlays').prop('checked', globals.settings.createTableDeckPlays);

    // Fill in the "Allow Empty Clues" checkbox
    $('#createTableEmptyClues').prop('checked', globals.settings.createTableEmptyClues);

    // Fill in the "Detrimental Character Assignments" checkbox
    $('#createTableCharacterAssignments').prop('checked', globals.settings.createTableCharacterAssignments);

    // Fill in the "Password" box
    const password = localStorage.getItem('createTablePassword');
    $('#createTablePassword').val(password);

    // Fill in the "Alert people on the waiting list" box
    $('#createTableAlertWaiters').prop('checked', globals.settings.createTableAlertWaiters);

    // Focus the "Name" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the tooltip)
    setTimeout(() => {
        $('#createTableName').focus();
    }, 1);
};
