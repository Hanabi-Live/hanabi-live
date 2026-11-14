// The filters of the missing scores pages. They are query parameters, which keeps the URL
// shareable, so the page reloads to apply them.

import type { publicPageTableSchema } from "@hanabi-live/data";
import { MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { useState } from "react";
import type * as z from "zod";
import { tooltipRef } from "../tooltipRef.ts";

type Filters = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "missingScores" }
>["filters"];
type SharedFilters = Extract<Filters, { type: "shared" }>;

export function MissingScoresFilters({
  filters,
}: {
  readonly filters: Filters;
}): React.JSX.Element {
  return filters.type === "player" ? (
    <PlayerCountFilter filters={filters} />
  ) : (
    <SharedFiltersForm filters={filters} />
  );
}

/** A player's page shows the variants at one player count, or at all of them. */
function PlayerCountFilter({
  filters,
}: {
  readonly filters: Extract<Filters, { type: "player" }>;
}) {
  const item = "tw:h-12 tw:leading-12";
  return (
    <>
      <ul className="horizontal">
        <li className={item}>Filter by # of Players</li>
        <li className={item}>
          <select
            aria-label="Number of players"
            defaultValue={filters.numPlayers ?? ""}
            onChange={(event) => {
              const path = `/missing-scores/${encodeURIComponent(filters.name)}`;
              const { value } = event.target;
              globalThis.location.assign(
                value === "" ? path : `${path}/${value}`,
              );
            }}
          >
            <option value="">-</option>
            {Array.from(iRange(MIN_PLAYERS, MAX_PLAYERS), (players) => (
              <option key={players} value={players}>
                {players}-Players
              </option>
            ))}
          </select>
        </li>
      </ul>
      <br />
      <br />
      <br />
    </>
  );
}

/**
 * The page of several players can leave out some of them, some variants, and the max scores outside
 * of a range of efficiencies. For example,
 * "/shared-missing-scores/3/Alice/Bob/Cathy?excludePlayers=Cathy&maxEfficiency=1.5".
 */
function SharedFiltersForm({ filters }: { readonly filters: SharedFilters }) {
  const [open, setOpen] = useState(filters.active);
  const [included, setIncluded] = useState(
    () => new Set(filters.players.flatMap((p) => (p.excluded ? [] : p.name))),
  );
  const [excludeVariants, setExcludeVariants] = useState(
    filters.excludeVariants,
  );
  const [minEfficiency, setMinEfficiency] = useState(filters.minEfficiency);
  const [maxEfficiency, setMaxEfficiency] = useState(filters.maxEfficiency);
  const [problem, setProblem] = useState<string>();

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const [min, max] = [minEfficiency.trim(), maxEfficiency.trim()];
    if (included.size === 0) {
      setProblem("At least one player must be included.");
      return;
    }
    if (min !== "" && max !== "" && Number(min) > Number(max)) {
      setProblem(
        "The min efficiency can not be greater than the max efficiency.",
      );
      return;
    }

    const params = new URLSearchParams();
    for (const [name, text] of [
      [
        "excludePlayers",
        filters.players
          .filter((player) => !included.has(player.name))
          .map((player) => player.name)
          .join(","),
      ],
      ["excludeVariants", excludeVariants.trim()],
      ["minEfficiency", min],
      ["maxEfficiency", max],
    ] as const) {
      if (text !== "") {
        params.set(name, text);
      }
    }
    const search = params.toString();
    globalThis.location.assign(
      globalThis.location.pathname + (search === "" ? "" : `?${search}`),
    );
  }

  return (
    <>
      <div className="tw:mb-4 tw:text-right">
        <button
          aria-controls="advanced-filters"
          aria-expanded={open}
          aria-label="Advanced filters"
          className={`button small${filters.active ? " primary" : ""}`}
          id="advanced-filters-toggle"
          onClick={() => {
            setOpen(!open);
          }}
          ref={tooltipRef("Advanced filters")}
          type="button"
        >
          {filters.active ? (
            <>
              <i className="fas fa-cog icon-label" />
              Filters active
            </>
          ) : (
            <i className="fas fa-cog" />
          )}
        </button>
      </div>

      <form
        className="tw:mb-8 tw:rounded-[var(--radius)] tw:border tw:border-border tw:p-6"
        hidden={!open}
        id="advanced-filters"
        onSubmit={apply}
      >
        <div className="row gtr-uniform">
          <div className="col-12">
            <strong>Players included in the calculation</strong>
            <ul className="horizontal tw:mt-2 tw:mr-0 tw:mb-0 tw:ml-0">
              {filters.players.map((player, index) => (
                <li className="tw:mr-6" key={player.name}>
                  <input
                    checked={included.has(player.name)}
                    id={`include-player-${index}`}
                    onChange={(event) => {
                      const next = new Set(included);
                      if (event.target.checked) {
                        next.add(player.name);
                      } else {
                        next.delete(player.name);
                      }
                      setIncluded(next);
                    }}
                    type="checkbox"
                  />
                  <label htmlFor={`include-player-${index}`}>
                    {player.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="col-12">
            <label htmlFor="exclude-variants">
              Exclude variants (comma-separated, matches any part of the name;
              &quot;Rainbow (3 Suits), Pink&quot; excludes one Rainbow and all
              Pink variants)
            </label>
            <input
              id="exclude-variants"
              onChange={(event) => {
                setExcludeVariants(event.target.value);
              }}
              type="text"
              value={excludeVariants}
            />
          </div>
          <EfficiencyInput
            id="min-efficiency"
            label="Min efficiency"
            onChange={setMinEfficiency}
            placeholder="e.g. 1.00"
            value={minEfficiency}
          />
          <EfficiencyInput
            id="max-efficiency"
            label="Max efficiency"
            onChange={setMaxEfficiency}
            placeholder="e.g. 1.50"
            value={maxEfficiency}
          />
          <div className="col-12">
            <p className="red" hidden={problem === undefined} role="alert">
              {problem}
            </p>
            <ul className="actions">
              <li>
                <input className="primary" type="submit" value="Apply" />
              </li>
              <li>
                <input
                  onClick={() => {
                    globalThis.location.assign(globalThis.location.pathname);
                  }}
                  type="button"
                  value="Reset"
                />
              </li>
            </ul>
          </div>
        </div>
      </form>
    </>
  );
}

function EfficiencyInput({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="col-6 col-12-mobilep">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        min="0"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        step="0.01"
        type="number"
        value={value}
      />
    </div>
  );
}
