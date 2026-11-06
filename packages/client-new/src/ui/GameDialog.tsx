import type { Settings } from "@hanabi-live/data";
import { errorDetails } from "@hanabi-live/data";
import { VARIANT_NAMES } from "@hanabi-live/game";
import { getRandomArrayElement, isArray } from "complete-common";
import type { SubmitEvent } from "react";
import { useState } from "react";
import type { LobbyConnection } from "../connection";
import type { Pregame, Welcome } from "../protocol";
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
  const [password, setPassword] = useState("");
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
  const variants = VARIANT_NAMES.filter((value) =>
    value.toLowerCase().includes(variant.toLowerCase()),
  ).slice(0, 100);
  function submit(event: SubmitEvent) {
    event.preventDefault();
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
    const payload = game
      ? { tableID: game.tableID, name, maxPlayers, options }
      : {
          name,
          maxPlayers,
          options,
          password,
          ...(gameJSON !== undefined && { gameJSON }),
        };
    if (
      !connection.send(game ? "tableUpdate" : "tableCreate", payload, setError)
    ) {
      return;
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
    close();
  }
  return (
    <Modal
      close={close}
      description={
        game
          ? "Update the options before the first card is dealt."
          : "Choose your game. Your next teammates will find you in the lobby."
      }
      id="create-game-modal"
      title={game ? "Change Game Options" : "Create a New Game"}
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          <span>
            <i aria-hidden="true" className="fas fa-signature" /> Name
          </span>
          <input
            aria-label="Table name"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            type="text"
            value={name}
          />
        </label>
        <label>
          <span>
            <i aria-hidden="true" className="fas fa-rainbow" /> Variant
          </span>
          <div className="classic-variant-input">
            {searchVariants ? (
              <input
                aria-label="Variant"
                autoFocus
                list="variant-suggestions"
                onChange={(event) => setVariant(event.target.value)}
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
              <button
                aria-label="Choose a random variant"
                onClick={() => setVariant(getRandomArrayElement(VARIANT_NAMES))}
                type="button"
              >
                <i aria-hidden="true" className="fas fa-dice" />
              </button>
            )}
            <a
              aria-label="Variant help"
              href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/variants.md"
              rel="noreferrer"
              target="_blank"
            >
              <i aria-hidden="true" className="fas fa-question-circle" />
            </a>
          </div>
          <datalist id="variant-suggestions">
            {variants.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </label>
        <div className="classic-timing-row">
          <label className="check">
            <i aria-hidden="true" className="fas fa-clock" /> Timed
            <input
              aria-label="Timed game"
              checked={timed}
              onChange={(event) => setTimed(event.target.checked)}
              type="checkbox"
            />
          </label>
          {timed && (
            <>
              <label>
                Base Time
                <br />
                (in minutes)
                <input
                  aria-label="Base time (minutes)"
                  disabled={!timed}
                  min="0"
                  onChange={(event) => setMinutes(event.target.value)}
                  step="0.1"
                  type="number"
                  value={minutes}
                />
              </label>
              <label>
                Time per Turn
                <br />
                (in seconds)
                <input
                  aria-label="Seconds per turn"
                  disabled={!timed}
                  min="0"
                  onChange={(event) => setSeconds(event.target.value)}
                  step="1"
                  type="number"
                  value={seconds}
                />
              </label>
            </>
          )}
        </div>
        <div className="form-columns classic-game-identity">
          <label>
            <span>
              <i aria-hidden="true" className="fas fa-users" /> Max Players
            </span>
            <input
              aria-label="Maximum players"
              max={6}
              min={2}
              onChange={(event) => setMaxPlayers(Number(event.target.value))}
              required
              type="number"
              value={maxPlayers}
            />
          </label>
          {!game && (
            <label>
              <span>
                <i aria-hidden="true" className="fas fa-key" /> Password
              </span>
              <input
                aria-label="Table password"
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password (optional)"
                type="password"
                value={password}
              />
            </label>
          )}
        </div>
        <details
          onToggle={(event) => setExtraOptions(event.currentTarget.open)}
          open={extraOptions}
        >
          <summary className="button small">
            <i
              aria-hidden="true"
              className={`fas fa-${extraOptions ? "minus" : "plus"}`}
            />{" "}
            {extraOptions ? "Hide" : "Show"} Extra Options
          </summary>
          <div className="option-list">
            <label className="check">
              <input
                checked={speedrun}
                onChange={(event) => setSpeedrun(event.target.checked)}
                type="checkbox"
              />
              Speedrun
            </label>
            {optionFlags.map(([key, title, description]) => (
              <label className="check" key={key}>
                <input
                  checked={flags[key]}
                  onChange={(event) =>
                    setFlags((current: Readonly<Record<Flag, boolean>>) => ({
                      ...current,
                      [key]: event.target.checked,
                      ...(key === "oneExtraCard"
                        && event.target.checked && { oneLessCard: false }),
                      ...(key === "oneLessCard"
                        && event.target.checked && { oneExtraCard: false }),
                    }))
                  }
                  type="checkbox"
                />
                <span>
                  {title}
                  <small>{description}</small>
                </span>
              </label>
            ))}
          </div>
          {!game && (
            <label>
              Custom game JSON
              <textarea
                maxLength={3_000_000}
                onChange={(event) => setJSON(event.target.value)}
                placeholder="Paste a custom deck or game configuration..."
                rows={5}
                value={json}
              />
            </label>
          )}
        </details>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            aria-label={game ? "Update table" : "Create table"}
            className="button"
          >
            {game ? "Change" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
