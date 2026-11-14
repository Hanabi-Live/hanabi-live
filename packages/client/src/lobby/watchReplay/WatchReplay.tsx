// The "Watch Specific Replay" page. It starts with what was used last time.

import { parseIntSafe } from "complete-common";
import { Fragment, useEffect, useRef, useState } from "react";
import { LOCAL_STORAGE_KEY } from "../../constants.ts";
import { globals } from "../../Globals.ts";
import { DOCS_URL, HelpLink } from "../createGame/CreateGame.tsx";
import type { GameJson } from "../gameJson.ts";
import { parseGameJson } from "../gameJson.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { replayVisibility } from "../replayVisibility.ts";

export function show(): void {
  lobbyPage.show("watchReplay");
}

export function WatchReplay(): React.JSX.Element {
  type Visibility = "solo" | "shared";
  type Source = "id" | "json";
  const [source, setSource] = useState<Source>(() =>
    localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SOURCE) === "json"
      ? "json"
      : "id",
  );
  const [gameId, setGameId] = useState(
    () => localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_ID) ?? "",
  );
  const [json, setJson] = useState(
    () => localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON) ?? "",
  );
  const [visibility, setVisibility] = useState<Visibility>(() =>
    localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY) === "shared"
      ? "shared"
      : "solo",
  );
  const [spoilerFree, setSpoilerFree] = useState(
    () =>
      localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SPOILER_FREE)
      === "true",
  );
  const [error, setError] = useState<string>();
  const gameIdRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLTextAreaElement>(null);

  // Select the field of the source, so that typing replaces what was used last time.
  useEffect(() => {
    (source === "id" ? gameIdRef : jsonRef).current!.select();
  }, [source]);

  function submit() {
    localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SOURCE, source);
    setError(undefined);

    let replay:
      { type: "saved"; gameId: number } | { type: "imported"; game: GameJson };
    if (source === "id") {
      const id = parseIntSafe(gameId);
      if (id === undefined) {
        setError("Error: The database ID must be a number.");
        return;
      }
      if (id < 1) {
        setError("Error: The database ID must be a positive number.");
        return;
      }
      localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_ID, gameId);
      replay = {
        type: "saved",
        gameId: id,
      };
    } else {
      const parsed = parseGameJson(json);
      if ("error" in parsed) {
        setError(parsed.error);
        return;
      }
      localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON, json);
      replay = {
        type: "imported",
        game: parsed.gameJson,
      };
    }

    localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY, visibility);
    localStorage.setItem(
      LOCAL_STORAGE_KEY.WATCH_REPLAY_SPOILER_FREE,
      spoilerFree.toString(),
    );

    globals.connection.send("replayCreate", {
      source: replay,
      // Only shared replays can be spoiler-free reviews.
      visibility: replayVisibility(visibility === "shared", { spoilerFree }),
    });
    lobbyPage.hide();
  }

  return (
    <>
      <h2>Watch a Specific Replay</h2>

      <div className="lobby-group">
        <h3>Replay</h3>
        <ul className="lobby-rows">
          <li className="lobby-row">
            <span className="lobby-row-text">
              <i className="fas fa-database fa-fw" />
              Source
            </span>
            <Segmented
              name="replay-source"
              onChange={setSource}
              options={[
                ["id", "Database ID"],
                ["json", "JSON Data"],
              ]}
              value={source}
            />
          </li>
          {source === "id" ? (
            <li className="lobby-row">
              <label htmlFor="replay-id">
                <i className="fas fa-fingerprint fa-fw" />
                ID
              </label>
              <input
                id="replay-id"
                inputMode="numeric"
                onChange={(event) => {
                  setGameId(event.target.value);
                }}
                placeholder="Game ID"
                ref={gameIdRef}
                type="text"
                value={gameId}
              />
            </li>
          ) : (
            // A pasted game is too long for one line, so its box goes below its description.
            <li className="lobby-row tw:flex-col tw:items-stretch tw:gap-2">
              <div className="lobby-row-label">
                <label htmlFor="replay-json">
                  <i className="fas fa-table fa-fw" />
                  JSON
                </label>
                <HelpLink
                  href={`${DOCS_URL}/features.md#json-games`}
                  text="About JSON games"
                />
              </div>
              <textarea
                className="tw:min-h-[9em] tw:resize-y"
                id="replay-json"
                onChange={(event) => {
                  setJson(event.target.value);
                }}
                // Enter adds a line here, so a modifier is needed to submit.
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                    && (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Paste the game's JSON data (Ctrl+Enter to watch)"
                ref={jsonRef}
                value={json}
              />
            </li>
          )}
        </ul>
      </div>

      <div className="lobby-group">
        <h3>Viewing</h3>
        <ul className="lobby-rows">
          <li className="lobby-row">
            <span className="lobby-row-text">
              <i className="fas fa-users fa-fw" />
              Visibility
            </span>
            <Segmented
              name="replay-visibility"
              onChange={setVisibility}
              options={[
                ["solo", "Solo"],
                ["shared", "Shared"],
              ]}
              value={visibility}
            />
          </li>
          {visibility === "shared" && (
            <li className="lobby-row">
              <div className="lobby-row-label">
                <label htmlFor="replay-spoiler-free">
                  <i className="fas fa-eye-slash fa-fw" />
                  Spoiler-free review
                </label>
                <HelpLink
                  href={`${DOCS_URL}/features.md#replays`}
                  text="About spoiler-free reviews"
                />
              </div>
              <span className="lobby-row-checkbox">
                <input
                  checked={spoilerFree}
                  id="replay-spoiler-free"
                  onChange={(event) => {
                    setSpoilerFree(event.target.checked);
                  }}
                  type="checkbox"
                />
                <label htmlFor="replay-spoiler-free" />
              </span>
            </li>
          )}
        </ul>
      </div>

      {error !== undefined && (
        <p className="tw:mx-0 tw:mt-4 tw:mb-0 tw:text-(--error)">{error}</p>
      )}

      <button
        className="button fit tw:mt-6"
        id="replay-submit"
        onClick={submit}
        type="submit"
      >
        Watch
      </button>
    </>
  );
}

/** A choice between a few options, shown as joined buttons. */
function Segmented<T extends string>({
  name,
  onChange,
  options,
  value,
}: {
  readonly name: string;
  readonly onChange: (value: T) => void;
  readonly options: ReadonlyArray<readonly [T, string]>;
  readonly value: T;
}) {
  return (
    <span className="lobby-segmented">
      {options.map(([option, label]) => {
        const id = `${name}-${option}`;
        return (
          <Fragment key={option}>
            <input
              checked={value === option}
              id={id}
              name={name}
              onChange={() => {
                onChange(option);
              }}
              type="radio"
              value={option}
            />
            <label htmlFor={id}>{label}</label>
          </Fragment>
        );
      })}
    </span>
  );
}
