import type { Settings } from "@hanabi-live/data";
import { VARIANT_NAMES } from "@hanabi-live/game";
import { isArray } from "complete-common";
import { ArrowRight, Shuffle } from "lucide-react";
import type { SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
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
  const [name, setName] = useState(game?.name ?? welcome.randomTableName);
  const [variant, setVariant] = useState(
    game?.options.variantName ?? preferences.createTableVariant,
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
      game
        ? game.options.timeBase / 60
        : preferences.createTableTimeBaseMinutes,
    ),
  );
  const [seconds, setSeconds] = useState(
    String(
      game?.options.timePerTurn ?? preferences.createTableTimePerTurnSeconds,
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
  const [error, setError] = useState("");
  const shuffleRequested = useRef(false);
  useEffect(() => {
    if (shuffleRequested.current) {
      setName(welcome.randomTableName);
      shuffleRequested.current = false;
    }
  }, [welcome.randomTableName]);
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
      } catch {
        setError("The custom game JSON is invalid.");
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
    if (!connection.send(game ? "tableUpdate" : "tableCreate", payload)) {
      setError(
        "Unable to send these options. Check your connection or reduce the JSON size.",
      );
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
      title={game ? "Make this table yours" : "Start something good"}
    >
      <form className="form-grid" onSubmit={submit}>
        <label>
          Table name
          <div className="input-action">
            <input
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            <button
              aria-label="Use a random table name"
              onClick={() => {
                shuffleRequested.current = connection.send("getName", {});
              }}
              type="button"
            >
              <Shuffle size={17} />
            </button>
          </div>
        </label>
        <label>
          Variant
          <input
            list="variant-suggestions"
            onChange={(event) => setVariant(event.target.value)}
            required
            value={variant}
          />
          <datalist id="variant-suggestions">
            {variants.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <small>
            Search all {VARIANT_NAMES.length.toLocaleString()} variants.
          </small>
        </label>
        <div className="form-columns">
          <label>
            Maximum players
            <select
              onChange={(event) => setMaxPlayers(Number(event.target.value))}
              value={maxPlayers}
            >
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value} players
                </option>
              ))}
            </select>
          </label>
          {!game && (
            <label>
              Table password <small>Optional</small>
              <input
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
          )}
        </div>
        <div className="form-columns">
          <label className="check">
            <input
              checked={timed}
              onChange={(event) => setTimed(event.target.checked)}
              type="checkbox"
            />
            Timed game
          </label>
          <label className="check">
            <input
              checked={speedrun}
              onChange={(event) => setSpeedrun(event.target.checked)}
              type="checkbox"
            />
            Speedrun
          </label>
        </div>
        {timed && (
          <div className="form-columns">
            <label>
              Base time (minutes)
              <input
                min="0"
                onChange={(event) => setMinutes(event.target.value)}
                step="0.1"
                type="number"
                value={minutes}
              />
            </label>
            <label>
              Seconds per turn
              <input
                min="0"
                onChange={(event) => setSeconds(event.target.value)}
                step="1"
                type="number"
                value={seconds}
              />
            </label>
          </div>
        )}
        <details>
          <summary>More ways to play</summary>
          <div className="option-list">
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
          <button onClick={close} type="button">
            Cancel
          </button>
          <button className="primary">
            {game ? "Update table" : "Create table"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
