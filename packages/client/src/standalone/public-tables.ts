// The tables and the score chart on the server's public pages, such as a player's history or a
// seed. The pages load Chart.js as a global.

import {
  errorDetails,
  GameListColumn,
  httpError,
  publicGamePageSchema,
  scoreFrequencySchema,
  variantNamesSchema,
} from "@hanabi-live/data";
import { MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import * as z from "zod";
import { hoverTooltip } from "../Tooltip";
import type { Choice, Column, Sort } from "./data-table";
import { addTableControls, Pagers } from "./data-table";

declare const Chart: {
  register: (plugin: unknown) => void;
  new (canvas: HTMLCanvasElement, config: object): unknown;
};
declare const ChartDataLabels: unknown;

type PublicGamePage = z.infer<typeof publicGamePageSchema>;
type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;

const scoreFrequencies = z.array(scoreFrequencySchema);

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

init().catch((error: unknown) => {
  showError(errorDetails(error, "Loading the page"));
});

async function init() {
  for (const anchor of document.querySelectorAll<HTMLElement>(".tooltip")) {
    hoverTooltip(anchor);
  }

  const main = document.querySelector("#main");
  if (!(main instanceof HTMLElement)) {
    return;
  }
  const mode = main.dataset["page"];

  const chart = document.querySelector("#scoreFreqs");
  if (chart instanceof HTMLCanvasElement) {
    drawScoreChart(
      chart,
      scoreFrequencies.parse(JSON.parse(chart.dataset["frequencies"] ?? "[]")),
    );
  }

  if (mode === "missing-scores") {
    initMissingScoresFilters();
  }

  const table = document.querySelector("table.history:not(.plain)");
  if (!(table instanceof HTMLTableElement)) {
    return;
  }

  const { apiPath } = main.dataset;
  if (apiPath === undefined || apiPath === "") {
    initLocalTable(table, localSort(mode));
    return;
  }

  const response = await fetch("/api/v1/variants");
  if (!response.ok) {
    throw await httpError(response, "Loading the variants");
  }
  const variants = variantNamesSchema.parse(await response.json());
  initServerTable(table, apiPath, mode, variants);
}

function localSort(mode: string | undefined): Sort | undefined {
  switch (mode) {
    case "missing-scores": {
      return undefined;
    }

    case "scores": {
      return { column: 0, descending: false };
    }

    default: {
      return { column: 0, descending: true };
    }
  }
}

/**
 * A table whose rows are all in the page. Each header's `data-sort="none"` turns off its sorting,
 * `data-sort="ratio"` sorts "score / max" cells by their ratio, and `data-filter` is "none",
 * "select" (a choice of the column's values), or a text filter by default.
 */
function initLocalTable(
  table: HTMLTableElement,
  initialSort: Sort | undefined,
) {
  const body = table.tBodies[0];
  if (body === undefined) {
    return;
  }
  const rows = [...body.rows];
  const headers = [...(table.tHead?.rows[0]?.cells ?? [])];
  const columns: Column[] = headers.map((header, index) => ({
    sortable: header.dataset["sort"] !== "none",
    filter: localFilter(header.dataset["filter"], () => [
      ...new Set(rows.map((row) => cellText(row, index))),
    ]),
  }));
  const ratios = new Set(
    headers.flatMap((header, index) =>
      header.dataset["sort"] === "ratio" ? index : [],
    ),
  );

  function compare(
    a: HTMLTableRowElement,
    b: HTMLTableRowElement,
    column: number,
  ) {
    const [first, second] = [cellText(a, column), cellText(b, column)];
    return ratios.has(column)
      ? ratio(first) - ratio(second)
      : collator.compare(first, second);
  }

  function draw() {
    const filters = [...controls.filters()];
    let shown = rows.filter((row) =>
      filters.every(([column, value]) => {
        const cell = cellText(row, column);
        return columns[column]?.filter === "text"
          ? cell.toLowerCase().includes(value.toLowerCase())
          : collator.compare(cell, value) === 0;
      }),
    );
    const sort = controls.sort();
    if (sort !== undefined) {
      const direction = sort.descending ? -1 : 1;
      shown = shown.toSorted((a, b) => direction * compare(a, b, sort.column));
    }
    const start = pagers.start(shown.length);
    body?.replaceChildren(...shown.slice(start, start + pagers.size));
    pagers.draw(shown.length, `${shown.length} (${rows.length})`);
  }

  const pagers = new Pagers(draw);
  const controls = addTableControls(table, columns, initialSort, () => {
    pagers.page = 0;
    draw();
  });
  draw();
}

function localFilter(
  filter: string | undefined,
  values: () => readonly string[],
): Column["filter"] {
  switch (filter) {
    case "none": {
      return "none";
    }

    case "select": {
      return values()
        .toSorted((a, b) => collator.compare(a, b))
        .map((value) => ({ value, text: value }));
    }

    default: {
      return "text";
    }
  }
}

function cellText(row: HTMLTableRowElement, column: number): string {
  return row.cells[column]?.textContent.trim() ?? "";
}

/** The ratio of a "score / max" cell, or 0 if it has no maximum. */
function ratio(value: string): number {
  const [score = 0, max = 0] = value.split(" / ").map(Number.parseFloat);
  return max === 0 || Number.isNaN(max) || Number.isNaN(score)
    ? 0
    : score / max;
}

/** A table of games that the server sorts, filters, and pages. Each change requests that page. */
function initServerTable(
  table: HTMLTableElement,
  apiPath: string,
  mode: string | undefined,
  variants: Readonly<Record<string, string>>,
) {
  const playerCounts: Choice[] = Array.from(
    iRange(MIN_PLAYERS, MAX_PLAYERS),
    (value) => ({
      value: String(value),
      text: String(value),
    }),
  );
  const variantChoices: Choice[] = Object.entries(variants).map(
    ([value, text]) => ({ value, text }),
  );
  const columns: Column[] = [...(table.tHead?.rows[0]?.cells ?? [])].map(
    () => ({ sortable: false, filter: "none" }),
  );
  columns[GameListColumn.Id] = { sortable: true, filter: "none" };
  columns[GameListColumn.NumPlayers] = {
    sortable: mode === "history",
    filter: mode === "seed" ? "none" : playerCounts,
  };
  columns[GameListColumn.Score] = { sortable: true, filter: "text" };
  if (mode === "history") {
    columns[GameListColumn.Variant] = {
      sortable: false,
      filter: variantChoices,
    };
  }

  const spinner = document.querySelector<HTMLElement>("div.tableSpinner");
  let totalRows = 0;
  let latestRequest = 0;

  function query(): string {
    const params = new URLSearchParams({
      page: String(pagers.page),
      size: String(pagers.size),
    });
    const sort = controls.sort();
    if (sort !== undefined) {
      params.append(`col[${sort.column}]`, sort.descending ? "1" : "0");
    }
    for (const [column, value] of controls.filters()) {
      params.append(`fcol[${column}]`, value);
    }
    return params.toString();
  }

  async function load() {
    pagers.start(totalRows);
    latestRequest++;
    const request = latestRequest;
    if (spinner !== null) {
      spinner.style.display = "flex";
    }
    try {
      const response = await fetch(`${apiPath}?${query()}`);
      if (!response.ok) {
        throw await httpError(response, "Loading games");
      }
      const result = publicGamePageSchema.parse(await response.json());
      if (request !== latestRequest) {
        return;
      }
      ({ totalRows } = result);
      showRows(table, gameRows(result, mode, variants));
      pagers.draw(totalRows, String(totalRows));
      const error = document.querySelector<HTMLElement>("#history-error");
      if (error !== null) {
        error.hidden = true;
      }
      if (spinner !== null) {
        spinner.style.display = "none";
      }
    } catch (error: unknown) {
      if (request === latestRequest) {
        showError(errorDetails(error, "Loading games"));
      }
    }
  }

  function reload() {
    load().catch((error: unknown) => {
      showError(errorDetails(error, "Loading games"));
    });
  }

  const pagers = new Pagers(reload);
  const controls = addTableControls(
    table,
    columns,
    {
      column: mode === "history" ? GameListColumn.Id : GameListColumn.Score,
      descending: true,
    },
    () => {
      // A new sort or filter starts again from the first page.
      pagers.page = 0;
      reload();
    },
  );
  reload();
}

function showRows(
  table: HTMLTableElement,
  rows: ReadonlyArray<ReadonlyArray<Node | string>>,
) {
  table.tBodies[0]?.replaceChildren(
    ...rows.map((cells) => {
      const row = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.append(cell);
        row.append(td);
      }
      return row;
    }),
  );
}

function showError(message: string) {
  const spinner = document.querySelector<HTMLElement>("div.tableSpinner");
  if (spinner !== null) {
    spinner.style.display = "none";
  }
  const error = document.querySelector<HTMLElement>("#history-error");
  if (error !== null) {
    error.textContent = message;
    error.hidden = false;
  }
}

/** The filters on the missing scores pages, which reload the page with them in its URL. */
function initMissingScoresFilters() {
  const players = document.querySelector("#filter-by-players");
  if (players instanceof HTMLSelectElement) {
    players.addEventListener("change", () => {
      const path = players.dataset["profilePath"] ?? "";
      globalThis.location.assign(
        players.value === "0" ? path : `${path}/${players.value}`,
      );
    });
  }

  const form = document.querySelector("#advanced-filters");
  const toggle = document.querySelector("#advanced-filters-toggle");
  const error = document.querySelector<HTMLElement>("#advanced-filters-error");
  if (!(form instanceof HTMLFormElement) || toggle === null || error === null) {
    return;
  }
  toggle.addEventListener("click", () => {
    const hidden = form.toggleAttribute("hidden");
    toggle.setAttribute("aria-expanded", String(!hidden));
  });
  document
    .querySelector("#advanced-filters-reset")
    ?.addEventListener("click", () => {
      globalThis.location.assign(globalThis.location.pathname);
    });

  // The filters are query parameters, which keeps the URL shareable, such as
  // "/shared-missing-scores/3/Alice/Bob/Cathy?excludePlayers=Cathy&maxEfficiency=1.5".
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    function value(id: string): string {
      return (
        document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? ""
      );
    }
    const checkboxes = [
      ...form.querySelectorAll<HTMLInputElement>(".include-player"),
    ];
    const excludedPlayers = checkboxes
      .filter((checkbox) => !checkbox.checked)
      .map((checkbox) => checkbox.value);
    const minEfficiency = value("min-efficiency");
    const maxEfficiency = value("max-efficiency");
    let problem: string | undefined;
    if (excludedPlayers.length === checkboxes.length) {
      problem = "At least one player must be included.";
    } else if (
      minEfficiency !== ""
      && maxEfficiency !== ""
      && Number(minEfficiency) > Number(maxEfficiency)
    ) {
      problem =
        "The min efficiency can not be greater than the max efficiency.";
    }
    if (problem !== undefined) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    const params = new URLSearchParams();
    for (const [name, text] of [
      ["excludePlayers", excludedPlayers.join(",")],
      ["excludeVariants", value("exclude-variants")],
      ["minEfficiency", minEfficiency],
      ["maxEfficiency", maxEfficiency],
    ] as const) {
      if (text !== "") {
        params.set(name, text);
      }
    }
    const search = params.toString();
    globalThis.location.assign(
      globalThis.location.pathname + (search === "" ? "" : `?${search}`),
    );
  });
}

function drawScoreChart(
  canvas: HTMLCanvasElement,
  frequencies: readonly ScoreFrequency[],
): unknown {
  Chart.register(ChartDataLabels);
  return new Chart(canvas, {
    type: "bar",
    data: {
      labels: frequencies.map((row) => row.score),
      datasets: [
        {
          data: frequencies.map((row) => row.numTimes),
          backgroundColor: frequencies.map((row, i) =>
            barColor(row, i === frequencies.length - 1, i),
          ),
        },
      ],
    },
    options: {
      layout: { padding: { top: 40 } },
      plugins: {
        legend: { display: false },
        datalabels: {
          color: "#000000",
          anchor: "end",
          align: "end",
          font: { weight: "bold", size: 16 },
        },
      },
      scales: {
        x: { title: { display: true, text: "Score" } },
        y: { title: { display: true, text: "Number of games" } },
      },
    },
  });
}

/** Zero scores are red, the best score is green, and the rest alternate shades of blue. */
/** The colors that the bars of ordinary scores cycle through. */
const BAR_COLORS = ["#99bbff", "#3366ff", "#6699ff"] as const;

function barColor(row: ScoreFrequency, best: boolean, index: number): string {
  if (row.score === 0) {
    return "#aa5555";
  }
  if (best) {
    return "#00aa00";
  }
  return BAR_COLORS[index % BAR_COLORS.length] ?? BAR_COLORS[0];
}

/** Each game's table cells. */
function gameRows(
  page: PublicGamePage,
  mode: string | undefined,
  variants: Readonly<Record<string, string>>,
): ReadonlyArray<ReadonlyArray<Node | string>> {
  return page.rows.map((game) => {
    const names = game.users.split(", ");
    const row: Array<Node | string> = [
      link(`/replay/${game.id}`, game.id),
      String(game.numPlayers),
      String(game.score),
    ];
    if (mode !== "variant") {
      const variant = String(game.variant);
      row.push(
        link(
          `/variant/${encodeURIComponent(variant)}`,
          variants[variant] ?? variant,
        ),
      );
    }
    row.push(
      link(`/history/${names.map(encodeURIComponent).join("/")}`, game.users),
      displayTime(game.datetime),
    );
    if (mode !== "seed") {
      row.push(
        link(
          `/seed/${encodeURIComponent(game.seed)}`,
          mode === "variant" ? game.seed : (game.otherScores ?? ""),
        ),
      );
    }
    return row;
  });
}

/** A timestamp as the server's pages show it: the date, an em dash, and the time in UTC. */
function displayTime(timestamp: string): string {
  // Drop the fractional seconds and the time zone from the ISO 8601 timestamp.
  const match = /^([^T]+)T([^.Z]+)/u.exec(timestamp);
  if (match === null) {
    return timestamp;
  }
  const [, date, time] = match;
  return `${date} \u{2014} ${time} UTC`;
}

function link(href: string, value: string | number): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = String(value);
  return anchor;
}
