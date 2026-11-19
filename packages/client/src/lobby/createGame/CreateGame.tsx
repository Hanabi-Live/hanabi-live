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
  VARIANT_NAMES,
  doesVariantExist,
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
import { SuggestBox, suggestVariants } from "../../SuggestBox.tsx";
import { Tooltip } from "../../Tooltip.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { escapeHtml } from "../../utils.ts";
import { WaitingLabel, getWaitingButtonClass } from "../../WaitingCard.tsx";
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
  isReplaying,
  readFormDeal,
  readTable,
} from "../createGameForm.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { Screen } from "../types/Screen.ts";

/**
 * The website offers over 1000 variants. To prevent confusion, the first dropdown only shows the
 * basic ones. Its last choice searches all of them.
 */
const BASIC_VARIANT_NAMES = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
] as const;

const BASIC_VARIANT_NAMES_SET = new ReadonlySet<string>(BASIC_VARIANT_NAMES);

/** The choice of the first dropdown that switches to the search of every variant. */
const SEARCH_VARIANTS = "Search custom variants...";

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
    label: "Bottom-Deck Blind-Plays",
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
      replayGameId: "",
      replayTurn: "",
      ...formFromTable(
        createTable,
        getVariantById(createTable.options.variantId).name,
      ),
    };
  }

  const { settings } = game;
  const { deal, options } = settings;
  return {
    name: settings.name,
    password: "",
    seed: deal?.type === "seed" ? deal.suffix : "",
    replayGameId: deal?.type === "replay" ? deal.gameId.toString() : "",
    replayTurn:
      deal?.type === "replay" && deal.turn !== undefined
        ? (deal.turn + 1).toString()
        : "",
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
    () =>
      form.seed !== ""
      || form.replayGameId !== ""
      || Object.values(form.extraOptions).some(Boolean),
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
  const nameRef = useRef<HTMLInputElement>(null);
  const timed = form.timed && !form.extraOptions.speedrun;
  const timedRowClass = useRevealClassName(timed);
  const replaying = isReplaying(form);

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
      || unchanged
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

    // Seeds and replays are not saved, so that a new game does not accidentally repeat a deal.
    const deal = readFormDeal(form);
    const settings = {
      name: name.trim() === "" ? getDefaultTableName() : name,
      maxPlayers: table.maxPlayers,
      options: table.options,
      ...(deal !== undefined && { deal }),
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
      <h2>{TITLES[mode]}</h2>

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
              onChange={(variantName) => {
                change({ variantName }, true);
              }}
              onSearch={(variantName) => {
                change({ variantName }, false);
              }}
              variantName={form.variantName}
            />
          </li>
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
            icon="fa-clock"
            id="createTableTimed"
            onChange={(checked) => {
              change({ timed: checked }, true);
            }}
          >
            Timed
          </CheckboxRow>
          <li className={`lobby-row ${timedRowClass}`} style={fadeStyle}>
            <RowLabel
              htmlFor="createTableTimeBaseMinutes"
              icon="fa-hourglass-start"
            >
              Base time (minutes)
            </RowLabel>
            <CheckedInput
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
          </li>
          <li className={`lobby-row ${timedRowClass}`} style={fadeStyle}>
            <RowLabel
              htmlFor="createTableTimePerTurnSeconds"
              icon="fa-stopwatch"
            >
              Time per turn (seconds)
            </RowLabel>
            <CheckedInput
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
          </li>
        </ul>
      </div>

      {/* Most games do not use the extra options, so they start out hidden behind this button. */}
      <div className="tw:mt-6 tw:text-center">
        <button
          aria-controls="create-game-extra-options"
          aria-expanded={extraOptionsShown}
          className="button small"
          id="create-game-show-extra-options"
          onClick={() => {
            setExtraOptionsShown(!extraOptionsShown);
          }}
          type="button"
        >
          <i
            className={`fas ${extraOptionsShown ? "fa-minus" : "fa-plus"} icon-label`}
          />
          <span>
            {extraOptionsShown ? "Hide Extra Options" : "Show Extra Options"}
          </span>
        </button>
      </div>

      {/* The wrapper grows and shrinks, and the space above the group grows and shrinks with it. */}
      <div className={extraOptionsClass} style={fadeStyle}>
        <div className="lobby-group tw:pt-6" id="create-game-extra-options">
          <h3>Extra Options</h3>
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
            <li className="lobby-row">
              <div className="lobby-row-label">
                <RowLabel
                  htmlFor="create-game-replay-game-id"
                  icon="fa-arrow-rotate-left"
                >
                  Replay Game
                </RowLabel>
                <HelpLink
                  href={`${DOCS_URL}/features.md#similar-deals-and-competitive-play`}
                  text="About Replay Game"
                />
              </div>
              {/* The ID of the game to replay and the turn to start from share one row. */}
              <div
                className={`tw:flex tw:items-center tw:gap-3 ${FIELD_WIDTH}`}
              >
                <CheckedInput
                  aria-label="Game ID"
                  autoComplete="off"
                  className="tw:min-w-0 tw:flex-1"
                  error={extraOptionsShown ? errors.replayGameId : undefined}
                  id="create-game-replay-game-id"
                  inputMode="numeric"
                  onChange={(value) => {
                    change({ replayGameId: value }, false);
                  }}
                  placeholder="Game ID"
                  value={form.replayGameId}
                />
                {/* Dimmed until a game ID is entered. */}
                <label
                  className="tw:m-0 tw:flex tw:items-center tw:gap-3 tw:whitespace-nowrap"
                  style={replaying ? undefined : { opacity: DIMMED_OPACITY }}
                >
                  from turn
                  <CheckedInput
                    autoComplete="off"
                    className="tw:w-[4em] tw:text-center"
                    disabled={!replaying}
                    error={extraOptionsShown ? errors.replayTurn : undefined}
                    id="create-game-replay-turn"
                    inputMode="numeric"
                    onChange={(value) => {
                      change({ replayTurn: value }, false);
                    }}
                    placeholder="1"
                    value={form.replayTurn}
                  />
                </label>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* A disabled button gets no pointer events, so this one only looks disabled, to keep its
          tooltip. */}
      <button
        aria-busy={waiting}
        aria-disabled={unchanged || waiting}
        className={`button fit primary tw:mt-6 ${getWaitingButtonClass(waiting)}${unchanged ? " disabled" : ""}`}
        id="create-game-submit"
        onClick={submit}
        ref={tooltipRef(unchanged ? "Nothing has changed." : undefined)}
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
 * The basic variants in a dropdown, or a search of every variant. The search shows for a variant
 * that is not basic, and goes back to the dropdown when a basic variant is chosen.
 */
function VariantPicker({
  onChange,
  onSearch,
  variantName,
}: {
  /** A variant was chosen, which the form remembers. */
  readonly onChange: (variantName: string) => void;
  /** The search changed, which may not be a variant yet. */
  readonly onSearch: (variantName: string) => void;
  readonly variantName: string;
}) {
  const [searching, setSearching] = useState(
    () => !BASIC_VARIANT_NAMES_SET.has(variantName),
  );
  const [search, setSearch] = useState(variantName);
  const selectRef = useRef<HTMLSelectElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The page starts with the focus on the variant, and it stays there when the search starts or
  // ends. The search is selected, so that typing replaces it. A text box scrolls to the end of what
  // is selected, so it scrolls back to show the start of a long name.
  useEffect(() => {
    if (searching) {
      const input = searchRef.current!;
      input.focus();
      input.select();
      input.scrollLeft = 0;
    } else {
      selectRef.current!.focus();
    }
  }, [searching]);

  /** Shows a variant. A basic one goes back to the dropdown. */
  function show(name: string) {
    setSearch(name);
    if (BASIC_VARIANT_NAMES_SET.has(name)) {
      setSearching(false);
    }
  }

  return (
    <div className={`tw:flex tw:items-center tw:gap-[0.9em] ${FIELD_WIDTH}`}>
      <div className="tw:relative tw:min-w-0 tw:flex-1">
        {searching ? (
          <>
            <SuggestBox
              className="tw:pr-[2.75em]"
              id="create-game-variant-dropdown2"
              onBlur={(event) => {
                // Show the start of a long name.
                event.currentTarget.scrollLeft = 0;
                if (doesVariantExist(search.trim())) {
                  onChange(search.trim());
                }
              }}
              onPick={(name) => {
                show(name);
                onChange(name);
              }}
              onType={(name) => {
                show(name);
                if (BASIC_VARIANT_NAMES_SET.has(name)) {
                  onChange(name);
                } else {
                  onSearch(name);
                }
              }}
              ref={searchRef}
              suggest={suggestVariants}
              value={search}
            >
              {/* Clicks go through the icon to the text box. */}
              <i className="fas fa-magnifying-glass tw:pointer-events-none tw:absolute tw:top-1/2 tw:right-4 tw:-translate-y-1/2" />
            </SuggestBox>
          </>
        ) : (
          <select
            className="tw:w-full"
            id="create-game-variant-dropdown1"
            onChange={(event) => {
              if (event.target.value === SEARCH_VARIANTS) {
                setSearch("");
                setSearching(true);
              } else {
                onChange(event.target.value);
              }
            }}
            ref={selectRef}
            value={
              BASIC_VARIANT_NAMES_SET.has(variantName)
                ? variantName
                : DEFAULT_VARIANT_NAME
            }
          >
            {BASIC_VARIANT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <hr />
            <option value={SEARCH_VARIANTS}>{SEARCH_VARIANTS}</option>
          </select>
        )}
      </div>
      {searching && (
        <button
          aria-label="Choose a random variant"
          className="tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:text-[1.2em] tw:text-green-text tw:hover:text-(--dice-hover)"
          onClick={() => {
            const name = getRandomArrayElement(VARIANT_NAMES);
            show(name);
            onChange(name);
          }}
          ref={tooltipRef("Choose a random variant")}
          type="button"
        >
          <i className="fas fa-dice" id="dice" />
        </button>
      )}
    </div>
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
  help,
  icon,
  id,
  onChange,
}: {
  readonly checked: boolean;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
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
      className="lobby-row"
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

/** A text box that turns red and explains why in a tooltip while its value is invalid. */
function CheckedInput({
  className,
  error,
  onChange,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "ref" | "type"> & {
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const tooltip = useRef<Tooltip>(undefined);

  useEffect(() => {
    const created = new Tooltip(ref.current!, { content: "" });
    tooltip.current = created;
    return () => {
      created.destroy();
      tooltip.current = undefined;
    };
  }, []);

  // The fields depend on each other, and a change can move this one, so each render opens the
  // tooltip again at the field.
  useEffect(() => {
    const shown = tooltip.current!;
    if (error === undefined) {
      shown.close();
    } else {
      shown.setContent(escapeHtml(error));
      shown.open();
    }
  });

  return (
    <input
      {...props}
      className={[
        className,
        error !== undefined
          && "tw:border-2 tw:border-solid tw:border-(--error)",
      ]
        .filter(Boolean)
        .join(" ")}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      ref={ref}
      type="text"
    />
  );
}
