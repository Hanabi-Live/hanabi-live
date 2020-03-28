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

// Constants
const basicVariants = [
    'No Variant',
    '6 Suits',
    'Black (6 Suits)',
    'Rainbow (6 Suits)',
];
const variantNames = Array.from(VARIANTS.keys());
const dropdown1 = $('#create-game-variant-dropdown1');
const dropdown2 = $('#create-game-variant-dropdown2');

// Pre-prepare the variant names in the format that the Slim Select dropdown expects
const slimSelectData: Array<any> = [];
const line = '──────────────';
for (const [variantName, variantJSON] of Object.entries(variantsJSON) as any) {
    slimSelectData.push({
        text: variantName,
        selected: false,
    });

    if (variantJSON.spacing) {
        slimSelectData.push({
            text: line,
            disabled: true,
            selected: false,
        });
    }
}

// Local variables
let slimSelect: SlimSelect;

export const init = () => {
    firstVariantDropdownInit();

    // The "dice" button will select a random variant from the list
    $('#dice').on('click', () => {
        const randomVariantIndex = misc.getRandomNumber(0, variantNames.length - 1);
        const randomVariant = variantNames[randomVariantIndex];
        $('#createTableVariant').text(randomVariant);
        slimSelect.setData([{ text: randomVariant }]);
    });

    // Make the extra time fields appear and disappear depending on whether the checkbox is checked
    $('#createTableTimed').change(() => {
        if ($('#createTableTimed').prop('checked')) {
            $('#create-game-timed-label').removeClass('col-3');
            $('#create-game-timed-label').addClass('col-2');
            $('#create-game-timed-option-1').show(0);
            $('#create-game-timed-option-2').show(0);
            $('#create-game-timed-option-3').show(0);
            $('#create-game-timed-option-4').show(0);
        } else {
            $('#create-game-timed-label').addClass('col-3');
            $('#create-game-timed-label').removeClass('col-2');
            $('#create-game-timed-option-1').hide(0);
            $('#create-game-timed-option-2').hide(0);
            $('#create-game-timed-option-3').hide(0);
            $('#create-game-timed-option-4').hide(0);
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });
    $('#createTableSpeedrun').change(() => {
        if ($('#createTableSpeedrun').prop('checked')) {
            $('#create-game-timed-row').hide(0);
            $('#create-game-timed-row-spacing').hide(0);
        } else {
            $('#create-game-timed-row').show(0);
            $('#create-game-timed-row-spacing').show(0);
        }

        // Redraw the tooltip so that the new elements will fit better
        $('#nav-buttons-games-create-game').tooltipster('reposition');
    });

    // Pressing enter anywhere will submit the form
    $('#create-game-tooltip').on('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            $('#create-game-submit').click();
        }
    });

    $('#create-game-submit').on('click', submit);
};

/*
    In the create game tooltip, the user can select a variant in a dropdown that contains all 1000+
    variants. Unfortunately, having so many div elements causes the DOM to lag every time the
    tooltip is opened. Thus, by default we show a variant dropdown with the basic variants in it. We
    only populate + show the "full" variant dropdown if they select "Load custom variants..." from
    the basic dropdown.

    "createTableVariant" is a hidden element that contains the value of the chosen element
    "create-game-variant-dropdown1" contains the the basic variants
    "create-game-variant-dropdown2" is the full (Slim Select) dropdown
*/
const firstVariantDropdownInit = () => {
    // Initialize the 1st variant dropdown with the basic variants
    for (const variant of basicVariants) {
        const option = new Option(variant, variant);
        dropdown1.append(option);
    }
    const spacing = new Option('──────────────');
    spacing.disabled = true;
    dropdown1.append(spacing);
    const loadText = 'Load custom variants...';
    const loadCustom = new Option(loadText);
    dropdown1.append(loadCustom);

    // Specify functionality when the user selects an option from this dropdown
    dropdown1.change(() => {
        let selection = dropdown1.val();
        if (typeof selection !== 'string') {
            selection = 'No Variant';
        }

        if (selection === loadText) {
            slimSelectInitWithAllVariants();
        } else {
            // Update the hidden field with what the user selected
            $('#createTableVariant').text(selection);
        }
    });
};

const slimSelectInitWithAllVariants = () => {
    // The user selected the "Load custom variants" option in the first dropdown
    dropdown1.hide(0);
    dropdown1.val('No Variant');
    const loading = $('#create-game-variant-loading');
    loading.show(0);

    // We give the browser time to render the "Loading..." element,
    // and then begin the laggy process of switching to the "full" variant dropdown
    setTimeout(() => {
        dropdown1.hide(0);
        loading.hide(0);

        // Initialize the second dropdown
        // (we must reinitialize Slim Select because using "slimSelect.setData()"
        // results in display bugs)
        // (we don't specify any data because it will be automatically populated in the
        // "slimSelectBeforeOpen()" function)
        slimSelectDestroy();
        dropdown2.show(0);
        $('#dice').show(0);
        slimSelect = new SlimSelect({
            select: '#create-game-variant-dropdown2',
            beforeOpen: slimSelectBeforeOpen,
            afterClose: slimSelectAfterClose,
        });
        slimSelect.open();
    }, 5);
};

const slimSelectInitWithOneVariant = (variant: string) => {
    dropdown1.hide(0);
    slimSelectDestroy();
    dropdown2.show(0);
    $('#dice').show(0);
    slimSelect = new SlimSelect({
        select: '#create-game-variant-dropdown2',
        data: [{ text: variant }],
        beforeOpen: slimSelectBeforeOpen,
        afterClose: slimSelectAfterClose,
    });
};

const slimSelectBeforeOpen = () => {
    // Set the default variant to be the one we already had selected
    const oldVariant = $('#createTableVariant').text();
    for (const entry of slimSelectData) {
        entry.selected = entry.text === oldVariant;
    }

    // Currently, the dropdown only has zero or one elements in it
    // Load the rest of the variants
    slimSelect.setData(slimSelectData);
};

const slimSelectAfterClose = () => {
    // Update the hidden field with what the user selected
    let variantChosen = dropdown2.val();
    if (typeof variantChosen !== 'string') {
        variantChosen = 'No Variant';
    }
    $('#createTableVariant').text(variantChosen);

    // If they chose a basic variant, revert back to the basic dropdown
    if (basicVariants.includes(variantChosen)) {
        dropdown1.show(0);
        dropdown1.val(variantChosen);
        slimSelectDestroy();
        $('#dice').hide(0);
        return;
    }

    // Otherwise, empty out the Slim Select element (except for the one variant chosen)
    // in order to reduce lag
    slimSelect.setData([{ text: variantChosen }]);
};

const slimSelectDestroy = () => {
    if (slimSelect) {
        slimSelect.destroy();
    }

    dropdown2.empty();
    dropdown2.hide(0);
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
        variant: getElement('createTableVariant'), // This is a hidden span field
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
    $('#nav-buttons-games-create-game').addClass('disabled');
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

const getElement = (setting: string) => {
    const element = $(`#${setting}`);
    if (!element) {
        throw new Error(`Failed to get the element of "${setting}".`);
    }
    let value = element.text();
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

// This function is executed when the "Create Game" button is clicked
// Don't allow the tooltip to open if the button is currently disabled
export const before = () => !$('#nav-buttons-games-create-game').hasClass('disabled');

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
            // Setting the variant dropdown is a special case;
            // it is more complicated than simply filling in the value with what we used last time
            readyVariant(value);
        } else if (typeof value === 'boolean') {
            // Checkboxes
            element.prop('checked', value);
            element.change();
        } else {
            // Input fields and text fields
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

const readyVariant = (value: any) => {
    // Validate the variant name that we got from the server
    let variant = value;
    if (typeof variant !== 'string') {
        variant = 'No Variant';
        globals.settings.set('createTableVariant', 'No Variant');
    }
    if (!variantNames.includes(variant)) {
        variant = 'No Variant';
        globals.settings.set('createTableVariant', 'No Variant');
    }

    // Update the hidden field
    $('#createTableVariant').text(variant);

    if (basicVariants.includes(variant)) {
        // If this is one of the basic variants, set it in the first dropdown
        dropdown1.show(0);
        dropdown1.val(variant);
        dropdown2.hide(0);
        $('#dice').hide();
    } else {
        // If this is not one of the basic variants,
        // initialize the second dropdown to have 1 element
        // (we must reinitialize Slim Select because using "slimSelect.setData()"
        // results in display bugs)
        slimSelectInitWithOneVariant(variant);
    }
};

// This function is executed when the tooltip is closed and removed from the DOM
export const after = () => {
    slimSelectDestroy();
};
