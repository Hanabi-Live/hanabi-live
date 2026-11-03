import { isArray } from "complete-common";
import { ArrowRight, FileJson } from "lucide-react";
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
        /^(?:https?:\/\/[^/]+\/(?:shared-)?replay\/)?(\d+)(?:\/\d+)?\/?$/u.exec(
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
        <div aria-label="Replay source" className="filter-tabs">
          <button
            aria-pressed={source === "id"}
            onClick={() => setSource("id")}
            type="button"
          >
            Game ID or link
          </button>
          <button
            aria-pressed={source === "json"}
            onClick={() => setSource("json")}
            type="button"
          >
            <FileJson size={16} /> JSON file
          </button>
        </div>
        {source === "id" ? (
          <label>
            Game ID or replay link
            <input
              onChange={(event) => setID(event.target.value)}
              placeholder="For example, 2055474"
              required
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
              Replay JSON
              <textarea
                maxLength={3_000_000}
                onChange={(event) => setJSON(event.target.value)}
                placeholder='{"players": ["Alice", "Bob"], "seed": "..."}'
                required
                rows={10}
                value={json}
              />
            </label>
          </>
        )}
        <label>
          Who is watching?
          <select
            onChange={(event) => setVisibility(event.target.value)}
            value={visibility}
          >
            <option value="solo">Just me - private replay</option>
            <option value="shared">Everyone - shared replay table</option>
          </select>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={disabled}>
          Open replay <ArrowRight size={17} />
        </button>
      </form>
    </section>
  );
}
