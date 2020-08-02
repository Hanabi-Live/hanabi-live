// The "Create Game" nav button

import { FADE_TIME, SHUTDOWN_TIMEOUT } from '../constants';
import * as debug from '../debug';
import { VARIANTS } from '../game/data/gameData';
import { DEFAULT_VARIANT_NAME } from '../game/types/constants';
import globals from '../globals';
import {
  isEmpty,
  getRandomNumber,
  closeAllTooltips,
  isKeyOf,
} from '../misc';
import * as modals from '../modals';
import Settings from './types/Settings';

// Constants
const basicVariants = [
  'No Variant',
  '6 Suits',
  'Black (6 Suits)',
  'Rainbow (6 Suits)',
];
const variantNames = Array.from(VARIANTS.keys());

// Local variables
let dropdown1: JQuery<Element>;
let dropdown2: JQuery<Element>;

export const init = () => {
  dropdown1 = $('#create-game-variant-dropdown1');
  dropdown2 = $('#create-game-variant-dropdown2');

  firstVariantDropdownInit();
  secondVariantDropdownInit();

  // The "dice" button will select a random variant from the list
  $('#dice').on('click', () => {
    const randomVariantIndex = getRandomNumber(0, variantNames.length - 1);
    const randomVariant = variantNames[randomVariantIndex];
    $('#createTableVariant').text(randomVariant);
    dropdown2.val(randomVariant);
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

    // Remember the new setting
    getCheckbox('createTableTimed');
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

    // Remember the new setting
    getCheckbox('createTableSpeedrun');
  });

  // The "Show Extra Options" button
  $('#create-game-show-extra-options').click(() => {
    $('#create-game-extra-options').show();
    $('#create-game-show-extra-options-row').hide();

    // Redraw the tooltip so that the new elements will fit better
    $('#nav-buttons-games-create-game').tooltipster('reposition');
  });

  // Disable some checkboxes if a checkbox is checked
  $('#createTableOneExtraCard').change(() => {
    if ($('#createTableOneExtraCard').is(':checked')) {
      $('#createTableOneLessCardRow').fadeTo(0, 0.3);
      $('#createTableOneLessCard').prop('disabled', true);
      $('#createTableOneLessCardLabel').css('cursor', 'auto');
    } else {
      $('#createTableOneLessCardRow').fadeTo(0, 1);
      $('#createTableOneLessCard').prop('disabled', false);
      $('#createTableOneLessCardLabel').css('cursor', 'pointer');
    }

    // Remember the new setting
    getCheckbox('createTableOneLessCard');
  });
  $('#createTableOneLessCard').change(() => {
    if ($('#createTableOneLessCard').is(':checked')) {
      $('#createTableOneExtraCardRow').fadeTo(0, 0.3);
      $('#createTableOneExtraCard').prop('disabled', true);
      $('#createTableOneExtraCardLabel').css('cursor', 'auto');
    } else {
      $('#createTableOneExtraCardRow').fadeTo(0, 1);
      $('#createTableOneExtraCard').prop('disabled', false);
      $('#createTableOneExtraCardLabel').css('cursor', 'pointer');
    }

    // Remember the new setting
    getCheckbox('createTableOneLessCard');
  });

  // Check for changes in the various input fields so that we can remember their respective settings
  $('#create-game-variant-dropdown1').change(() => {
    getVariant('createTableVariant');
  });
  $('#create-game-variant-dropdown2').change(() => {
    getVariant('createTableVariant');
  });
  $('#createTableTimeBaseMinutes').change(() => {
    getTextbox('createTableTimeBaseMinutes');
  });
  $('#createTableTimePerTurnSeconds').change(() => {
    getTextbox('createTableTimePerTurnSeconds');
  });
  $('#createTableCardCycle').change(() => {
    getCheckbox('createTableCardCycle');
  });
  $('#createTableDeckPlays').change(() => {
    getCheckbox('createTableDeckPlays');
  });
  $('#createTableEmptyClues').change(() => {
    getCheckbox('createTableEmptyClues');
  });
  $('#createTableAllOrNothing').change(() => {
    getCheckbox('createTableAllOrNothing');
  });
  $('#createTableDetrimentalCharacters').change(() => {
    getCheckbox('createTableDetrimentalCharacters');
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

// The website offers over 1000+ variants
// To prevent confusion, only show the basic variants to the user by default
// They can select "Search custom variants..." if they want access to the "full" dropdown
//
// "createTableVariant" is a hidden element that contains the value of the chosen element
// "create-game-variant-dropdown1" contains the the basic variants
// "create-game-variant-dropdown2" is the full (datalist) dropdown
const firstVariantDropdownInit = () => {
  // Initialize the 1st variant dropdown with the basic variants
  for (const variant of basicVariants) {
    // As a sanity check, ensure that this variant actually exists in the variants JSON
    if (!variantNames.includes(variant)) {
      throw new Error(`The "basic" variant of "${variant}" does not exist in the "variants.json" file.`);
    }

    const option = new Option(variant, variant);
    dropdown1.append(option);
  }
  const spacing = new Option('───────────────');
  spacing.disabled = true;
  dropdown1.append(spacing);
  const searchText = 'Search custom variants...';
  const loadCustom = new Option(searchText);
  dropdown1.append(loadCustom);

  // Specify functionality when the user selects an option from this dropdown
  dropdown1.change(() => {
    let selection = dropdown1.val();
    if (typeof selection !== 'string') {
      selection = 'No Variant';
    }

    if (selection === searchText) {
      dropdown1.hide();
      dropdown2.show();
      dropdown2.val('');
      dropdown2.focus();
      $('#create-game-variant-dropdown2-icon').show();
      $('#dice').show();
    } else {
      // Update the hidden field with what the user selected
      $('#createTableVariant').text(selection);
    }
  });
};

const secondVariantDropdownInit = () => {
  // Populate the full datalist/dropdown in the "Create Game" tooltip
  for (const variantName of VARIANTS.keys()) {
    const option = new Option(variantName, variantName);
    $('#create-game-variant-dropdown2-list').append($(option));
  }

  dropdown2.on('input', () => {
    // Get what they are searching for
    let search = dropdown2.val();
    if (typeof search === 'number') {
      search = search.toString();
    }
    if (typeof search !== 'string') {
      search = 'No Variant';
    }

    // Update the hidden field with what the user selected
    $('#createTableVariant').text(search);

    // If they chose a basic variant, revert back to the basic dropdown
    if (basicVariants.includes(search)) {
      dropdown1.show();
      dropdown1.val(search);
      dropdown2.hide();
      $('#create-game-variant-dropdown2-icon').hide();
      $('#dice').hide();
    }
  });
};

const submit = () => {
  // We need to mutate some values before sending them to the server
  const timeBaseMinutes = parseFloat(getTextbox('createTableTimeBaseMinutes'));
  const timeBase = Math.round(timeBaseMinutes * 60); // The server expects this in seconds
  const timePerTurnSeconds = getTextbox('createTableTimePerTurnSeconds');
  const timePerTurn = parseInt(timePerTurnSeconds, 10); // The server expects this in seconds

  // All "Create Game" settings are stored on the server with the exception of passwords;
  // passwords are stored locally as cookies
  const password = $('#createTablePassword').val();
  if (typeof password !== 'string') {
    throw new Error('The value of the "createTablePassword" element was not a string.');
  }
  localStorage.setItem('createTablePassword', password);

  globals.conn!.send('tableCreate', {
    name: $('#createTableName').val(), // We don't bother to store the table name
    options: {
      variantName: getVariant('createTableVariant'), // This is a hidden span field
      timed: getCheckbox('createTableTimed'),
      timeBase,
      timePerTurn,
      speedrun: getCheckbox('createTableSpeedrun'),
      cardCycle: getCheckbox('createTableCardCycle'),
      deckPlays: getCheckbox('createTableDeckPlays'),
      emptyClues: getCheckbox('createTableEmptyClues'),
      oneExtraCard: getCheckbox('createTableOneExtraCard'),
      oneLessCard: getCheckbox('createTableOneLessCard'),
      allOrNothing: getCheckbox('createTableAllOrNothing'),
      detrimentalCharacters: getCheckbox('createTableDetrimentalCharacters'),
    },
    password,
  });

  closeAllTooltips();
  $('#nav-buttons-games-create-game').addClass('disabled');
};

const getCheckbox = (setting: keyof Settings) => {
  const element = document.getElementById(setting) as HTMLInputElement | null;
  if (!element) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  const value = element.checked;
  checkChanged(setting, value);
  return value;
};

const getTextbox = (setting: keyof Settings) => {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  let value = element.val();
  if (isEmpty(value)) {
    throw new Error(`Failed to get the value of element "${setting}".`);
  }
  if (typeof value !== 'string') {
    throw new Error(`The value of element "${setting}" is not a string.`);
  }
  value = value.trim(); // Trim leading and trailing whitespace
  checkChanged(setting, value);
  return value;
};

const getVariant = (setting: keyof Settings) => {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  let value = element.text();
  value = value.trim(); // Trim leading and trailing whitespace
  if (value === '') {
    value = 'No Variant';
  }
  checkChanged(setting, value);
  return value;
};

const checkChanged = (settingName: keyof Settings, value: boolean | string) => {
  if (!isKeyOf(settingName, globals.settings)) {
    throw new Error(`The setting of ${settingName} does not exist in the Settings class.`);
  }

  if (value !== globals.settings[settingName]) {
    // We must cast the settings to any since this assignment violates type safety
    (globals.settings[settingName] as any) = value;
    globals.conn!.send('setting', {
      name: settingName,
      setting: value.toString(), // The server expects the value of all settings as strings
    });
  }
};

// This function is executed every time the "Create Game" button is clicked
// (before the tooltip is added to the DOM)
export const before = () => {
  // Don't allow the tooltip to open if the button is currently disabled
  if ($('#nav-buttons-games-create-game').hasClass('disabled')) {
    return false;
  }

  if (globals.shuttingDown) {
    const now = new Date().getTime();
    const elapsedTime = now - globals.datetimeShutdownInit;
    // SHUTDOWN_TIMEOUT is in minutes
    const shutdownTimeoutMilliseconds = SHUTDOWN_TIMEOUT * 60 * 1000;
    const timeLeft = shutdownTimeoutMilliseconds - elapsedTime;
    const minutesLeft = new Date(timeLeft).getMinutes();
    if (minutesLeft <= 5) {
      let msg = 'The server is shutting down ';
      if (minutesLeft <= 0) {
        msg += 'momentarily';
      } else if (minutesLeft === 1) {
        msg += 'in 1 minute';
      } else {
        msg += `in ${minutesLeft} minutes`;
      }
      msg += '. You cannot start any new games for the time being.';
      modals.warningShow(msg);
      return false;
    }
  }

  if (globals.maintenanceMode) {
    modals.warningShow('The server is currently in maintenance mode. You cannot start any new games for the time being.');
    return false;
  }

  $('#lobby').fadeTo(FADE_TIME, 0.4);

  return true;
};

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
export const ready = () => {
  // Fill in the "Name" box
  if (debug.amTestUser(globals.username)) {
    $('#createTableName').val('test game');
  } else {
    $('#createTableName').val(globals.randomName);

    // Get a new random name from the server for the next time we click the button
    globals.conn!.send('getName');
  }

  // Focus the "Name" box
  // (this has to be in a callback in order to work)
  setTimeout(() => {
    $('#createTableName').focus();
  }, 0);

  // Fill in the rest of form with the settings that we used last time
  // (which is stored on the server)
  for (const [key, value] of Object.entries(globals.settings)) {
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
  if (password !== null && password !== '') {
    $('#createTablePassword').val(password);
  }

  // Hide the extra options if we do not have any selected
  if (
    !globals.settings.createTableSpeedrun
    && !globals.settings.createTableCardCycle
    && !globals.settings.createTableDeckPlays
    && !globals.settings.createTableEmptyClues
    && !globals.settings.createTableOneExtraCard
    && !globals.settings.createTableOneLessCard
    && !globals.settings.createTableAllOrNothing
    && !globals.settings.createTableDetrimentalCharacters
  ) {
    $('#create-game-extra-options').hide();
    $('#create-game-show-extra-options-row').show();
  } else {
    $('#create-game-extra-options').show();
    $('#create-game-show-extra-options-row').hide();
  }

  // Redraw the tooltip so that the new elements will fit better
  $('#nav-buttons-games-create-game').tooltipster('reposition');
};

const readyVariant = (value: any) => {
  // Validate the variant name that we got from the server
  let variant = DEFAULT_VARIANT_NAME;
  if (typeof value !== 'string' || !variantNames.includes(value)) {
    globals.settings.createTableVariant = variant;
  } else {
    variant = value;
  }

  // Update the hidden field
  $('#createTableVariant').text(variant);

  if (basicVariants.includes(variant)) {
    // If this is one of the basic variants, set it in the first dropdown
    dropdown1.show();
    dropdown1.val(variant);
    dropdown2.hide();
    $('#create-game-variant-dropdown2-icon').hide();
    $('#dice').hide();
  } else {
    // If this is not one of the basic variants, set it in the second dropdown
    dropdown1.hide();
    dropdown2.show();
    dropdown2.val(variant);
    $('#create-game-variant-dropdown2-icon').show();
    $('#dice').show();
  }
};
