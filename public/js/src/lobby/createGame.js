/*
    The "Create Game" nav button
*/

// Imports
const constants = require('../constants');
const globals = require('../globals');
const misc = require('../misc');

$(document).ready(() => {
    // Populate the variant dropdown in the "Create Game" tooltip
    for (const variantName of Object.keys(constants.VARIANTS)) {
        const option = new Option(variantName, variantName);
        $('#createTableVariant').append($(option));

        if (constants.VARIANTS[variantName].spacing) {
            const spacing = new Option('─────────────────────────', null);
            spacing.disabled = true;
            $('#createTableVariant').append($(spacing));
        }
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
        correspondence: getCheckbox('createTableCorrespondence'),
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

    // Focus the "Name" box
    // (we have to wait 1 millisecond or it won't work due to the nature of the tooltip)
    setTimeout(() => {
        $('#createTableName').focus();
    }, 1);

    // Fill in the rest of form with the settings that we used last time
    // (which is stored on the server)
    for (const key of Object.keys(globals.settings)) {
        const value = globals.settings[key];
        const element = $(`#${key}`);
        if (typeof value === 'boolean') {
            // Checkboxes
            element.prop('checked', value);
            element.change();
        } else {
            // Input fields and select dropdowns
            element.val(value);
        }
    }

    // Fill in the "Password" box
    // (this is not stored on the server so we have to retrieve the last password from a cookie)
    const password = localStorage.getItem('createTablePassword');
    $('#createTablePassword').val(password);
};
