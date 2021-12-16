// The "Create Game" nav button

import * as KeyCode from "keycode-js";
import { SHUTDOWN_TIMEOUT } from "../constants";
import * as debug from "../debug";
import { VARIANTS } from "../game/data/gameData";
import { DEFAULT_VARIANT_NAME } from "../game/types/constants";
import globals from "../globals";
import { getRandomNumber, isEmpty, parseIntSafe } from "../misc";
import * as modals from "../modals";
import * as tooltips from "../tooltips";
import Options from "../types/Options";
import Screen from "./types/Screen";
import Settings from "./types/Settings";

// Constants
const basicVariants = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
];
const variantNames = Array.from(VARIANTS.keys());

// Local variables
let dropdown1: JQuery<Element>;
let dropdown2: JQuery<Element>;

export function init(): void {
  dropdown1 = $("#create-game-variant-dropdown1");
  dropdown2 = $("#create-game-variant-dropdown2");

  firstVariantDropdownInit();
  secondVariantDropdownInit();

  // The "dice" button will select a random variant from the list
  $("#dice").on("click", () => {
    const randomVariantIndex = getRandomNumber(0, variantNames.length - 1);
    const randomVariant = variantNames[randomVariantIndex];
    $("#createTableVariant").text(randomVariant);
    dropdown2.val(randomVariant);
  });

  // Make the extra time fields appear and disappear depending on whether the checkbox is checked
  $("#createTableTimed").change(() => {
    if ($("#createTableTimed").prop("checked")) {
      $("#create-game-timed-option-1").show();
      $("#create-game-timed-option-2").show();
      $("#create-game-timed-option-3").show();
      $("#create-game-timed-option-4").show();
    } else {
      $("#create-game-timed-option-1").hide();
      $("#create-game-timed-option-2").hide();
      $("#create-game-timed-option-3").hide();
      $("#create-game-timed-option-4").hide();
    }

    // Remember the new setting
    getCheckbox("createTableTimed");
  });

  $("#createTableSpeedrun").change(() => {
    if ($("#createTableSpeedrun").prop("checked")) {
      $("#create-game-timed-row").hide();
      $("#create-game-timed-row-spacing").hide();
    } else {
      $("#create-game-timed-row").show();
      $("#create-game-timed-row-spacing").show();
    }

    // Redraw the tooltip so that the new elements will fit better
    tooltips.reposition("#nav-buttons-lobby-create-game");
    tooltips.reposition("#nav-buttons-pregame-change-options");

    // Remember the new setting
    getCheckbox("createTableSpeedrun");
  });

  // The "Show Extra Options" button
  $("#create-game-show-extra-options").click(() => {
    $("#create-game-extra-options").show();
    $("#create-game-show-extra-options-row").hide();

    // Redraw the tooltip so that the new elements will fit better
    tooltips.reposition("#nav-buttons-lobby-create-game");
    tooltips.reposition("#nav-buttons-pregame-change-options");
  });

  // Disable some checkboxes if a checkbox is checked
  $("#createTableOneExtraCard").change(() => {
    if ($("#createTableOneExtraCard").is(":checked")) {
      $("#createTableOneLessCardRow").fadeTo(0, 0.3);
      $("#createTableOneLessCard").prop("disabled", true);
      $("#createTableOneLessCardLabel").css("cursor", "auto");
    } else {
      $("#createTableOneLessCardRow").fadeTo(0, 1);
      $("#createTableOneLessCard").prop("disabled", false);
      $("#createTableOneLessCardLabel").css("cursor", "pointer");
    }

    // Remember the new setting
    getCheckbox("createTableOneLessCard");
  });

  $("#createTableOneLessCard").change(() => {
    if ($("#createTableOneLessCard").is(":checked")) {
      $("#createTableOneExtraCardRow").fadeTo(0, 0.3);
      $("#createTableOneExtraCard").prop("disabled", true);
      $("#createTableOneExtraCardLabel").css("cursor", "auto");
    } else {
      $("#createTableOneExtraCardRow").fadeTo(0, 1);
      $("#createTableOneExtraCard").prop("disabled", false);
      $("#createTableOneExtraCardLabel").css("cursor", "pointer");
    }

    // Remember the new setting
    getCheckbox("createTableOneLessCard");
  });

  // Check for changes in the various input fields so that we can remember their respective settings
  $("#create-game-variant-dropdown1").change(() => {
    getVariant("createTableVariant");
  });
  $("#create-game-variant-dropdown2").change(() => {
    getVariant("createTableVariant");
  });
  $("#createTableTimeBaseMinutes").change(() => {
    getTextboxForTimeBase("createTableTimeBaseMinutes");
  });
  $("#createTableTimePerTurnSeconds").change(() => {
    getTextboxForTimePerTurn("createTableTimePerTurnSeconds");
  });
  $("#createTableCardCycle").change(() => {
    getCheckbox("createTableCardCycle");
  });
  $("#createTableDeckPlays").change(() => {
    getCheckbox("createTableDeckPlays");
  });
  $("#createTableEmptyClues").change(() => {
    getCheckbox("createTableEmptyClues");
  });
  $("#createTableAllOrNothing").change(() => {
    getCheckbox("createTableAllOrNothing");
  });
  $("#createTableDetrimentalCharacters").change(() => {
    getCheckbox("createTableDetrimentalCharacters");
  });

  // Pressing enter anywhere will submit the form
  $("#create-game-tooltip").on("keypress", (event) => {
    if (event.which === KeyCode.KEY_RETURN) {
      event.preventDefault();
      $("#create-game-submit").click();
    }
  });

  $("#create-game-submit").on("click", submit);

  // Add delegate handler for new options buttons
  $("#lobby-chat-pregame-text").on("click", "button.new-options", (e) => {
    const data = String($(e.target).data("new-options"));
    const reg = new RegExp("'", "g");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const options: Options = JSON.parse(data.replace(reg, '"'));
    acceptOptionsFromGuest(options);
    $(e.target).text("sent").prop("disabled", true);
  });
}

// The website offers over 1000+ variants
// To prevent confusion, only show the basic variants to the user by default
// They can select "Search custom variants..." if they want access to the "full" dropdown
//
// "createTableVariant" is a hidden element that contains the value of the chosen element
// "create-game-variant-dropdown1" contains the basic variants
// "create-game-variant-dropdown2" is the full (datalist) dropdown
function firstVariantDropdownInit() {
  // Initialize the 1st variant dropdown with the basic variants
  for (const variantName of basicVariants) {
    // As a sanity check, ensure that this variant actually exists in the variants JSON
    if (VARIANTS.get(variantName) === undefined) {
      throw new Error(
        `The "basic" variant of "${variantName}" does not exist in the "variants.json" file.`,
      );
    }

    const option = new Option(variantName, variantName);
    dropdown1.append(option);
  }
  const spacing = new Option("───────────────");
  spacing.disabled = true;
  dropdown1.append(spacing);
  const searchText = "Search custom variants...";
  const loadCustom = new Option(searchText);
  dropdown1.append(loadCustom);

  // Specify functionality when the user selects an option from this dropdown
  dropdown1.change(() => {
    let selection = dropdown1.val();
    if (typeof selection !== "string") {
      selection = "No Variant";
    }

    if (selection === searchText) {
      dropdown1.hide();
      dropdown2.show();
      dropdown2.val("");
      dropdown2.trigger("focus");
      $("#create-game-variant-dropdown2-icon").show();
      $("#dice").show();
    } else {
      // Update the hidden field with what the user selected
      $("#createTableVariant").text(selection);
    }
  });
}

function secondVariantDropdownInit() {
  // Populate the full datalist/dropdown in the "Create Game" tooltip
  for (const variantName of VARIANTS.keys()) {
    const option = new Option(variantName, variantName);
    $("#create-game-variant-dropdown2-list").append($(option));
  }

  dropdown2.on("input", () => {
    // Get what they are searching for
    let search = dropdown2.val();
    if (typeof search === "number") {
      search = search.toString();
    }
    if (typeof search !== "string") {
      search = "No Variant";
    }

    // Update the hidden field with what the user selected
    $("#createTableVariant").text(search);

    // If they chose a basic variant, revert back to the basic dropdown
    if (basicVariants.includes(search)) {
      dropdown1.show();
      dropdown1.val(search);
      dropdown2.hide();
      $("#create-game-variant-dropdown2-icon").hide();
      $("#dice").hide();
    }
  });
}

function submit() {
  // Check the data attribute of the submit button to see
  // if this is a new game or a change of options
  const isNew = $("#create-game-table-number").val() === "";

  // Get timer values
  const timed = getCheckbox("createTableTimed");
  let timeBaseSeconds = 0;
  let timePerTurn = 0;

  // Try getting the user's values
  // If they are invalid, leave the dialog open
  if (timed) {
    let timeValue: number;
    let foundErrors = false;

    try {
      timeValue = getTextboxForTimeBase("createTableTimeBaseMinutes");
      timeBaseSeconds = Math.round(timeValue * 60);
    } catch (err) {
      // Invalid value, inform the UI and do not close the tooltip
      $("#createTableTimeBaseMinutes").addClass("wrongInput");
      foundErrors = true;
    }

    try {
      timePerTurn = getTextboxForTimePerTurn("createTableTimePerTurnSeconds");
    } catch (err) {
      // Invalid value, inform the UI and do not close the tooltip
      $("#createTableTimePerTurnSeconds").addClass("wrongInput");
      foundErrors = true;
    }

    if (foundErrors) {
      return;
    }
  }

  // Table names are not saved
  const name = $("#createTableName").val();

  // Passwords are not stored on the server; instead, they are stored locally as cookies
  const password = $("#createTablePassword").val();
  if (isNew) {
    if (typeof password !== "string") {
      throw new Error(
        'The value of the "createTablePassword" element was not a string.',
      );
    }
    localStorage.setItem("createTablePassword", password);
  }

  // Max players must be a number between 2 and 6. Default to 5 if validation fails
  let maxPlayers = Number($("#createTableMaxPlayers").val());
  if (maxPlayers < 2 || maxPlayers > 6) {
    maxPlayers = 5;
  }

  // Game JSON is not saved
  const gameJSONString = $("#createTableJSON").val();
  if (typeof gameJSONString !== "string") {
    throw new Error(
      'The value of the "createTableJSON" element is not a string.',
    );
  }
  let gameJSON: unknown | undefined;
  if (gameJSONString !== "") {
    try {
      gameJSON = JSON.parse(gameJSONString) as unknown;
    } catch (err) {
      modals.showError("That is not a valid JSON object.");
      return;
    }
    if (typeof gameJSON !== "object") {
      modals.showError("That is not a valid JSON object.");
      return;
    }
  }

  const options = {
    variantName: getVariant("createTableVariant"), // This is a hidden span field
    timed,
    timeBase: timeBaseSeconds,
    timePerTurn,
    speedrun: getCheckbox("createTableSpeedrun"),
    cardCycle: getCheckbox("createTableCardCycle"),
    deckPlays: getCheckbox("createTableDeckPlays"),
    emptyClues: getCheckbox("createTableEmptyClues"),
    oneExtraCard: getCheckbox("createTableOneExtraCard"),
    oneLessCard: getCheckbox("createTableOneLessCard"),
    allOrNothing: getCheckbox("createTableAllOrNothing"),
    detrimentalCharacters: getCheckbox("createTableDetrimentalCharacters"),
  };

  if (isNew) {
    globals.conn!.send("tableCreate", {
      name,
      options,
      password,
      gameJSON,
      maxPlayers,
    });
    $("#nav-buttons-lobby-create-game").addClass("disabled");
  } else {
    globals.conn!.send("tableUpdate", {
      tableID: globals.tableID,
      name,
      options,
    });
  }

  // Remove error indications
  $("#createTableTimeBaseMinutes").removeClass("wrongInput");
  $("#createTableTimePerTurnSeconds").removeClass("wrongInput");

  modals.closeModals();
}

function acceptOptionsFromGuest(options: Options) {
  const name = options.tableName;

  globals.conn!.send("tableUpdate", {
    tableID: globals.tableID,
    name,
    options,
  });
}

function getCheckbox(setting: keyof Settings) {
  const element = document.getElementById(setting) as HTMLInputElement | null;
  if (element === null) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  const value = element.checked;
  checkChanged(setting, value);
  return value;
}

function getTextbox(setting: keyof Settings) {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  const value = element.val();
  if (isEmpty(value)) {
    throw new Error(`Failed to get the value of element "${setting}".`);
  }
  if (typeof value !== "string") {
    throw new Error(`The value of element "${setting}" is not a string.`);
  }
  return value.trim(); // Remove all leading and trailing whitespace
}

function getTextboxForTimePerTurn(setting: keyof Settings) {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }

  const valueString = getTextbox(setting);
  let value = parseIntSafe(valueString);
  if (Number.isNaN(value)) {
    // They have entered an invalid amount of seconds, so revert to using the default value
    value = 20;

    // Also change the value of the actual element on the page
    element.val(value.toString());
  }

  checkChanged(setting, value);
  return value;
}

function getTextboxForTimeBase(setting: keyof Settings) {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }

  const valueString = getTextbox(setting);
  let value = Number(valueString); // This can be a float
  if (Number.isNaN(value)) {
    // They have entered an invalid amount of minutes, so revert to using the default value
    value = 2;

    // Also change the value of the actual element on the page
    element.val(value.toString());
  }

  checkChanged(setting, value);
  return value;
}

function getVariant(setting: keyof Settings) {
  const element = $(`#${setting}`);
  if (element === undefined) {
    throw new Error(`Failed to get the element of "${setting}".`);
  }
  let value = element.text();
  value = value.trim(); // Remove all leading and trailing whitespace
  if (value === "") {
    value = "No Variant";
  }
  checkChanged(setting, value);
  return value;
}

export function checkChanged(
  settingName: keyof Settings,
  value: boolean | string | number,
): void {
  if (value !== globals.settings[settingName]) {
    // We must cast the settings to any since this assignment violates type safety
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globals.settings[settingName] as any) = value;
    globals.conn!.send("setting", {
      name: settingName,
      setting: value.toString(), // The server expects the value of all settings as strings
    });
  }
}

// This function is executed every time the "Create Game" button is clicked
// (before the tooltip is added to the DOM)
export function before(): boolean {
  if (globals.shuttingDown) {
    const now = new Date();
    const elapsedTimeMilliseconds =
      now.getTime() - globals.datetimeShutdownInit.getTime();
    // SHUTDOWN_TIMEOUT is in minutes
    const shutdownTimeoutMilliseconds = SHUTDOWN_TIMEOUT * 60 * 1000;
    const millisecondsLeft =
      shutdownTimeoutMilliseconds - elapsedTimeMilliseconds;
    const minutesLeft = new Date(millisecondsLeft).getMinutes();
    if (minutesLeft <= 5) {
      let msg = "The server is shutting down ";
      if (minutesLeft <= 0) {
        msg += "momentarily";
      } else if (minutesLeft === 1) {
        msg += "in 1 minute";
      } else {
        msg += `in ${minutesLeft} minutes`;
      }
      msg += ". You cannot start any new games for the time being.";
      modals.showWarning(msg);
      return false;
    }
  }

  if (globals.maintenanceMode) {
    modals.showWarning(
      "The server is currently in maintenance mode. You cannot start any new games for the time being.",
    );
    return false;
  }

  return true;
}

// This function is executed every time the "Create Game" button is clicked
// (after the tooltip is added to the DOM)
export function ready(): void {
  // Change the UI if we are in a pre-game screen
  let dialogTitle = "Create a New Game";
  let buttonTitle = "Create";
  let gameName = "";
  let dialogOptions = null;

  if (globals.game === null || globals.currentScreen === Screen.Lobby) {
    // Create New Game
    if (debug.amTestUser(globals.username)) {
      gameName = "test game";
    } else {
      gameName = globals.randomTableName;

      // Get a new random name from the server for the next time we click the button
      globals.conn!.send("getName");
    }
    dialogOptions = globals.settings;

    // Show the password row
    $("#password-row").removeClass("hidden");

    // Ensure create-game-table-number is empty
    $("#create-game-table-number").val("");

    // Show JSON row
    $("#create-game-json-row").removeClass("hidden");
  } else {
    // Change Options
    dialogTitle = "Change Game Options";
    buttonTitle = "Change";
    gameName = globals.game.name;
    dialogOptions = globals.game.options;

    // Can't change the password once the game is created
    $("#password-row").addClass("hidden");

    // Ensure create-game-table-number has a value
    $("#create-game-table-number").val(globals.tableID);

    // Hide JSON row
    $("#create-game-json-row").addClass("hidden");
  }

  // Set UI Elements and values
  $("#create-game-modal-title").text(dialogTitle);
  $("#create-game-submit").text(buttonTitle);
  $("#createTableName").val(gameName);

  // Fill in the rest of form with the settings that we used last time
  // (which is stored on the server)
  for (const [key, value] of Object.entries(dialogOptions)) {
    const element = $(`#${key}`);
    if (key === "createTableVariant") {
      // Setting the variant dropdown is a special case;
      // it is more complicated than simply filling in the value with what we used last time
      readyVariant(value);
    } else if (typeof value === "boolean") {
      // Checkboxes
      element.prop("checked", value);
      element.change();
    } else {
      // Input fields and text fields
      element.val(value);
    }
  }

  // Fill in the "Password" box
  // (this is not stored on the server so we have to retrieve the last password from a cookie)
  const password = localStorage.getItem("createTablePassword");
  if (password !== null && password !== "") {
    $("#createTablePassword").val(password);
  }

  const maxPlayers = localStorage.getItem("createTableMaxPlayers");
  let max = 5;
  if (maxPlayers !== null) {
    max = parseIntSafe(maxPlayers);
    if (Number.isNaN(max) || max < 2 || max > 6) {
      max = 5;
    }
  }
  $("#createTableMaxPlayers").val(max);

  // Hide the extra options if we do not have any selected
  if (
    !globals.settings.createTableSpeedrun &&
    !globals.settings.createTableCardCycle &&
    !globals.settings.createTableDeckPlays &&
    !globals.settings.createTableEmptyClues &&
    !globals.settings.createTableOneExtraCard &&
    !globals.settings.createTableOneLessCard &&
    !globals.settings.createTableAllOrNothing &&
    !globals.settings.createTableDetrimentalCharacters
  ) {
    $("#create-game-extra-options").hide();
    $("#create-game-show-extra-options-row").show();
  } else {
    $("#create-game-extra-options").show();
    $("#create-game-show-extra-options-row").hide();
  }

  // Hide the JSON field if we are not in a development environment
  if (window.location.hostname !== "localhost") {
    $("#create-game-json-row").hide();
  }
}

function readyVariant(value: string) {
  // Validate the variant name that we got from the server
  let variant: string;
  if (VARIANTS.get(value) === undefined) {
    variant = DEFAULT_VARIANT_NAME;
    globals.settings.createTableVariant = variant;
  } else {
    variant = value;
  }

  // Update the hidden field
  $("#createTableVariant").text(variant);

  if (basicVariants.includes(variant)) {
    // If this is one of the basic variants, set it in the first dropdown
    dropdown1.show();
    dropdown1.val(variant);
    dropdown2.hide();
    $("#create-game-variant-dropdown2-icon").hide();
    $("#dice").hide();
  } else {
    // If this is not one of the basic variants, set it in the second dropdown
    dropdown1.hide();
    dropdown2.show();
    dropdown2.val(variant);
    $("#create-game-variant-dropdown2-icon").show();
    $("#dice").show();
  }
}
