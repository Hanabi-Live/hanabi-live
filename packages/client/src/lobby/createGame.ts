// The "Create Game" screen, which also changes the options of an unstarted game.

import {
  DEFAULT_TABLE_NAME_SUFFIX,
  MAX_SEED_LENGTH,
  defaultSettings,
} from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_ID,
  DEFAULT_VARIANT_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  VARIANT_NAMES,
  doesVariantExist,
  doesVariantIdExist,
  getVariant,
  getVariantById,
  isValidNumPlayers,
} from "@hanabi-live/game";
import {
  ReadonlySet,
  getRandomArrayElement,
  parseIntSafe,
} from "complete-common";
import equal from "fast-deep-equal";
import type { SuggestedSettings } from "../chatKind.ts";
import { DIMMED_OPACITY, LOCAL_STORAGE_KEY } from "../constants.ts";
import { globals } from "../Globals.ts";
import { creatingTableChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { Tooltip } from "../Tooltip.ts";
import { escapeHtml, getHtmlInputElement } from "../utils.ts";
import type {
  CheckedField,
  CreateGameForm,
  CreateTable,
  ExtraOption,
} from "./createGameForm.ts";
import {
  DEFAULT_TIME_CONTROL,
  EXTRA_OPTION_NAMES,
  formFromTable,
  getErrors,
  isReplaying,
  readFormDeal,
  readTable,
  tableOptions,
} from "./createGameForm.ts";
import * as lobbyPage from "./lobbyPage.ts";
import { Screen } from "./types/Screen.ts";

const BASIC_VARIANT_NAMES = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
] as const;

const BASIC_VARIANT_NAMES_SET = new ReadonlySet<string>(BASIC_VARIANT_NAMES);

/** A text box that turns red and explains why while its value is invalid. */
interface CheckedInput {
  readonly element: HTMLInputElement;
  readonly tooltip: Tooltip;
  readonly field: CheckedField;
}

const checkedInputs: CheckedInput[] = [];

type TimeControl = NonNullable<GameOptions["timeControl"]>;

/** The clock that the form offers: the one that we chose last, or else the default one. */
function rememberedTimeControl(): TimeControl {
  return (
    globals.settings.createTable.options.timeControl ?? DEFAULT_TIME_CONTROL
  );
}

/**
 * The checkboxes under "Extra Options", by the option that each one sets. They stay collapsed
 * unless one of them is selected, a seed is entered, or a game is replayed.
 */
const EXTRA_OPTIONS = {
  speedrun: "#createTableSpeedrun",
  deckPlays: "#createTableDeckPlays",
  emptyClues: "#createTableEmptyClues",
  oneExtraCard: "#createTableOneExtraCard",
  oneLessCard: "#createTableOneLessCard",
  allOrNothing: "#createTableAllOrNothing",
  detrimentalCharacters: "#createTableDetrimentalCharacters",
} as const satisfies Record<ExtraOption, string>;

/** The checkbox that makes the table timed. */
const TIMED = "#createTableTimed";

let dropdown1: JQuery<Element>;
let dropdown2: JQuery<Element>;

export function init(): void {
  dropdown1 = $("#create-game-variant-dropdown1");
  dropdown2 = $("#create-game-variant-dropdown2");

  $("#createTableMaxPlayers").attr({
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
    placeholder: defaultSettings.createTable.maxPlayers,
  });

  getHtmlInputElement("#create-game-seed").maxLength = MAX_SEED_LENGTH;
  addCheckedInput("#createTableTimeBaseMinutes", "timeBaseMinutes");
  addCheckedInput("#createTableTimePerTurnSeconds", "timePerTurnSeconds");
  addCheckedInput("#create-game-seed", "seed");
  addCheckedInput("#create-game-replay-game-id", "replayGameId");
  addCheckedInput("#create-game-replay-turn", "replayTurn");

  firstVariantDropdownInit();
  secondVariantDropdownInit();

  // If max players was set to an invalid value, restore it to the default when the element is
  // deselected.
  $("#createTableMaxPlayers").on("blur", () => {
    const element = $("#createTableMaxPlayers");

    const value = element.val();
    if (typeof value !== "string") {
      return;
    }

    const maxPlayers = parseIntSafe(value);
    if (
      maxPlayers === undefined
      || maxPlayers < MIN_PLAYERS
      || maxPlayers > MAX_PLAYERS
    ) {
      element.val(defaultSettings.createTable.maxPlayers);
    }
  });

  // The "dice" button will select a random variant from the list.
  $("#dice").on("click", () => {
    const randomVariant = getRandomArrayElement(VARIANT_NAMES);
    $("#createTableVariant").text(randomVariant);
    dropdown2.val(randomVariant);
  });

  // Some rows depend on a checkbox, and the time fields only apply to a timed table.
  for (const selector of [
    TIMED,
    EXTRA_OPTIONS.speedrun,
    EXTRA_OPTIONS.oneExtraCard,
    EXTRA_OPTIONS.oneLessCard,
  ]) {
    $(selector).on("change", () => {
      updateCheckboxRows();
      checkInputs();
    });
  }

  $("#create-game-show-extra-options").on("click", () => {
    const button = $("#create-game-show-extra-options");
    showExtraOptions(button.attr("aria-expanded") !== "true");
  });

  // Remember each change to the form in our settings.
  for (const selector of [
    TIMED,
    ...Object.values(EXTRA_OPTIONS),
    "#create-game-variant-dropdown1",
    "#create-game-variant-dropdown2",
    "#createTableTimeBaseMinutes",
    "#createTableTimePerTurnSeconds",
  ]) {
    $(selector).on("change", rememberForm);
  }

  $("#create-game-submit").on("click", submit);
}

/**
 * The website offers over 1000+ variants. To prevent confusion, only show the basic variants to the
 * user by default. They can select "Search custom variants" if they want access to the "full"
 * dropdown.
 *
 * - "createTableVariant" is a hidden element that contains the value of the chosen element.
 * - "create-game-variant-dropdown1" contains the basic variants.
 * - "create-game-variant-dropdown2" is the full (datalist) dropdown.
 */
function firstVariantDropdownInit() {
  // Initialize the 1st variant dropdown with the basic variants.
  for (const variantName of BASIC_VARIANT_NAMES) {
    // As a sanity check, ensure that this variant actually exists in the variants JSON.
    if (!doesVariantExist(variantName)) {
      throw new Error(
        `The "basic" variant of "${variantName}" does not exist in the "variants.json" file.`,
      );
    }

    const option = new Option(variantName, variantName);
    dropdown1.append(option);
  }
  // eslint-disable-next-line complete/require-ascii
  const spacing = new Option("───────────────");
  spacing.disabled = true;
  dropdown1.append(spacing);
  const searchText = "Search custom variants...";
  const loadCustom = new Option(searchText);
  dropdown1.append(loadCustom);

  // Specify functionality when the user selects an option from this dropdown.
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
      // Update the hidden field with what the user selected.
      $("#createTableVariant").text(selection);
    }
  });
}

function secondVariantDropdownInit() {
  // Populate the full datalist/dropdown on the "Create Game" screen.
  for (const variantName of VARIANT_NAMES) {
    const option = new Option(variantName, variantName);
    $("#create-game-variant-dropdown2-list").append($(option));
  }

  dropdown2.on("input", () => {
    // Get what they are searching for.
    let search = dropdown2.val();
    if (typeof search === "number") {
      search = search.toString();
    }
    if (typeof search !== "string") {
      search = "No Variant";
    }

    // Update the hidden field with what the user selected.
    $("#createTableVariant").text(search);

    // If they chose a basic variant, revert back to the basic dropdown.
    if (BASIC_VARIANT_NAMES_SET.has(search)) {
      dropdown1.show();
      dropdown1.val(search);
      dropdown2.hide();
      $("#create-game-variant-dropdown2-icon").hide();
      $("#dice").hide();
    }
  });
}

function submit() {
  // Check the data attribute of the submit button to see if this is a new game or a change of
  // options.
  const isNew = $("#create-game-table-number").val() === "";

  // Leave the dialog open while any value is invalid, showing the extra options only when the
  // problem is among them.
  if (!checkInputs()) {
    const errors = getErrors(readValues());
    if (
      errors.timeBaseMinutes === undefined
      && errors.timePerTurnSeconds === undefined
    ) {
      showExtraOptions(true);
    }
    return;
  }

  const form = readValues();
  const createTable = readForm();
  remember(createTable);

  // Seeds and replays are not saved, so that a new game does not accidentally repeat a deal.
  const deal = readFormDeal(form);
  const { name } = form;

  // Table names are stored locally. The default name is not stored, so that it follows the current
  // username.
  if (isNew) {
    if (name.trim() === "" || name === getDefaultTableName()) {
      localStorage.removeItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME);
    } else {
      localStorage.setItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME, name);
    }
  }

  // Passwords are not stored on the server; instead, they are stored locally as cookies.
  const { password } = form;
  if (isNew) {
    localStorage.setItem(LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD, password);
  }

  const settings = {
    name: name.trim() === "" ? getDefaultTableName() : name,
    maxPlayers: createTable.maxPlayers,
    options: tableOptions(createTable),
    ...(deal !== undefined && { deal }),
  };

  lobbyPage.hide();

  if (isNew) {
    globals.conn!.send("tableCreate", {
      settings,
      ...(password !== "" && { password }),
    });
    store.dispatch(creatingTableChanged(true));
  } else {
    globals.conn!.send("tableUpdate", {
      tableId: globals.joinedTableId,
      settings,
    });
  }
}

export function acceptOptionsFromGuest(suggestion: SuggestedSettings): void {
  globals.conn!.send("tableUpdate", {
    tableId: globals.joinedTableId,
    settings: suggestion,
  });
}

function addCheckedInput(selector: string, field: CheckedField) {
  const element = getHtmlInputElement(selector);
  checkedInputs.push({
    element,
    tooltip: new Tooltip(element, { content: "" }),
    field,
  });

  // The fields depend on each other, so a change to one checks them all.
  element.addEventListener("input", () => {
    checkInputs();
  });
}

/**
 * Marks each checked text box red and explains why while it is invalid. Returns whether they are
 * all valid.
 */
function checkInputs(): boolean {
  const form = readValues();

  // The turn only applies to a replay.
  const replaying = isReplaying(form);
  $("#create-game-replay-turn").prop("disabled", !replaying);
  $("#create-game-replay-turn-label").fadeTo(0, replaying ? 1 : DIMMED_OPACITY);

  const errors = getErrors(form);
  let valid = true;
  for (const { element, tooltip, field } of checkedInputs) {
    const error = errors[field];
    element.classList.toggle("wrong-input", error !== undefined);
    if (error === undefined) {
      tooltip.close();
    } else {
      valid = false;
      tooltip.setContent(escapeHtml(error));
      tooltip.open();
    }
  }
  return valid;
}

function closeInputErrors() {
  for (const { tooltip } of checkedInputs) {
    tooltip.close();
  }
}

/** Reads what the form shows. */
function readValues(): CreateGameForm {
  return {
    name: getHtmlInputElement("#createTableName").value,
    // This is a hidden span field.
    variantName: $("#createTableVariant").text(),
    maxPlayers: getHtmlInputElement("#createTableMaxPlayers").value,
    password: getHtmlInputElement("#createTablePassword").value,
    timed: isChecked(TIMED),
    timeBaseMinutes: getHtmlInputElement("#createTableTimeBaseMinutes").value,
    timePerTurnSeconds: getHtmlInputElement("#createTableTimePerTurnSeconds")
      .value,
    extraOptions: Object.fromEntries(
      EXTRA_OPTION_NAMES.map((option) => [
        option,
        isChecked(EXTRA_OPTIONS[option]),
      ]),
    ) as Record<ExtraOption, boolean>,
    seed: getHtmlInputElement("#create-game-seed").value,
    replayGameId: getHtmlInputElement("#create-game-replay-game-id").value,
    replayTurn: getHtmlInputElement("#create-game-replay-turn").value,
  };
}

/** Reads the table that the form shows. An invalid time keeps the one that we remember. */
function readForm(): CreateTable {
  return readTable(readValues(), rememberedTimeControl());
}

function rememberForm() {
  remember(readForm());
}

/** Remembers the table that the form starts from next time, if it changed. */
function remember(createTable: CreateTable) {
  if (!equal(createTable, globals.settings.createTable)) {
    globals.settings = { ...globals.settings, createTable };
    globals.conn!.send("settings", { settings: { createTable } });
  }
}

/** Remembers a variant that a chat command chose. */
export function rememberVariant(variantName: string): void {
  const { createTable } = globals.settings;
  remember({
    ...createTable,
    options: { ...createTable.options, variantId: getVariant(variantName).id },
  });
}

/**
 * Shows the screen from the lobby (to create a game) or the pre-game screen (to change options).
 */
export function show(): void {
  ready();
  lobbyPage.show("#lobby-create-game", "#create-game-submit", closeInputErrors);
  $("#create-game-variant-dropdown1").trigger("focus");
}

/**
 * Converts the options of a table into the form's values. An untimed table keeps our own clock, so
 * that it is ready if the timer is turned on.
 */
function getFormValues(options: GameOptions, maxPlayers: number): CreateTable {
  return {
    maxPlayers: isValidNumPlayers(maxPlayers)
      ? maxPlayers
      : defaultSettings.createTable.maxPlayers,
    options: {
      ...options,
      timeControl: options.timeControl ?? rememberedTimeControl(),
    },
    timed: options.timeControl !== undefined,
  };
}

/** Fills in the form for a new game or for the options of the current game. */
export function ready(): void {
  // Change the UI if we are in a pre-game screen.
  let dialogTitle = "Create a New Game";
  let buttonTitle = "Create";
  let gameName: string;
  let formValues: CreateTable;
  let seed = "";
  let replayGameId = "";
  let replayTurn = "";

  if (globals.game === undefined || globals.currentScreen === Screen.Lobby) {
    // Create New Game. Use the settings that we used last time (which are stored on the server).
    gameName =
      localStorage.getItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME)
      ?? getDefaultTableName();
    formValues = globals.settings.createTable;

    // Show the password row.
    $("#password-row").removeClass("hidden");

    // Ensure create-game-table-number is empty.
    $("#create-game-table-number").val("");
  } else {
    // Change Options. Use the options of the current table. The server only applies the options of
    // the table owner; it sends the options of other players to the owner as a suggestion.
    if (globals.game.owner.userId === globals.userId) {
      dialogTitle = "Change Game Options";
      buttonTitle = "Change";
    } else {
      dialogTitle = "Suggest Game Options";
      buttonTitle = "Suggest to Table Owner";
    }
    const { settings } = globals.game;
    gameName = settings.name;
    formValues = getFormValues(settings.options, settings.maxPlayers);
    const { deal } = settings;
    if (deal?.type === "seed") {
      seed = deal.suffix;
    } else if (deal?.type === "replay") {
      replayGameId = deal.gameId.toString();
      replayTurn = deal.turn === undefined ? "" : (deal.turn + 1).toString();
    }

    // Can't change the password once the game is created.
    $("#password-row").addClass("hidden");

    // Ensure create-game-table-number has a value.
    $("#create-game-table-number").val(globals.joinedTableId);
  }

  // Set UI Elements and values.
  $("#create-game-title").text(dialogTitle);
  $("#create-game-submit").text(buttonTitle);
  $("#createTableName").val(gameName);
  $("#create-game-seed").val(seed);
  $("#create-game-replay-game-id").val(replayGameId);
  $("#create-game-replay-turn").val(replayTurn);

  // Setting the variant dropdown is more complicated than filling in a value.
  const form = formFromTable(
    formValues,
    readyVariant(formValues.options.variantId),
  );
  // Do not trigger the "change" events, since they would remember the values in our settings.
  $(TIMED).prop("checked", form.timed);
  for (const option of EXTRA_OPTION_NAMES) {
    $(EXTRA_OPTIONS[option]).prop("checked", form.extraOptions[option]);
  }
  updateCheckboxRows();
  $("#createTableTimeBaseMinutes").val(form.timeBaseMinutes);
  $("#createTableTimePerTurnSeconds").val(form.timePerTurnSeconds);

  // Fill in the "Password" box. (This is not stored on the server so we have to retrieve the last
  // password from a cookie.)
  const password = localStorage.getItem(
    LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD,
  );
  if (password !== null && password !== "") {
    $("#createTablePassword").val(password);
  }

  $("#createTableMaxPlayers").val(form.maxPlayers);
  checkInputs();

  // Only show the extra options when one of them is selected or when the user asks for them.
  showExtraOptions(
    seed !== ""
      || replayGameId !== ""
      || Object.values(EXTRA_OPTIONS).some((selector) => isChecked(selector)),
  );
}

function getDefaultTableName(): string {
  return `${globals.username}${DEFAULT_TABLE_NAME_SUFFIX}`;
}

function isChecked(selector: string): boolean {
  return getHtmlInputElement(selector).checked;
}

/** Shows, hides, or disables the rows that depend on the state of a checkbox. */
function updateCheckboxRows() {
  // The time fields only apply to a timed game, and a speedrun is never timed.
  $(".create-game-timed-option").toggle(isChecked(TIMED));
  $("#create-game-timed-row").toggle(!isChecked(EXTRA_OPTIONS.speedrun));

  // A game cannot have both one extra card and one less card.
  const oneExtraCard = isChecked(EXTRA_OPTIONS.oneExtraCard);
  const oneLessCard = isChecked(EXTRA_OPTIONS.oneLessCard);
  $("#createTableOneLessCardRow").fadeTo(0, oneExtraCard ? DIMMED_OPACITY : 1);
  $("#createTableOneLessCard").prop("disabled", oneExtraCard);
  $("#createTableOneExtraCardRow").fadeTo(0, oneLessCard ? DIMMED_OPACITY : 1);
  $("#createTableOneExtraCard").prop("disabled", oneLessCard);
}

function showExtraOptions(visible: boolean) {
  $("#create-game-extra-options").toggleClass("hidden", !visible);
  const button = $("#create-game-show-extra-options");
  button.attr("aria-expanded", visible.toString());
  button
    .find("i")
    .toggleClass("fa-plus", !visible)
    .toggleClass("fa-minus", visible);
  button
    .find("span")
    .text(visible ? "Hide Extra Options" : "Show Extra Options");
}

/** Shows a variant in the dropdowns, and returns its name. */
function readyVariant(variantId: number): string {
  // Validate the variant that we got from the server.
  let variantName: string;
  if (doesVariantIdExist(variantId)) {
    variantName = getVariantById(variantId).name;
  } else {
    variantName = DEFAULT_VARIANT_NAME;

    // Since the variant is not valid, update our settings.
    const { createTable } = globals.settings;
    globals.settings = {
      ...globals.settings,
      createTable: {
        ...createTable,
        options: { ...createTable.options, variantId: DEFAULT_VARIANT_ID },
      },
    };
  }

  // Update the hidden field.
  $("#createTableVariant").text(variantName);

  if (BASIC_VARIANT_NAMES_SET.has(variantName)) {
    // If this is one of the basic variants, set it in the first dropdown.
    dropdown1.show();
    dropdown1.val(variantName);
    dropdown2.hide();
    $("#create-game-variant-dropdown2-icon").hide();
    $("#dice").hide();
  } else {
    // If this is not one of the basic variants, set it in the second dropdown.
    dropdown1.hide();
    dropdown2.show();
    dropdown2.val(variantName);
    $("#create-game-variant-dropdown2-icon").show();
    $("#dice").show();
  }

  return variantName;
}
