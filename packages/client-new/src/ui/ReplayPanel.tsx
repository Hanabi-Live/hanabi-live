import { isArray } from "complete-common";
import type { SubmitEvent } from "react";
import { useState } from "react";
import type { LobbyConnection } from "../connection";

export function ReplayPanel({
  connection,
  disabled,
}: {
  connection: LobbyConnection;
  disabled: boolean;
}) {
  const [source, setSource] = useState("id");
  const [id, setID] = useState("");
  const [json, setJSON] = useState("");
  const [visibility, setVisibility] = useState("solo");
  const [error, setError] = useState("");
  function submit(event: SubmitEvent) {
    event.preventDefault();
    setError("");
    if (source === "id") {
      const match =
        /^(?:https?:\/\/[^#/?]+\/(?:shared-)?replay\/)?(\d+)(?:\/\d+)?\/?(?:[#?].*)?$/u.exec(
          id.trim(),
        );
      const databaseID = Number(match?.[1]);
      if (!Number.isSafeInteger(databaseID) || databaseID < 1) {
        setError("Enter a positive game ID or a replay link.");
        return;
      }
      connection.send("replayCreate", {
        source,
        databaseID,
        visibility,
        shadowingPlayerIndex: -1,
      });
    } else {
      let gameJSON: unknown;
      try {
        gameJSON = JSON.parse(json);
      } catch {
        setError("The replay JSON is invalid.");
        return;
      }
      if (
        typeof gameJSON !== "object"
        || gameJSON === null
        || isArray(gameJSON)
      ) {
        setError("Replay JSON must be an object.");
        return;
      }
      connection.send("replayCreate", {
        source,
        gameJSON,
        visibility,
        shadowingPlayerIndex: -1,
      });
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A SECOND LOOK</span>
          <h1>Replay the possibilities.</h1>
          <p>Study a game on your own, or bring everyone along.</p>
        </div>
      </div>
      <form className="panel form-grid replay-form" onSubmit={submit}>
        <div className="replay-choice-row">
          <span id="replay-source-label">
            <i aria-hidden="true" className="fas fa-database" /> Source
          </span>
          <div aria-labelledby="replay-source-label" role="radiogroup">
            <label>
              <input
                checked={source === "id"}
                name="replay-source"
                onChange={() => setSource("id")}
                type="radio"
              />
              Database ID
            </label>
            <label>
              <input
                checked={source === "json"}
                name="replay-source"
                onChange={() => setSource("json")}
                type="radio"
              />
              JSON Data
            </label>
          </div>
        </div>
        {source === "id" ? (
          <label>
            <span>
              <i aria-hidden="true" className="fas fa-fingerprint" /> ID
            </span>
            <input
              aria-label="Game ID or replay link"
              onChange={(event) => setID(event.target.value)}
              placeholder="For example, 2055474"
              required
              type="text"
              value={id}
            />
          </label>
        ) : (
          <>
            <label>
              Choose a replay file
              <input
                accept=".json, application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  if (file.size > 3_000_000) {
                    setError("Choose a replay smaller than 3 MB.");
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      setJSON(text);
                      setError("");
                    })
                    .catch(() => setError("Unable to read this file."));
                }}
                type="file"
              />
            </label>
            <label>
              <span>
                <i aria-hidden="true" className="fas fa-th" /> JSON
              </span>
              <textarea
                aria-label="Replay JSON"
                maxLength={3_000_000}
                onChange={(event) => setJSON(event.target.value)}
                placeholder='{"players": ["Alice", "Bob"], "seed": "..."}'
                required
                rows={3}
                value={json}
              />
            </label>
          </>
        )}
        <div className="replay-choice-row">
          <span id="replay-visibility-label">
            <i aria-hidden="true" className="fas fa-users" /> Visibility
          </span>
          <div aria-labelledby="replay-visibility-label" role="radiogroup">
            <label>
              <input
                checked={visibility === "solo"}
                name="replay-visibility"
                onChange={() => setVisibility("solo")}
                type="radio"
              />
              Solo
            </label>
            <label>
              <input
                checked={visibility === "shared"}
                name="replay-visibility"
                onChange={() => setVisibility("shared")}
                type="radio"
              />
              Shared
            </label>
          </div>
        </div>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button aria-label="Open replay" className="button" disabled={disabled}>
          <i aria-hidden="true" className="fas fa-eye" /> Watch
        </button>
      </form>
    </section>
  );
}
