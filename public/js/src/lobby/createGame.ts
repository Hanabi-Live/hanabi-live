/*
    The "Create Game" nav button
*/

// Imports
import SlimSelect from 'slim-select';
import shajs from 'sha.js';
import globals from '../globals';
import * as misc from '../misc';
import variantsJSON from '../data/variants.json';
import { VARIANTS } from '../constants';

export const init = () => {
    // In the create game tooltip,
    // the user can select a variant in a dropdown that contains all 1000+ variants
    // Unfortunately, having so many div elements causes the DOM to lag every time the tooltip is
    // opened; thus, we show a "fake" variant dropdown by default, and only populate the real one if
    // the fake one is clicked
    // "createTableVariant" is the "fake" element
    // "createTableVariant2" is the Slim Select element
    const createTableVariantClickOrKeydown = () => {
        const oldVariant = $('#createTableVariant').val();
        if (typeof oldVariant !== 'string') {
            throw new Error('The "#createTableVariant" element did not have a string value.');
        }
        $('#createTableVariant').empty();
        $('#createTableVariant').append($('<option/>', {
            value: null,
            text: 'Loading the variants...',
        }));
        $('#createTableVariant').blur();

        // Put the rest of the code in a callback so that the browser screen will update and show
        // the "Loading the variants..." text
        setTimeout(() => {
            $('#createTableVariant').hide(0);
            $('#createTableVariant2').show(0);

            // Populate the Slim Select dropdown with the name of every variant
            const line = '──────────────';
            for (const [variantName, variantJSON] of Object.entries(variantsJSON) as any) {
                $('#createTableVariant2').append($('<option/>', {
                    value: variantName,
                    text: variantName,
                }));

                if (variantJSON.spacing) {
                    const spacing = new Option(line);
                    spacing.disabled = true;
                    $('#createTableVariant2').append($(spacing));
                }
            }

            // Transform the select element into a Slim Select element
            const variantDropdown = new SlimSelect({
                select: '#createTableVariant2',
                afterClose: () => {
                    // Write the newly chosen variant back to the fake select element
                    const variantChosen = $('#createTableVariant2').val();
                    $('#createTableVariant').empty();
                    $('#createTableVariant').append($('<option/>', {
                        value: variantChosen,
                        text: variantChosen,
                    }));

                    // Hide & destroy the Slim Select dropdown and
                    // re-show the fake select element
                    $('#createTableVariant2').hide(0);
                    $('#createTableVariant').show(0);
                    variantDropdown.destroy();
                    $('#createTableVariant2').empty();
                },
            });

            // Set the dropdown to be what was already selected in the fake select element
            variantDropdown.set(oldVariant);

            // The user expects the dropdown to be open, so manually open it
            variantDropdown.open();
        }, 0);
    };
    $('#createTableVariant').click(createTableVariantClickOrKeydown);
    $('#createTableVariant').keydown(createTableVariantClickOrKeydown);
    // (we catch keydown instead of keypress because arrow keys are only triggered on
    // keydown and keyup)

    // The "dice" button will select a random variant from the list
    $('#dice').on('click', () => {
        const variantNames = Array.from(VARIANTS.keys());
        const randomVariantIndex = misc.getRandomNumber(0, variantNames.length - 1);
        const randomVariant = variantNames[randomVariantIndex];
        const element = $('#createTableVariant');
        element.empty();
        element.append($('<option/>', {
            value: randomVariant,
            text: randomVariant,
        }));
        element.val(randomVariant);
    });

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
};

const submit = () => {
    // We need to mutate some values before sending them to the server
    const baseTimeMinutes = parseFloat(getTextbox('createTableBaseTimeMinutes'));
    const baseTime = Math.round(baseTimeMinutes * 60); // The server expects this in seconds
    const timePerTurnSeconds = getTextbox('createTableTimePerTurnSeconds');
    const timePerTurn = parseInt(timePerTurnSeconds, 10); // The server expects this in seconds

    // All "Create Game" settings are stored on the server with the exception of passwords;
    // passwords are stored locally as cookies
    let password = $('#createTablePassword').val();
    if (typeof password !== 'string') {
        throw new Error('The value of the "createTablePassword" element was not a string.');
    }
    localStorage.setItem('createTablePassword', password);
    if (password !== '') {
        const stringToHash = `Hanabi game password ${password}`;
        password = shajs('sha256').update(stringToHash).digest('hex');
    }

    globals.conn.send('tableCreate', {
        name: $('#createTableName').val(), // We don't bother to store the table name
        variant: getTextbox('createTableVariant'),
        timed: getCheckbox('createTableTimed'),
        baseTime,
        timePerTurn,
        speedrun: getCheckbox('createTableSpeedrun'),
        cardCycle: getCheckbox('createTableCardCycle'),
        deckPlays: getCheckbox('createTableDeckPlays'),
        emptyClues: getCheckbox('createTableEmptyClues'),
        characterAssignments: getCheckbox('createTableCharacterAssignments'),
        password,
        alertWaiters: getCheckbox('createTableAlertWaiters'),
    });

    misc.closeAllTooltips();
};

const getCheckbox = (setting: string) => {
    const element = document.getElementById(setting) as HTMLInputElement | null;
    if (!element) {
        throw new Error(`Failed to get the element of "${setting}".`);
    }
    const value = element.checked;
    checkChanged(setting, value);
    return value;
};

const getTextbox = (setting: string) => {
    const element = $(`#${setting}`);
    if (!element) {
        throw new Error(`Failed to get the element of "${setting}".`);
    }
    let value = element.val();
    if (!value) {
        throw new Error(`Failed to get the value of element "${setting}".`);
    }
    if (typeof value !== 'string') {
        throw new Error(`The value of element "${setting}" is not a string.`);
    }
    value = value.trim(); // Trim leading and trailing whitespace
    checkChanged(setting, value);
    return value;
};

const checkChanged = (setting: string, value: boolean | string) => {
    // If we are creating a new kind of table than the last one one,
    // update our local variables and then send the new setting to the server
    if (value !== globals.settings.get(setting)) {
        globals.settings.set(setting, value);
        globals.conn.send('setting', {
            name: setting,
            value: value.toString(), // The server expects all settings as strings
        });
    }
};

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
export const ready = () => {
    // Fill in the "Name" box
    if (globals.username.startsWith('test')) {
        $('#createTableName').val('test game');
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
    for (const [key, value] of globals.settings) {
        const element = $(`#${key}`);
        if (key === 'createTableVariant') {
            if (typeof value !== 'string') {
                throw new Error('The "createTableVariant" value of "globals.settings" is not a string.');
            }

            // Validate the variant name that we got from the server
            let variant = value;
            const variantNames = Array.from(VARIANTS.keys());
            if (!variantNames.includes(variant)) {
                variant = 'No Variant';
                globals.settings.set('createTableVariant', 'No Variant');
            }

            // Fill in the "fake" select box with the variant
            element.empty();
            element.append($('<option/>', {
                value: variant,
                text: variant,
            }));
            element.val(variant);
        } else if (typeof value === 'boolean') {
            // Checkboxes
            element.prop('checked', value);
            element.change();
        } else {
            // Input fields
            element.val(value);
        }
    }

    // Fill in the "Password" box
    // (this is not stored on the server so we have to retrieve the last password from a cookie)
    const password = localStorage.getItem('createTablePassword');
    if (password) {
        $('#createTablePassword').val(password);
    }
};
