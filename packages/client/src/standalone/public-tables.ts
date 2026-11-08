// The tables and the score chart on the server's public pages, such as a player's history or a
// seed. The pages load jQuery, its table plugins, Tooltipster, and Chart.js as globals.

import {
  errorDetails,
  httpError,
  publicGamePageSchema,
  scoreFrequencySchema,
  variantNamesSchema,
} from "@hanabi-live/data";
import * as z from "zod";

interface TablesorterParser {
  readonly id: string;
  readonly is: () => boolean;
  readonly type: "numeric";
  readonly format: (value: string) => number;
}

interface TablesorterPager {
  container: JQuery;
  output: string;
  fixedHeight: boolean;
  removeRows: boolean;
  cssGoto: string;
}

/** The state that tablesorter keeps on a table element. */
interface TablesorterTable extends HTMLTableElement {
  readonly config?: {
    /** Each sorted column and its direction: 0 ascending, 1 descending. */
    readonly sortList: ReadonlyArray<readonly [number, number]>;
  };
}

declare global {
  interface JQuery {
    tablesorter: (options: object) => JQuery;
    tablesorterPager: (options: TablesorterPager) => JQuery;
  }

  interface JQueryStatic {
    tablesorter: {
      addParser: (parser: TablesorterParser) => void;
      /** Each column's filter text, by column index. */
      getFilters: (table: JQuery) => ReadonlyArray<string | undefined>;
    };
  }
}

declare const Chart: {
  register: (plugin: unknown) => void;
  new (canvas: HTMLCanvasElement, config: object): unknown;
};
declare const ChartDataLabels: unknown;

type PublicGamePage = z.infer<typeof publicGamePageSchema>;
type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;

const scoreFrequencies = z.array(scoreFrequencySchema);

$(document).ready(() => {
  init().catch((error: unknown) => {
    showError(errorDetails(error, "Loading the page"));
  });
});

async function init() {
  $(".tooltip").tooltipster({
    animation: "grow",
    contentAsHTML: true,
    delay: 0,
    theme: ["tooltipster-shadow", "tooltipster-shadow-big"],
  });

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

  const table = $("table.history:not(.plain)");
  if (table.length === 0) {
    return;
  }

  $.tablesorter.addParser({
    id: "current-max-score",
    is: () => false,
    type: "numeric",
    format: (value) => {
      const [score = 0, max = 0] = value.split(" / ").map(Number.parseFloat);
      return max === 0 || Number.isNaN(max) ? 0 : score / max;
    },
  });
  $.tablesorter.addParser({
    id: "date-and-time",
    is: () => false,
    type: "numeric",
    format: (value) => {
      const time = Date.parse(
        value.replace(" \u{2014} ", "T").replace(" UTC", "Z"),
      );
      return Number.isNaN(time) ? 0 : time;
    },
  });

  const { apiPath } = main.dataset;
  if (apiPath === undefined || apiPath === "") {
    // Every row is already in the page, so the pager plugin pages them itself.
    table
      .tablesorter({
        widgets: ["zebra", "filter"],
        sortList: mode === "scores" ? [[0, 0]] : [[0, 1]],
      })
      .tablesorterPager({
        container: $(".pager"),
        output: "{startRow} - {endRow} / {filteredRows} ({totalRows})",
        fixedHeight: true,
        removeRows: false,
        cssGoto: ".gotoPage",
      });
    return;
  }

  const response = await fetch("/api/v1/variants");
  if (!response.ok) {
    throw await httpError(response, "Loading the variants");
  }
  const variants = variantNamesSchema.parse(await response.json());
  initServerTable(table, apiPath, mode, variants);
}

/**
 * A table of games that the server sorts, filters, and pages. Tablesorter draws the sort and filter
 * controls, and the pager controls are driven here; each change requests the matching page.
 */
function initServerTable(
  table: JQuery,
  apiPath: string,
  mode: string | undefined,
  variants: Readonly<Record<string, string>>,
) {
  const headers: Record<number, { filter: boolean; sorter: boolean }> = {};
  table.find("th").each((index) => {
    headers[index] = { filter: false, sorter: false };
  });
  headers[0] = { filter: false, sorter: true };
  headers[1] = { filter: mode !== "seed", sorter: mode === "history" };
  headers[2] = { filter: true, sorter: true };
  if (mode === "history") {
    headers[3] = { filter: true, sorter: false };
  }

  const pagers = $(".pager");
  const spinner = $("div.tableSpinner");
  let page = 0;
  let size = Number(pagers.find(".pagesize").first().val() ?? 10);
  let totalRows = 0;
  let lastQuery: string | undefined;
  let latestRequest = 0;

  function query(): string {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
    });
    // The server sorts by one column, the first that the table is sorted by.
    const sort = (table.get(0) as TablesorterTable | undefined)?.config
      ?.sortList[0];
    if (sort !== undefined) {
      const [column, direction] = sort;
      params.append(`col[${column}]`, String(direction));
    }
    for (const [column, text] of $.tablesorter.getFilters(table).entries()) {
      if (text !== undefined && text !== "") {
        params.append(`fcol[${column}]`, text);
      }
    }
    return params.toString();
  }

  async function load() {
    const current = query();
    // Tablesorter reports sort and filter events again after the rows are replaced.
    if (current === lastQuery) {
      return;
    }
    lastQuery = current;
    latestRequest++;
    const request = latestRequest;
    spinner.css("display", "flex");
    try {
      const response = await fetch(`${apiPath}?${current}`);
      if (!response.ok) {
        throw await httpError(response, "Loading games");
      }
      const result = publicGamePageSchema.parse(await response.json());
      if (request !== latestRequest) {
        return;
      }
      totalRows = result.total_rows;
      showRows(table, gameRows(result, mode, variants));
      drawPagers();
      $("#history-error").prop("hidden", true);
      spinner.hide();
    } catch (error: unknown) {
      if (request === latestRequest) {
        // Retrying the same query must request it again.
        lastQuery = undefined;
        showError(errorDetails(error, "Loading games"));
      }
    }
  }

  function reload() {
    load().catch((error: unknown) => {
      showError(errorDetails(error, "Loading games"));
    });
  }

  function lastPage(): number {
    return Math.max(0, Math.ceil(totalRows / size) - 1);
  }

  function drawPagers() {
    const start = totalRows === 0 ? 0 : page * size + 1;
    const end = Math.min(totalRows, (page + 1) * size);
    pagers.find(".pagedisplay").text(`${start} - ${end} / ${totalRows}`);
    const pages = pagers.find(".gotoPage").empty();
    for (let index = 0; index <= lastPage(); index++) {
      pages.append(
        $("<option>")
          .val(index)
          .text(index + 1),
      );
    }
    pages.val(page);
    pagers.find(".pagesize").val(size);
  }

  function goTo(target: number) {
    page = Math.min(Math.max(0, target), lastPage());
    reload();
  }

  pagers.find(".first").on("click", () => {
    goTo(0);
  });
  pagers.find(".prev").on("click", () => {
    goTo(page - 1);
  });
  pagers.find(".next").on("click", () => {
    goTo(page + 1);
  });
  pagers.find(".last").on("click", () => {
    goTo(lastPage());
  });
  pagers.find(".gotoPage").on("change", function onChange(this: HTMLElement) {
    goTo(Number($(this).val()));
  });
  pagers.find(".pagesize").on("change", function onChange(this: HTMLElement) {
    size = Number($(this).val());
    page = 0;
    reload();
  });

  table
    .tablesorter({
      headers,
      serverSideSorting: true,
      sortList: [[mode === "history" ? 0 : 2, 1]],
      widgets: ["zebra", "filter"],
      widgetOptions: {
        filter_serversideFiltering: true,
        filter_selectSource: {
          1: [2, 3, 4, 5, 6].map((value) => ({
            text: String(value),
            value: String(value),
          })),
          3: Object.entries(variants).map(([value, text]) => ({
            value,
            text,
          })),
        },
      },
    })
    .on("sortEnd filterEnd", () => {
      // A new sort or filter starts again from the first page.
      if (query() !== lastQuery) {
        page = 0;
      }
      reload();
    });
  reload();
}

function showRows(table: JQuery, rows: ReadonlyArray<readonly string[]>) {
  const body = table.find("tbody").empty();
  for (const cells of rows) {
    const row = $("<tr>");
    for (const cell of cells) {
      row.append($("<td>").html(cell));
    }
    body.append(row);
  }
  // Tablesorter stripes the new rows; the server has already sorted them.
  table.trigger("update", [false]);
}

function showError(message: string) {
  $("div.tableSpinner").hide();
  $("#history-error").text(message).prop("hidden", false);
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
function barColor(row: ScoreFrequency, best: boolean, index: number): string {
  if (row.score === 0) {
    return "#aa5555";
  }
  if (best) {
    return "#00aa00";
  }
  return ["#99bbff", "#3366ff", "#6699ff"][index % 3] ?? "#99bbff";
}

/** Each game's table cells, as HTML. */
function gameRows(
  page: PublicGamePage,
  mode: string | undefined,
  variants: Readonly<Record<string, string>>,
): ReadonlyArray<readonly string[]> {
  return page.rows.map((game) => {
    const names = game.users.split(", ");
    const row = [
      link(`/replay/${game.id}`, game.id),
      escaped(game.num_players),
      escaped(game.score),
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
      escaped(game.datetime),
    );
    if (mode !== "seed") {
      row.push(
        link(
          `/seed/${encodeURIComponent(game.seed)}`,
          mode === "variant" ? game.seed : (game.other_scores ?? ""),
        ),
      );
    }
    return row;
  });
}

function escaped(value: string | number): string {
  return $("<span>").text(String(value)).html();
}

function link(href: string, value: string | number): string {
  return (
    $("<a>").attr("href", href).text(String(value)).get(0)?.outerHTML ?? ""
  );
}
