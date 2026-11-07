import { errorDetails } from "@hanabi-live/data";
import { isArray } from "complete-common";
import type { SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { LobbyConnection } from "../connection";
import { DialogField } from "./DialogField";

export function ReplayPanel({
  connection,
  disabled,
}: {
  connection: LobbyConnection;
  disabled: boolean;
}) {
  const [source, setSource] = useState(() =>
    localStorage.getItem("watchReplaySource") === "json" ? "json" : "id",
  );
  const [id, setID] = useState(
    () => localStorage.getItem("watchReplayID") ?? "",
  );
  const [json, setJSON] = useState(
    () => localStorage.getItem("watchReplayJSON") ?? "",
  );
  const [visibility, setVisibility] = useState(() =>
    localStorage.getItem("watchReplayVisibility") === "shared"
      ? "shared"
      : "solo",
  );
  const [error, setError] = useState("");
  const idInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    (source === "id" ? idInput.current : jsonInput.current)?.select();
  }, [source]);
  function submit(event: SubmitEvent) {
    event.preventDefault();
    setError("");
    localStorage.setItem("watchReplaySource", source);
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
      localStorage.setItem("watchReplayID", String(databaseID));
      localStorage.setItem("watchReplayVisibility", visibility);
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
      } catch (error_) {
        setError(errorDetails(error_, "Parsing replay JSON"));
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
      localStorage.setItem("watchReplayJSON", json);
      localStorage.setItem("watchReplayVisibility", visibility);
      connection.send("replayCreate", {
        source,
        gameJSON,
        visibility,
        shadowingPlayerIndex: -1,
      });
    }
  }
  return (
    <form className="classic-dialog-form" onSubmit={submit}>
      <div aria-label="Source" className="row" role="radiogroup">
        <div className="col-3 input-text">
          <div className="create-game-icon">
            <i aria-hidden="true" className="fas fa-database" />
          </div>{" "}
          Source
        </div>
        {(
          [
            ["id", "Database ID"],
            ["json", "JSON Data"],
          ] as const
        ).map(([value, label]) => (
          <div className="col-4" key={value}>
            <input
              aria-label={label}
              checked={source === value}
              id={`replay-source-${value}`}
              name="replay-source"
              onChange={() => setSource(value)}
              type="radio"
            />
            <label className="replay-radio" htmlFor={`replay-source-${value}`}>
              <span className="replay-radio-label">{label}</span>
            </label>
          </div>
        ))}
      </div>
      {source === "id" ? (
        <DialogField icon="fingerprint" label="ID" width={8}>
          <input
            aria-label="Game ID or replay link"
            id="replay-id"
            onChange={(event) => setID(event.target.value)}
            ref={idInput}
            type="text"
            value={id}
          />
        </DialogField>
      ) : (
        <DialogField icon="table" label="JSON" width={8}>
          <textarea
            aria-label="Replay JSON"
            id="replay-json"
            maxLength={3_000_000}
            onChange={(event) => setJSON(event.target.value)}
            ref={jsonInput}
            rows={3}
            value={json}
          />
        </DialogField>
      )}
      {error && (
        <div className="row">
          <div className="col-3" />
          <div className="col-8" id="replay-error-row-text" role="alert">
            {error}
          </div>
        </div>
      )}
      <div aria-label="Visibility" className="row" role="radiogroup">
        <div className="col-3 input-text">
          <div className="create-game-icon">
            <i aria-hidden="true" className="fas fa-users" />
          </div>{" "}
          Visibility
        </div>
        {(["solo", "shared"] as const).map((value) => (
          <div className="col-4" key={value}>
            <input
              aria-label={value === "solo" ? "Solo" : "Shared"}
              checked={visibility === value}
              id={`replay-visibility-${value}`}
              name="replay-visibility"
              onChange={() => setVisibility(value)}
              type="radio"
            />
            <label
              className="replay-radio"
              htmlFor={`replay-visibility-${value}`}
            >
              <span className="replay-radio-label">
                {value === "solo" ? "Solo" : "Shared"}
              </span>
            </label>
          </div>
        ))}
      </div>
      <div className="row">
        <div className="col-12">
          <button
            aria-label="Open replay"
            className="button fit"
            disabled={disabled}
            type="submit"
          >
            <i aria-hidden="true" className="fas fa-eye" />
            {"\u{A0}"} Watch
          </button>
        </div>
      </div>
    </form>
  );
}
