/*
    The "Create Table" nav button
*/

// Imports
const constants = require('../constants');
const globals = require('../globals');
const misc = require('../misc');

exports.init = () => {
    $(document).ready(() => {
        // Populate the variant dropdown in the "Create Table" tooltip
        for (const variantName of Object.keys(constants.VARIANTS)) {
            const option = new Option(variantName, variantName);
            $('#createTableVariant').append($(option));

            if (constants.VARIANTS[variantName].spacing) {
                const spacing = new Option('─────────────────────────', null);
                spacing.disabled = true;
                $('#createTableVariant').append($(spacing));
            }
        }

        // Make the extra time fields appear and disappear depending on whether the checkbox is
        // checked
        $('#createTableTimed').change(() => {
            if ($('#createTableTimed').prop('checked')) {
                $('#create-table-timed-label').removeClass('col-3');
                $('#create-table-timed-label').addClass('col-2');
                $('#create-table-timed-option-1').show();
                $('#create-table-timed-option-2').show();
                $('#create-table-timed-option-3').show();
                $('#create-table-timed-option-4').show();
            } else {
                $('#create-table-timed-label').addClass('col-3');
                $('#create-table-timed-label').removeClass('col-2');
                $('#create-table-timed-option-1').hide();
                $('#create-table-timed-option-2').hide();
                $('#create-table-timed-option-3').hide();
                $('#create-table-timed-option-4').hide();
            }

            // Redraw the tooltip so that the new elements will fit better
            $('#nav-buttons-tables-create-table').tooltipster('reposition');
        });
        $('#createTableSpeedrun').change(() => {
            if ($('#createTableSpeedrun').prop('checked')) {
                $('#create-table-timed-row').hide();
                $('#create-table-timed-row-spacing').hide();
            } else {
                $('#create-table-timed-row').show();
                $('#create-table-timed-row-spacing').show();
            }

            // Redraw the tooltip so that the new elements will fit better
            $('#nav-buttons-tables-create-table').tooltipster('reposition');
        });

        $('#create-table-tooltip').on('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                $('#create-table-submit').click();
            }
        });

        $('#create-table-submit').on('click', submit);
    });
};

const submit = () => {
    // We need to mutate some values before sending them to the server
    const baseTimeMinutes = getTextbox('createTableBaseTimeMinutes');
    const baseTime = Math.round(baseTimeMinutes * 60); // The server expects this in seconds
    const timePerTurnSeconds = getTextbox('createTableTimePerTurnSeconds');
    const timePerTurn = parseInt(timePerTurnSeconds, 10); // The server expects this in seconds

    // All "Create Table" settings are stored on the server with the exception of passwords;
    // passwords are stored locally as cookies
    let password = $('#createTablePassword').val();
    localStorage.setItem('createTablePassword', password);
    if (password !== '') {
        password = hex_sha256(`Hanabi table password ${password}`);
    }

    globals.conn.send('tableCreate', {
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

// This function is executed every time the "Create Table" button is clicked
// (after the tooltip is added to the DOM)
exports.ready = () => {
    // Fill in the "Name" box
    if (globals.username.startsWith('test')) {
        $('#createTableName').val('test table');
    } else {
        $('#createTableName').val(globals.randomName);

        // Get a new random name from the server for the next time we click the button
        globals.conn.send('getName');
    }

    // Focus the "Name" box
    // (this has to be in a callback in order to work)
    setTimeout(() => {
        $('#createTableName').focus();
    }, 0);

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
