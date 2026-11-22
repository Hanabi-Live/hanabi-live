// The form of the "Create Game" page. It starts again each time that the page shows: from the table
// that we created last time, or from the options of the table that we are at.

import {
  MAX_SEED_LENGTH,
  MAX_TABLE_NAME_LENGTH,
  defaultSettings,
} from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  doesVariantExist,
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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEFAULT_TABLE_NAME_SUFFIX,
  DIMMED_OPACITY,
  LOCAL_STORAGE_KEY,
} from "../../constants.ts";
import {
  getFadeStyle,
  useReducedMotion,
  useRevealClassName,
} from "../../fade.ts";
import { globals } from "../../Globals.ts";
import type { LengthLimit } from "../../LengthCounter.tsx";
import {
  LengthCounter,
  countCharacters,
  rejectTooLong,
} from "../../LengthCounter.tsx";
import { creatingTableChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import { Tooltip } from "../../Tooltip.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { WaitingLabel, getWaitingButtonClass } from "../../WaitingCard.tsx";
import { CheckedInput } from "../CheckedInput.tsx";
import { remember } from "../createGame.ts";
import type {
  CreateGameForm,
  CreateTable,
  ExtraOption,
} from "../createGameForm.ts";
import {
  DEFAULT_TIME_CONTROL,
  formFromTable,
  getErrors,
  readFormSeedSuffix,
  readTable,
} from "../createGameForm.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { PageTitle } from "../PageTitle.tsx";
import { Screen } from "../types/Screen.ts";
import {
  CURATED_VARIANT_GROUPS,
  CURATED_VARIANT_RECIPES,
} from "./curatedVariants.ts";
import {
  getCatalogName,
  getRecipeName,
  getRecipeSuit,
  getSuitBackground,
} from "./variantBuilder.ts";
import { VariantBuilder } from "./VariantBuilder.tsx";

/**
 * The website offers thousands of variants. To prevent confusion, the dropdown only shows the basic
 * ones. Its last choice opens a menu of curated variants, and the variant builder makes the rest.
 */
const BASIC_VARIANT_NAMES = [
  "No Variant",
  "Black (5 Suits)",
  "Rainbow (5 Suits)",
] as const;

const BASIC_VARIANT_NAMES_SET = new ReadonlySet<string>(BASIC_VARIANT_NAMES);

/** The choice of the dropdown that opens the menu of curated variants. */
const CURATED_VARIANTS = "Other curated variants";

/** The value of the dropdown's choice that shows a new variant, which has no catalog name. */
const NEW_VARIANT = "new-variant";

export const DOCS_URL =
  "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs";

/** The checkboxes under "Extra Options", with what describes each one. */
const EXTRA_OPTION_ROWS = [
  {
    option: "speedrun",
    id: "createTableSpeedrun",
    icon: "fa-person-running",
    label: "Speedrun",
    help: `${DOCS_URL}/features.md#speedruns`,
  },
  {
    option: "deckPlays",
    id: "createTableDeckPlays",
    icon: "fa-person-walking-with-cane",
    label: "Bottom-Deck Blind Plays",
    help: `${DOCS_URL}/features.md#bottom-deck-blind-plays`,
  },
  {
    option: "emptyClues",
    id: "createTableEmptyClues",
    icon: "fa-expand",
    label: "Empty Clues",
    help: `${DOCS_URL}/features.md#empty-clues`,
  },
  {
    option: "oneExtraCard",
    id: "createTableOneExtraCard",
    icon: "fa-circle-plus",
    label: "One Extra Card",
    help: `${DOCS_URL}/features.md#one-extra-card`,
  },
  {
    option: "oneLessCard",
    id: "createTableOneLessCard",
    icon: "fa-circle-minus",
    label: "One Less Card",
    help: `${DOCS_URL}/features.md#one-less-card`,
  },
  {
    option: "allOrNothing",
    id: "createTableAllOrNothing",
    icon: "fa-layer-group",
    label: "All or Nothing",
    help: `${DOCS_URL}/features.md#all-or-nothing`,
  },
  {
    option: "detrimentalCharacters",
    id: "createTableDetrimentalCharacters",
    icon: "fa-face-flushed",
    label: "Detrimental Characters",
    help: `${DOCS_URL}/characters.md`,
  },
] as const satisfies ReadonlyArray<{
  readonly option: ExtraOption;
  readonly id: string;
  readonly icon: string;
  readonly label: string;
  readonly help: string;
}>;

/** A game cannot have both one extra card and one less card. */
function getExclusiveOption(option: ExtraOption): ExtraOption | undefined {
  switch (option) {
    case "oneExtraCard": {
      return "oneLessCard";
    }

    case "oneLessCard": {
      return "oneExtraCard";
    }

    default: {
      return undefined;
    }
  }
}

/** Text fields, the variant picker, and the replay row share one width, so their edges line up. */
const FIELD_WIDTH =
  "tw:flex-[0_0_20em] tw:w-[20em] tw:narrow-640:basis-auto tw:narrow-640:w-full";

/**
 * The times of the clock share a row with the box that turns it on. They leave room for the box
 * (1.8em) and the gap of the row (1.5em), so that their left edge lines up with the other fields.
 */
const TIME_FIELDS_WIDTH = "tw:w-[calc(20em-3.3em)] tw:narrow-640:w-full";

/**
 * Whether the form creates a table, changes the options of our table, or suggests options to the
 * owner of the table that we are at. The server only applies the options of the owner.
 */
type Mode = "create" | "change" | "suggest";

const TITLES = {
  create: "Create a New Game",
  change: "Change Game Options",
  suggest: "Suggest Game Options",
} as const satisfies Record<Mode, string>;

const SUBMIT_LABELS = {
  create: "Create",
  change: "Change",
  suggest: "Suggest to Table Owner",
} as const satisfies Record<Mode, string>;

/** What the submit button says while it waits for the server. */
const WAITING_LABELS = {
  create: "Creating...",
  change: "Changing...",
  suggest: "Suggesting...",
} as const satisfies Record<Mode, string>;

/**
 * The clock that replaces an invalid time: the one of our last timed table, or else the default.
 */
function rememberedTimeControl(): NonNullable<GameOptions["timeControl"]> {
  return (
    store.getState().session.settings.createTable.options.timeControl
    ?? DEFAULT_TIME_CONTROL
  );
}

function getDefaultTableName(): string {
  return `${store.getState().session.username}${DEFAULT_TABLE_NAME_SUFFIX}`;
}

/** The form from our last table, or from the options of the table that we are at. */
function getInitialForm(mode: Mode): CreateGameForm {
  const { game } = store.getState().pregame;
  if (mode === "create" || game === undefined) {
    const { createTable } = store.getState().session.settings;
    return {
      name:
        localStorage.getItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME)
        ?? getDefaultTableName(),
      // Passwords are not stored on the server, so the last one is stored here.
      password:
        localStorage.getItem(LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD) ?? "",
      seed: "",
      ...formFromTable(
        createTable,
        getVariantById(createTable.options.variantId).name,
      ),
    };
  }

  const { settings } = game;
  const { options } = settings;
  return {
    name: settings.name,
    password: "",
    seed: settings.seedSuffix ?? "",
    ...formFromTable(
      {
        maxPlayers: isValidNumPlayers(settings.maxPlayers)
          ? settings.maxPlayers
          : defaultSettings.createTable.maxPlayers,
        options,
      },
      getVariantById(options.variantId).name,
    ),
  };
}

/** The limit of a table name, which the server counts after it trims the name. */
const TABLE_NAME_LENGTH_LIMIT = {
  max: MAX_TABLE_NAME_LENGTH,
  left: (text) => MAX_TABLE_NAME_LENGTH - countCharacters(text.trim()),
  tooLongText: "Name is too long.",
} as const satisfies LengthLimit;

function getMode(): Mode {
  const { game } = store.getState().pregame;
  if (game === undefined || store.getState().session.screen === Screen.Lobby) {
    return "create";
  }
  return game.owner.userId === store.getState().session.userId
    ? "change"
    : "suggest";
}

export function CreateGame(): React.JSX.Element {
  const [mode] = useState(getMode);
  const [initialForm] = useState(() => getInitialForm(mode));
  const [form, setForm] = useState(initialForm);
  // Only show the extra options when one of them is chosen or when the user asks for them.
  const [extraOptionsShown, setExtraOptionsShown] = useState(
    () => form.seed !== "" || Object.values(form.extraOptions).some(Boolean),
  );
  const errors = getErrors(form);
  const fadeStyle = getFadeStyle(useReducedMotion());
  const timerGroupClass = useRevealClassName(!form.extraOptions.speedrun);
  const extraOptionsClass = useRevealClassName(extraOptionsShown);
  // Changing or suggesting the options that the table already has would do nothing.
  const unchanged = mode !== "create" && equal(form, initialForm);
  // From the click on the submit button until the server answers. The page stays open, so that a
  // refusal keeps what the user entered.
  const [waiting, setWaiting] = useState(false);
  const [building, setBuilding] = useState(false);
  // The recipe of a variant that the builder made and the catalog does not have. The server cannot
  // create a table with it yet.
  const [newRecipe, setNewRecipe] = useState<string | undefined>();
  const newVariant = newRecipe !== undefined;
  const blocked = unchanged || newVariant;
  const blockedReason = getBlockedReason(unchanged, newVariant);
  const nameRef = useRef<HTMLInputElement>(null);

  /** Changes the form. Changes to the table are remembered for next time when `save` is true. */
  function change(changed: Partial<CreateGameForm>, save: boolean) {
    const next = {
      ...form,
      ...changed,
    };
    setForm(next);
    if (save) {
      remember(readTable(next, rememberedTimeControl()));
    }
  }

  function changeExtraOption(option: ExtraOption, checked: boolean) {
    change(
      {
        extraOptions: {
          ...form.extraOptions,
          [option]: checked,
        },
      },
      true,
    );
  }

  function submit() {
    if (
      waiting
      || blocked
      || rejectTooLong(nameRef.current!, TABLE_NAME_LENGTH_LIMIT)
    ) {
      return;
    }

    // Leave the page open while any value is invalid, showing the extra options only when the
    // problem is among them.
    if (Object.keys(errors).length > 0) {
      if (
        errors.timeBaseMinutes === undefined
        && errors.timePerTurnSeconds === undefined
      ) {
        setExtraOptionsShown(true);
      }
      return;
    }

    const table: CreateTable = readTable(form, rememberedTimeControl());
    remember(table);

    const isNew = mode === "create";
    const { name, password } = form;

    // Table names are stored locally. The default name is not stored, so that it follows the
    // current username.
    if (isNew) {
      if (name.trim() === "" || name === getDefaultTableName()) {
        localStorage.removeItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME);
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY.CREATE_TABLE_NAME, name);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD, password);
    }

    // Seeds are not saved, so that a new game does not accidentally repeat a deal.
    const seedSuffix = readFormSeedSuffix(form);
    const settings = {
      name: name.trim() === "" ? getDefaultTableName() : name,
      maxPlayers: table.maxPlayers,
      options: table.options,
      ...(seedSuffix !== undefined && { seedSuffix }),
    };

    setWaiting(true);
    if (isNew) {
      store.dispatch(creatingTableChanged(true));
      globals.connection.send(
        "tableCreate",
        {
          settings,
          ...(password !== "" && { password }),
        },
        () => {
          // On success, the new table's pregame arrives before the reply and closes the page.
          store.dispatch(creatingTableChanged(false));
          setWaiting(false);
        },
      );
    } else {
      globals.connection.send(
        "tableUpdate",
        {
          tableId: globals.joinedTableId,
          settings,
        },
        (reply) => {
          setWaiting(false);
          // The user may have left the page while waiting.
          if (reply.ok && store.getState().session.lobbyPage === "createGame") {
            lobbyPage.hide();
          }
        },
      );
    }
  }

  return (
    <>
      <PageTitle>{TITLES[mode]}</PageTitle>

      <div className="lobby-group">
        <h3>Table</h3>
        <ul className="lobby-rows">
          <li className="lobby-row">
            <RowLabel htmlFor="createTableName" icon="fa-signature">
              Name
            </RowLabel>
            {/* The counter is positioned in the input's container, which takes the input's place in
                the row. */}
            <span className="tw:relative tw:flex-[0_0_20em] tw:narrow-640:basis-auto">
              <input
                className="tw:w-full"
                id="createTableName"
                onChange={(event) => {
                  change({ name: event.target.value }, false);
                }}
                placeholder="Name"
                ref={nameRef}
                type="text"
                value={form.name}
              />
              <LengthCounter input={nameRef} limit={TABLE_NAME_LENGTH_LIMIT} />
            </span>
          </li>
          <li className="lobby-row">
            <div className="lobby-row-label">
              <RowLabel
                htmlFor="create-game-variant-dropdown1"
                icon="fa-palette"
              >
                Variant
              </RowLabel>
              <HelpLink
                href={`${DOCS_URL}/variants.md`}
                text="About variants"
              />
            </div>
            <VariantPicker
              building={building}
              newRecipe={newRecipe}
              onBuild={() => {
                setBuilding(!building);
              }}
              onChange={(variantName) => {
                setNewRecipe(undefined);
                change({ variantName }, true);
              }}
              onPickRecipe={(recipe) => {
                const name = getCatalogName(recipe);
                if (name === undefined) {
                  setNewRecipe(recipe);
                } else {
                  setNewRecipe(undefined);
                  change({ variantName: name }, true);
                }
              }}
              variantName={form.variantName}
            />
          </li>
          {building && (
            <li className="lobby-row" id="create-game-variant-builder">
              <VariantBuilder
                newRecipe={newRecipe}
                onNew={setNewRecipe}
                onPick={(variantName) => {
                  setNewRecipe(undefined);
                  change({ variantName }, true);
                }}
                variantName={form.variantName}
              />
            </li>
          )}
          <li className="lobby-row">
            <RowLabel htmlFor="createTableMaxPlayers" icon="fa-users">
              Max Players
            </RowLabel>
            <input
              id="createTableMaxPlayers"
              max={MAX_PLAYERS}
              min={MIN_PLAYERS}
              // An invalid value goes back to the default when the box loses the focus.
              onBlur={() => {
                if (!isValidNumPlayers(parseIntSafe(form.maxPlayers))) {
                  change(
                    {
                      maxPlayers:
                        defaultSettings.createTable.maxPlayers.toString(),
                    },
                    false,
                  );
                }
              }}
              onChange={(event) => {
                change({ maxPlayers: event.target.value }, false);
              }}
              placeholder={defaultSettings.createTable.maxPlayers.toString()}
              type="number"
              value={form.maxPlayers}
            />
          </li>
          {/* The password cannot change once the table exists. */}
          {mode === "create" && (
            <li className="lobby-row">
              <RowLabel htmlFor="createTablePassword" icon="fa-key">
                Password
              </RowLabel>
              <input
                id="createTablePassword"
                onChange={(event) => {
                  change({ password: event.target.value }, false);
                }}
                placeholder="Optional"
                type="text"
                value={form.password}
              />
            </li>
          )}
        </ul>
      </div>

      {/* Speedruns are never timed, so this group is hidden for them. */}
      <div className={`lobby-group ${timerGroupClass}`} style={fadeStyle}>
        <h3>Timer</h3>
        <ul className="lobby-rows">
          <CheckboxRow
            checked={form.timed}
            fields={
              // Dimmed while the table is untimed. A click on them then checks the box, like a
              // click anywhere else on the row.
              <div
                className={`tw:flex tw:items-center tw:gap-[0.5em] tw:whitespace-nowrap ${TIME_FIELDS_WIDTH}${form.timed ? " tw:relative tw:z-1" : ""}`}
                style={form.timed ? undefined : { opacity: DIMMED_OPACITY }}
              >
                <CheckedInput
                  aria-label="Base time (minutes)"
                  className="tw:min-w-0 tw:flex-1 tw:text-center"
                  disabled={!form.timed}
                  error={errors.timeBaseMinutes}
                  id="createTableTimeBaseMinutes"
                  inputMode="decimal"
                  onBlur={() => {
                    change({}, true);
                  }}
                  onChange={(value) => {
                    change({ timeBaseMinutes: value }, false);
                  }}
                  value={form.timeBaseMinutes}
                />
                min +
                <CheckedInput
                  aria-label="Time per turn (seconds)"
                  className="tw:min-w-0 tw:flex-1 tw:text-center"
                  disabled={!form.timed}
                  error={errors.timePerTurnSeconds}
                  id="createTableTimePerTurnSeconds"
                  inputMode="numeric"
                  onBlur={() => {
                    change({}, true);
                  }}
                  onChange={(value) => {
                    change({ timePerTurnSeconds: value }, false);
                  }}
                  value={form.timePerTurnSeconds}
                />
                sec per turn
              </div>
            }
            icon="fa-clock"
            id="createTableTimed"
            onChange={(checked) => {
              change({ timed: checked }, true);
            }}
          >
            Timed
          </CheckboxRow>
        </ul>
      </div>

      {/* Most games do not use the extra options, so they start out hidden. A click on the heading
          shows them. */}
      <div className="lobby-group">
        <h3 className="tw:mb-0">
          <button
            aria-controls="create-game-extra-options"
            aria-expanded={extraOptionsShown}
            className="tw:flex tw:cursor-pointer tw:items-center tw:gap-[0.5em] tw:border-none tw:bg-transparent tw:p-0 tw:tracking-[inherit] tw:text-inherit tw:[font:inherit] tw:hover:text-text"
            id="create-game-show-extra-options"
            onClick={() => {
              setExtraOptionsShown(!extraOptionsShown);
            }}
            type="button"
          >
            <i
              className={`fas fa-chevron-right tw:text-[0.75em] tw:transition-transform${extraOptionsShown ? " tw:rotate-90" : ""}`}
              style={fadeStyle}
            />
            Extra Options
          </button>
        </h3>
        {/* The wrapper grows and shrinks, and the space above the rows grows and shrinks with it. */}
        <div
          className={extraOptionsClass}
          id="create-game-extra-options"
          style={fadeStyle}
        >
          <div className="tw:pt-[0.6em]">
            <ul className="lobby-rows">
              {EXTRA_OPTION_ROWS.map(({ option, id, icon, label, help }) => {
                const exclusive = getExclusiveOption(option);
                const disabled =
                  exclusive !== undefined && form.extraOptions[exclusive];
                return (
                  <CheckboxRow
                    checked={form.extraOptions[option]}
                    disabled={disabled}
                    help={{
                      href: help,
                      text: `About ${label}`,
                    }}
                    icon={icon}
                    id={id}
                    key={option}
                    onChange={(checked) => {
                      changeExtraOption(option, checked);
                    }}
                  >
                    {label}
                  </CheckboxRow>
                );
              })}
              <li className="lobby-row">
                <div className="lobby-row-label">
                  <RowLabel htmlFor="create-game-seed" icon="fa-seedling">
                    Custom Seed
                  </RowLabel>
                  <HelpLink
                    href={`${DOCS_URL}/features.md#similar-deals-and-competitive-play`}
                    text="About Custom Seeds"
                  />
                </div>
                <CheckedInput
                  autoComplete="off"
                  error={extraOptionsShown ? errors.seed : undefined}
                  id="create-game-seed"
                  maxLength={MAX_SEED_LENGTH}
                  onChange={(value) => {
                    change({ seed: value }, false);
                  }}
                  placeholder="Optional"
                  spellCheck={false}
                  value={form.seed}
                />
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* A disabled button gets no pointer events, so this one only looks disabled, to keep its
          tooltip. */}
      <button
        aria-busy={waiting}
        aria-disabled={blocked || waiting}
        className={`button fit primary tw:mt-6 ${getWaitingButtonClass(waiting)}${blocked ? " disabled" : ""}`}
        id="create-game-submit"
        onClick={submit}
        ref={tooltipRef(blockedReason)}
        type="submit"
      >
        <WaitingLabel waiting={waiting} waitingText={WAITING_LABELS[mode]}>
          {SUBMIT_LABELS[mode]}
        </WaitingLabel>
      </button>
    </>
  );
}

/**
 * The basic variants in a dropdown. Its last choice opens a menu of curated variants. A variant
 * from elsewhere, such as the variant builder, shows as the dropdown's first choice.
 */
function VariantPicker({
  building,
  newRecipe,
  onBuild,
  onChange,
  onPickRecipe,
  variantName,
}: {
  /** Whether the variant builder is open. */
  readonly building: boolean;
  /** The recipe of a new variant that the form shows, which the catalog does not have. */
  readonly newRecipe: string | undefined;
  readonly onBuild: () => void;
  /** A variant of the catalog was chosen, which the form remembers. */
  readonly onChange: (variantName: string) => void;
  /** A curated variant was chosen, which can be a new variant. */
  readonly onPickRecipe: (recipe: string) => void;
  readonly variantName: string;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menu] = useState(() => document.createElement("div"));
  const menuRef = useRef<Tooltip>(null);

  // The page starts with the focus on the variant.
  useEffect(() => {
    selectRef.current!.focus();
  }, []);

  useEffect(() => {
    const tooltip = new Tooltip(anchorRef.current!, {
      content: menu,
      interactive: true,
    });
    menuRef.current = tooltip;
    return () => {
      tooltip.destroy();
    };
  }, [menu]);

  function closeMenu() {
    menuRef.current?.close();
    selectRef.current?.focus();
  }

  const other =
    !BASIC_VARIANT_NAMES_SET.has(variantName) && doesVariantExist(variantName);
  const currentRecipe =
    newRecipe
    ?? (doesVariantExist(variantName)
      ? getVariant(variantName).recipe
      : undefined);

  return (
    <div className={`tw:flex tw:items-center tw:gap-[0.9em] ${FIELD_WIDTH}`}>
      <div className="tw:min-w-0 tw:flex-1" ref={anchorRef}>
        <select
          className="tw:w-full"
          id="create-game-variant-dropdown1"
          onChange={(event) => {
            if (event.target.value === NEW_VARIANT) {
              return;
            }
            if (event.target.value === CURATED_VARIANTS) {
              // The dropdown keeps showing the variant, since its value does not change.
              menuRef.current?.openUntilClickElsewhere();
              // The focus starts on the current variant, if the menu has it.
              (
                menu.querySelector<HTMLElement>("button[data-current]")
                ?? menu.querySelector<HTMLElement>("button")
              )?.focus();
            } else {
              onChange(event.target.value);
            }
          }}
          ref={selectRef}
          value={getDropdownValue(newRecipe, variantName, other)}
        >
          {newRecipe !== undefined && (
            <option value={NEW_VARIANT}>{getRecipeName(newRecipe)}</option>
          )}
          {newRecipe === undefined && other && (
            <option value={variantName}>{variantName}</option>
          )}
          {BASIC_VARIANT_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <hr />
          <option value={CURATED_VARIANTS}>{CURATED_VARIANTS}</option>
        </select>
      </div>
      <button
        aria-label="Choose a random curated variant"
        className="tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:text-[1.2em] tw:text-green-text tw:hover:text-(--dice-hover)"
        onClick={() => {
          // A different variant each time, so that a click always changes it.
          onPickRecipe(
            getRandomArrayElement(
              CURATED_VARIANT_RECIPES.filter(
                (recipe) => recipe !== currentRecipe,
              ),
            ),
          );
        }}
        ref={tooltipRef("Choose a random curated variant")}
        type="button"
      >
        <i className="fas fa-dice" id="dice" />
      </button>
      <button
        aria-controls="create-game-variant-builder"
        aria-expanded={building}
        aria-label="Build a variant"
        className={`tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:text-[1.2em] tw:hover:text-(--dice-hover) ${building ? "tw:text-green" : "tw:text-green-text"}`}
        onClick={onBuild}
        ref={tooltipRef("Build a variant from its suits and rules")}
        type="button"
      >
        <i className="fas fa-sliders" />
      </button>
      {createPortal(
        <CuratedVariantMenu
          currentRecipe={currentRecipe}
          onClose={closeMenu}
          onPick={(recipe) => {
            closeMenu();
            onPickRecipe(recipe);
          }}
        />,
        menu,
      )}
    </div>
  );
}

/** The menu of curated variants, which opens from the dropdown in the site's tooltip. */
/** The suit count that most curated variants have, which their names in the menu leave out. */
const USUAL_SUITS_SUFFIX = " (5 Suits)";

/**
 * The menu of curated variants, which opens from the dropdown in the site's tooltip. No Variant
 * comes first, then the groups, which flow into as many columns as fit, so that the menu stays
 * short. A suit's variants show the suit's color, and the current variant has the row highlight,
 * which does not change the width of its name.
 */
function CuratedVariantMenu({
  currentRecipe,
  onClose,
  onPick,
}: {
  readonly currentRecipe: string | undefined;
  readonly onClose: () => void;
  readonly onPick: (recipe: string) => void;
}) {
  return (
    // Escape closes the menu, and the focus goes back to the dropdown.
    <nav
      aria-label={CURATED_VARIANTS}
      // A menu that is still taller than the window scrolls. A pressed button moves down, so the
      // bottom keeps room for it.
      className="tw:max-h-[80vh] tw:w-[min(58em,calc(100vw-3em))] tw:overflow-y-auto tw:pb-(--button-press-depth) tw:text-left"
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.stopPropagation();
        onClose();
      }}
    >
      {CURATED_VARIANT_GROUPS.map(({ label, swatches, recipes }) =>
        label === undefined ? (
          <CuratedList
            currentRecipe={currentRecipe}
            key="top"
            onPick={onPick}
            recipes={recipes}
            swatches={swatches}
          />
        ) : null,
      )}
      <div className="tw:mt-[0.6em] tw:columns-[10.5em] tw:gap-[1em]">
        {CURATED_VARIANT_GROUPS.map(({ label, swatches, recipes }) =>
          label === undefined ? null : (
            <section
              className="tw:mb-[0.8em] tw:break-inside-avoid"
              key={label}
            >
              <h4 className="tw:m-0 tw:mb-[0.15em] tw:px-[0.5em] tw:text-[0.85em] tw:font-normal tw:text-(--text) tw:opacity-70">
                {label}
              </h4>
              <CuratedList
                currentRecipe={currentRecipe}
                onPick={onPick}
                recipes={recipes}
                swatches={swatches}
              />
            </section>
          ),
        )}
      </div>
    </nav>
  );
}

/**
 * The name that the menu shows: without "(5 Suits)", unless another variant of the group has the
 * same name with another suit count, such as Dual-Color (6 Suits).
 */
function getShortName(name: string, groupRecipes: readonly string[]): string {
  if (!name.endsWith(USUAL_SUITS_SUFFIX)) {
    return name;
  }
  const short = name.slice(0, -USUAL_SUITS_SUFFIX.length);
  const shared = groupRecipes.some((recipe) => {
    const other = getRecipeName(recipe);
    return other !== name && other.startsWith(`${short} (`);
  });
  return shared ? name : short;
}

function CuratedList({
  currentRecipe,
  onPick,
  recipes,
  swatches,
}: {
  readonly currentRecipe: string | undefined;
  readonly onPick: (recipe: string) => void;
  readonly recipes: readonly string[];
  readonly swatches: boolean;
}) {
  return (
    <ul className="tw:m-0 tw:list-none tw:p-0">
      {recipes.map((recipe) => {
        const current = recipe === currentRecipe;
        const name = getRecipeName(recipe);
        const suit = swatches ? getRecipeSuit(recipe) : undefined;
        return (
          <li key={recipe}>
            <button
              aria-current={current ? "true" : undefined}
              aria-label={name}
              className={`tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-[0.5em] tw:rounded-[3px] tw:border-none tw:px-[0.5em] tw:py-[0.15em] tw:text-left tw:leading-snug tw:[font-family:inherit] tw:[font-size:inherit] tw:text-(--text) tw:hover:bg-(--row-hover-bg) tw:hover:text-(--menu-hover-text) tw:[font-weight:inherit] ${current ? "tw:bg-(--row-hover-bg)" : "tw:bg-transparent"}`}
              data-current={current ? "" : undefined}
              onClick={() => {
                onPick(recipe);
              }}
              type="button"
            >
              {/* A variant without a suit, such as Deceptive-Ones, keeps the dot's space, so that its
                  name lines up with the others. */}
              {swatches && (
                <span
                  aria-hidden
                  className={`tw:block tw:size-[0.75em] tw:shrink-0 tw:rounded-full ${suit === undefined ? "" : "tw:border tw:border-solid tw:border-black/40"}`}
                  style={
                    suit === undefined
                      ? undefined
                      : { background: getSuitBackground(suit) }
                  }
                />
              )}
              {getShortName(name, recipes)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RowLabel({
  children,
  htmlFor,
  icon,
}: {
  readonly children: React.ReactNode;
  readonly htmlFor: string;
  readonly icon: string;
}) {
  return (
    <label htmlFor={htmlFor}>
      <i className={`fas ${icon} fa-fw`} />
      {children}
    </label>
  );
}

/** A link beside a description that explains it. */
export function HelpLink({
  href,
  text,
}: {
  readonly href: string;
  readonly text: string;
}): React.JSX.Element {
  return (
    <a aria-label={text} href={href} rel="noopener noreferrer" target="_blank">
      <i className="fas fa-circle-question tw:hover:text-(--link)" />
    </a>
  );
}

function CheckboxRow({
  checked,
  children,
  disabled = false,
  fields,
  help,
  icon,
  id,
  onChange,
}: {
  readonly checked: boolean;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  /** Fields between the description and the box. A narrow screen puts them below both. */
  readonly fields?: React.ReactNode;
  readonly help?: { readonly href: string; readonly text: string };
  readonly icon: string;
  readonly id: string;
  readonly onChange: (checked: boolean) => void;
}) {
  const label = (
    <RowLabel htmlFor={id} icon={icon}>
      {children}
    </RowLabel>
  );

  return (
    <li
      className={
        fields === undefined
          ? "lobby-row"
          : "lobby-row tw:narrow-640:flex-row tw:narrow-640:flex-wrap tw:narrow-640:items-center"
      }
      style={disabled ? { opacity: DIMMED_OPACITY } : undefined}
    >
      {help === undefined ? (
        label
      ) : (
        <div className="lobby-row-label">
          {label}
          <HelpLink href={help.href} text={help.text} />
        </div>
      )}
      {fields !== undefined && (
        <div className="tw:narrow-640:order-last tw:narrow-640:basis-full">
          {fields}
        </div>
      )}
      <span className="lobby-row-checkbox">
        <input
          checked={checked}
          disabled={disabled}
          id={id}
          onChange={(event) => {
            onChange(event.target.checked);
          }}
          type="checkbox"
        />
        <label htmlFor={id} />
      </span>
    </li>
  );
}

/** The choice that the variant dropdown shows. */
function getDropdownValue(
  newRecipe: string | undefined,
  variantName: string,
  other: boolean,
): string {
  if (newRecipe !== undefined) {
    return NEW_VARIANT;
  }
  return other || BASIC_VARIANT_NAMES_SET.has(variantName)
    ? variantName
    : DEFAULT_VARIANT_NAME;
}

/** Why the submit button does nothing, if it does nothing. */
function getBlockedReason(
  unchanged: boolean,
  newVariant: boolean,
): string | undefined {
  if (unchanged) {
    return "Nothing has changed.";
  }
  if (newVariant) {
    return "The server cannot create new variants yet.";
  }
  return undefined;
}
