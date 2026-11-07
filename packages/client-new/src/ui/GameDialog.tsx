import type { Settings } from "@hanabi-live/data";
import {
  DEFAULT_CREATE_TABLE_MAX_PLAYERS,
  errorDetails,
} from "@hanabi-live/data";
import {
  VARIANT_NAMES,
  getMinEfficiencyByNumPlayers,
  getVariant,
  isHardVariant,
  isValidNumPlayers,
} from "@hanabi-live/game";
import { getRandomArrayElement, isArray } from "complete-common";
import type { SubmitEvent } from "react";
import { Fragment, useState } from "react";
import type { LobbyConnection } from "../connection";
import type { Pregame, Welcome } from "../protocol";
import { DialogField } from "./DialogField";
import { Modal } from "./Modal";

export const optionFlags = [
  ["cardCycle", "Card cycling", "Allow cards to cycle back into the deck."],
  ["deckPlays", "Bottom-deck blind plays", "Play from the bottom of the deck."],
  ["emptyClues", "Empty clues", "Allow clues that touch no cards."],
  ["oneExtraCard", "One extra card", "Start with a larger hand."],
  ["oneLessCard", "One less card", "Start with a smaller hand."],
  ["allOrNothing", "All or nothing", "Only a perfect score counts."],
  [
    "detrimentalCharacters",
    "Characters",
    "Give each player a special restriction.",
  ],
] as const;
type Flag = (typeof optionFlags)[number][0];
const basicVariants: readonly string[] = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
];
const settingNames: Record<Flag, keyof Settings> = {
  cardCycle: "createTableCardCycle",
  deckPlays: "createTableDeckPlays",
  emptyClues: "createTableEmptyClues",
  oneExtraCard: "createTableOneExtraCard",
  oneLessCard: "createTableOneLessCard",
  allOrNothing: "createTableAllOrNothing",
  detrimentalCharacters: "createTableDetrimentalCharacters",
};
const optionAppearance = {
  speedrun: ["Speedrun", "running", "features.md#speedruns"],
  cardCycle: ["Card Cycling", "sync-alt", "features.md#card-cycling"],
  deckPlays: [
    "Bottom-Deck Blind-Plays",
    "blind",
    "features.md#bottom-deck-blind-plays",
  ],
  emptyClues: ["Empty Clues", "expand", "features.md#empty-clues"],
  oneExtraCard: ["One Extra Card", "plus-circle", "features.md#one-extra-card"],
  oneLessCard: ["One Less Card", "minus-circle", "features.md#one-less-card"],
  allOrNothing: ["All or Nothing", "layer-group", "features.md#all-or-nothing"],
  detrimentalCharacters: ["Detrimental Characters", "flushed", "characters.md"],
} as const;

export function GameDialog({
  connection,
  welcome,
  game,
  close,
}: {
  connection: LobbyConnection;
  welcome: Welcome;
  game?: Pregame;
  close: () => void;
}) {
  const preferences = welcome.settings;
  const [tableID] = useState(game?.tableID);
  const editing = tableID !== undefined;
  const [name, setName] = useState(game?.name ?? `${welcome.username}'s table`);
  const [variant, setVariant] = useState(
    game?.options.variantName ?? preferences.createTableVariant,
  );
  const [searchVariants, setSearchVariants] = useState(
    () => !basicVariants.includes(variant),
  );
  const [maxPlayers, setMaxPlayers] = useState(
    game?.maxPlayers ?? preferences.createTableMaxPlayers,
  );
  const [password, setPassword] = useState(
    () => localStorage.getItem("createTablePassword") ?? "",
  );
  const [timed, setTimed] = useState(
    game?.options.timed ?? preferences.createTableTimed,
  );
  const [speedrun, setSpeedrun] = useState(
    game?.options.speedrun ?? preferences.createTableSpeedrun,
  );
  const [minutes, setMinutes] = useState(
    String(
      game?.options.timed === true
        ? game.options.timeBase / 60
        : preferences.createTableTimeBaseMinutes,
    ),
  );
  const [seconds, setSeconds] = useState(
    String(
      game?.options.timed === true
        ? game.options.timePerTurn
        : preferences.createTableTimePerTurnSeconds,
    ),
  );
  const [flags, setFlags] = useState<Record<Flag, boolean>>({
    cardCycle: game?.options.cardCycle ?? preferences.createTableCardCycle,
    deckPlays: game?.options.deckPlays ?? preferences.createTableDeckPlays,
    emptyClues: game?.options.emptyClues ?? preferences.createTableEmptyClues,
    oneExtraCard:
      game?.options.oneExtraCard ?? preferences.createTableOneExtraCard,
    oneLessCard:
      game?.options.oneLessCard ?? preferences.createTableOneLessCard,
    allOrNothing:
      game?.options.allOrNothing ?? preferences.createTableAllOrNothing,
    detrimentalCharacters:
      game?.options.detrimentalCharacters
      ?? preferences.createTableDetrimentalCharacters,
  });
  const [json, setJSON] = useState("");
  const [extraOptions, setExtraOptions] = useState(
    () => speedrun || Object.values(flags).some(Boolean),
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const variants = VARIANT_NAMES.filter((value) =>
    value.toLowerCase().includes(variant.toLowerCase()),
  ).slice(0, 100);
  function savePreference(
    key: keyof Settings,
    value: Settings[keyof Settings],
  ) {
    if (preferences[key] !== value) {
      connection.setting(key, value);
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (editing && game?.tableID !== tableID) {
      setError(
        "This table is no longer available. Your changes have not been submitted.",
      );
      return;
    }
    if (VARIANT_NAMES.every((value) => value !== variant)) {
      setError("Choose a variant from the suggestions.");
      return;
    }
    const base = Number(minutes);
    const perTurn = Number(seconds);
    if (
      !Number.isFinite(base)
      || base < 0
      || !Number.isSafeInteger(perTurn)
      || perTurn < 0
      || (timed && base === 0 && perTurn === 0)
    ) {
      setError(
        "Enter a nonnegative base time and whole seconds per turn. Timed games need some time.",
      );
      return;
    }
    let gameJSON: unknown;
    if (json.trim()) {
      try {
        gameJSON = JSON.parse(json);
      } catch (error_) {
        setError(errorDetails(error_, "Parsing custom game JSON"));
        return;
      }
      if (
        typeof gameJSON !== "object"
        || gameJSON === null
        || isArray(gameJSON)
      ) {
        setError("Custom game JSON must be an object.");
        return;
      }
    }
    const options = {
      variantName: variant,
      timed,
      speedrun,
      timeBase: Math.round(base * 60),
      timePerTurn: perTurn,
      ...flags,
    };
    const payload = editing
      ? { tableID, name, maxPlayers, options }
      : {
          name,
          maxPlayers,
          options,
          password,
          ...(gameJSON !== undefined && { gameJSON }),
        };
    setError("");
    setSubmitting(true);
    if (
      !connection.send(
        editing ? "tableUpdate" : "tableCreate",
        payload,
        (message) => {
          setSubmitting(false);
          setError(message);
        },
        close,
      )
    ) {
      setSubmitting(false);
      return;
    }
    if (!editing) {
      localStorage.setItem("createTablePassword", password);
    }
    const changed: Array<[keyof Settings, Settings[keyof Settings]]> = [
      ["createTableVariant", variant],
      ["createTableMaxPlayers", maxPlayers],
      ["createTableTimed", timed],
      ["createTableSpeedrun", speedrun],
      ["createTableTimeBaseMinutes", base],
      ["createTableTimePerTurnSeconds", perTurn],
      ...optionFlags.map(
        ([key]) => [settingNames[key], flags[key]] as [keyof Settings, boolean],
      ),
    ];
    for (const [key, value] of changed) {
      if (preferences[key] !== value) {
        connection.setting(key, value);
      }
    }
  }

  function option(key: Flag | "speedrun") {
    const [label, icon, help] = optionAppearance[key];
    const disabled =
      (key === "oneExtraCard" && flags.oneLessCard && !flags.oneExtraCard)
      || (key === "oneLessCard" && flags.oneExtraCard && !flags.oneLessCard);
    const id = key === "speedrun" ? "createTableSpeedrun" : settingNames[key];
    return (
      <div className={`row ${disabled ? "option-disabled" : ""}`} key={key}>
        <div className="col-8 col-10-narrow create-game-text-label">
          <div className="create-game-icon">
            <i aria-hidden="true" className={`fas fa-${icon}`} />
          </div>{" "}
          {label}
        </div>
        <div className="col-2 col-1-narrow">
          <input
            aria-label={
              key === "speedrun"
                ? "Speedrun"
                : optionFlags.find(([flag]) => flag === key)?.[1]
            }
            checked={key === "speedrun" ? speedrun : flags[key]}
            className="classic-checkbox"
            disabled={disabled}
            id={id}
            onChange={(event) => {
              const { checked } = event.target;
              if (key === "speedrun") {
                setSpeedrun(checked);
                savePreference("createTableSpeedrun", checked);
              } else {
                setFlags((current: Readonly<Record<Flag, boolean>>) => ({
                  ...current,
                  [key]: checked,
                  ...(key === "oneExtraCard"
                    && checked && { oneLessCard: false }),
                  ...(key === "oneLessCard"
                    && checked && { oneExtraCard: false }),
                }));
                savePreference(settingNames[key], checked);
                if (checked && key === "oneExtraCard" && flags.oneLessCard) {
                  savePreference("createTableOneLessCard", false);
                }
                if (checked && key === "oneLessCard" && flags.oneExtraCard) {
                  savePreference("createTableOneExtraCard", false);
                }
              }
            }}
            type="checkbox"
          />
          <label htmlFor={id} />
        </div>
        <div className="col-2 col-1-narrow align-center">
          <a
            aria-label={`${label} help`}
            href={`https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/${help}`}
            rel="noreferrer"
            target="_blank"
          >
            <i
              aria-hidden="true"
              className="fas fa-question-circle question-mark create-game-info-icon"
            />
          </a>
        </div>
      </div>
    );
  }
  return (
    <Modal
      close={() => {
        if (submitting) {
          setError(
            "Waiting for the server to confirm this request. It cannot be cancelled after sending.",
          );
        } else {
          close();
        }
      }}
      description={
        editing
          ? "Update the options before the first card is dealt."
          : "Choose your game. Your next teammates will find you in the lobby."
      }
      id="create-game-modal"
      initialFocus='[aria-label="Variant"]'
      title={editing ? "Change Game Options" : "Create a New Game"}
    >
      <p className="sr-only" role="status">
        {submitting ? "Waiting for the server to confirm this request." : ""}
      </p>
      <form
        aria-busy={submitting}
        className="classic-dialog-form"
        onSubmit={submit}
      >
        <fieldset disabled={submitting} style={{ display: "contents" }}>
          <DialogField icon="signature" label="Name">
            <input
              aria-label="Table name"
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              required
              type="text"
              value={name}
            />
          </DialogField>
          <DialogField
            accessory={
              <>
                <div className="col-1 input-text align-center">
                  {searchVariants && (
                    <i
                      aria-disabled={submitting}
                      aria-label="Choose a random variant"
                      className="fas fa-dice"
                      id="dice"
                      onClick={() => {
                        if (!submitting) {
                          setVariant(getRandomArrayElement(VARIANT_NAMES));
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.currentTarget.click();
                        }
                      }}
                      role="button"
                      style={
                        submitting
                          ? { cursor: "wait", opacity: 0.5 }
                          : undefined
                      }
                      tabIndex={submitting ? -1 : 0}
                    />
                  )}
                </div>
                <div className="col-1 input-text align-center">
                  <a
                    aria-label="Variant help"
                    href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/variants.md"
                    rel="noreferrer"
                    target="_blank"
                  >
                    <i className="fas fa-question-circle question-mark" />
                  </a>
                </div>
              </>
            }
            icon="rainbow"
            label="Variant"
            width={7}
          >
            {searchVariants ? (
              <input
                aria-label="Variant"
                autoComplete="off"
                autoFocus
                id="create-game-variant-dropdown2"
                list="variant-suggestions"
                onBlur={() => {
                  if (VARIANT_NAMES.includes(variant)) {
                    savePreference("createTableVariant", variant);
                  }
                }}
                onChange={(event) => {
                  const { value } = event.target;
                  setVariant(value);
                  if (basicVariants.includes(value)) {
                    setSearchVariants(false);
                    savePreference("createTableVariant", value);
                  }
                }}
                required
                type="text"
                value={variant}
              />
            ) : (
              <select
                aria-label="Variant"
                onChange={(event) => {
                  if (event.target.value === "custom") {
                    setVariant("");
                    setSearchVariants(true);
                  } else {
                    setVariant(event.target.value);
                    savePreference("createTableVariant", event.target.value);
                  }
                }}
                value={variant}
              >
                {basicVariants.map((variantName) => (
                  <option key={variantName} value={variantName}>
                    {variantName}
                  </option>
                ))}
                <option disabled>{"\u{2500}".repeat(15)}</option>
                <option value="custom">Search custom variants...</option>
              </select>
            )}
            {searchVariants && (
              <div className="relative-container input-text align-center">
                <i
                  className="fas fa-search"
                  id="create-game-variant-dropdown2-icon"
                />
              </div>
            )}
            <datalist id="variant-suggestions">
              {variants.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </DialogField>
          <DialogField icon="tachometer-alt" label="Efficiency">
            <div
              className="input-text"
              id="create-game-required-efficiency"
              title="The minimum efficiency needed to get the maximum score, for each number of players. Highlighted values make this a hard variant."
            >
              <RequiredEfficiency
                oneExtraCard={flags.oneExtraCard}
                oneLessCard={flags.oneLessCard}
                variantName={variant}
              />
            </div>
          </DialogField>
          {!speedrun && (
            <div className="row" id="create-game-timed-row">
              <div className="col-3" id="create-game-timed-label">
                <div className="create-game-icon">
                  <i className="fas fa-clock" />
                </div>{" "}
                Timed
              </div>
              <div className="col-1" id="create-game-timed-container">
                <input
                  aria-label="Timed game"
                  checked={timed}
                  className="classic-checkbox"
                  id="createTableTimed"
                  onChange={(event) => {
                    setTimed(event.target.checked);
                    savePreference("createTableTimed", event.target.checked);
                  }}
                  type="checkbox"
                />
                <label htmlFor="createTableTimed" />
              </div>
              {timed && (
                <>
                  <div
                    className="col-2 input-text2 align-center"
                    id="create-game-timed-option-1"
                  >
                    Base Time
                    <br />
                    (in minutes)
                  </div>
                  <div className="col-2">
                    <input
                      aria-label="Base time (minutes)"
                      disabled={!timed}
                      min="0"
                      onBlur={() => {
                        const value = Number(minutes);
                        if (
                          minutes.trim() !== ""
                          && Number.isFinite(value)
                          && value >= 0
                        ) {
                          savePreference("createTableTimeBaseMinutes", value);
                        } else {
                          setError("Enter a nonnegative base time.");
                        }
                      }}
                      onChange={(event) => setMinutes(event.target.value)}
                      step="0.1"
                      type="text"
                      value={minutes}
                    />
                  </div>
                  <div
                    className="col-2 input-text2 align-center"
                    id="create-game-timed-option-3"
                  >
                    Time per Turn
                    <br />
                    (in seconds)
                  </div>
                  <div className="col-2">
                    <input
                      aria-label="Seconds per turn"
                      disabled={!timed}
                      min="0"
                      onBlur={() => {
                        const value = Number(seconds);
                        if (
                          seconds.trim() !== ""
                          && Number.isSafeInteger(value)
                          && value >= 0
                        ) {
                          savePreference(
                            "createTableTimePerTurnSeconds",
                            value,
                          );
                        } else {
                          setError("Enter nonnegative whole seconds per turn.");
                        }
                      }}
                      onChange={(event) => setSeconds(event.target.value)}
                      step="1"
                      type="text"
                      value={seconds}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          {!editing && (
            <DialogField icon="key" label="Password">
              <input
                aria-label="Table password"
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password (optional)"
                type="text"
                value={password}
              />
            </DialogField>
          )}
          <DialogField icon="users" label="Max Players">
            <input
              aria-label="Maximum players"
              max={6}
              min={2}
              onBlur={() => {
                if (!isValidNumPlayers(maxPlayers)) {
                  setMaxPlayers(DEFAULT_CREATE_TABLE_MAX_PLAYERS);
                }
              }}
              onChange={(event) => setMaxPlayers(Number(event.target.value))}
              required
              type="number"
              value={maxPlayers}
            />
          </DialogField>
          {!extraOptions && (
            <div className="row">
              <div className="col-12 align-center">
                <button
                  className="button small"
                  onClick={() => setExtraOptions(true)}
                  type="button"
                >
                  <i className="fas fa-plus" />
                  {"\u{A0}"} Show Extra Options
                </button>
              </div>
            </div>
          )}
          {extraOptions && (
            <>
              <div className="row">
                <div className="col-6 col-12-narrow">
                  {(
                    [
                      "speedrun",
                      "cardCycle",
                      "deckPlays",
                      "emptyClues",
                    ] as const
                  ).map(option)}
                </div>
                <div className="col-6 col-12-narrow">
                  {(
                    [
                      "oneExtraCard",
                      "oneLessCard",
                      "allOrNothing",
                      "detrimentalCharacters",
                    ] as const
                  ).map(option)}
                </div>
              </div>
              {!editing && (
                <DialogField icon="table" label="JSON">
                  <input
                    aria-label="Custom game JSON"
                    maxLength={3_000_000}
                    onChange={(event) => setJSON(event.target.value)}
                    placeholder="JSON"
                    type="text"
                    value={json}
                  />
                </DialogField>
              )}
            </>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="row">
            <div className="col-12">
              <button
                aria-label={editing ? "Update table" : "Create table"}
                className="button fit"
                id="create-game-submit"
              >
                {submitting ? "Waiting..." : editing ? "Change" : "Create"}
              </button>
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

/**
 * The minimum efficiency needed to win a variant, for each number of players, highlighting the
 * values that make it a hard variant.
 */
function RequiredEfficiency({
  variantName,
  oneExtraCard,
  oneLessCard,
}: {
  variantName: string;
  oneExtraCard: boolean;
  oneLessCard: boolean;
}) {
  // The user may still be typing the name of a custom variant.
  if (!VARIANT_NAMES.includes(variantName)) {
    return "-";
  }

  const variant = getVariant(variantName);
  const efficiencies = getMinEfficiencyByNumPlayers(
    variant,
    oneExtraCard,
    oneLessCard,
  );
  return (
    <>
      {[...efficiencies].map(([numPlayers, efficiency], index) => (
        <Fragment key={numPlayers}>
          {index > 0 && ", "}
          {numPlayers}p:{" "}
          <span
            className={
              isHardVariant(variant, efficiency)
                ? "create-game-efficiency-hard"
                : undefined
            }
          >
            {efficiency.toFixed(2)}
          </span>
        </Fragment>
      ))}
    </>
  );
}
