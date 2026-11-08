// The tables and the score chart on the server's public pages, such as a player's history or a
// seed. The pages load jQuery, its table plugins, Tooltipster, and Chart.js as globals.

import {
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
  ajaxUrl?: string;
  customAjaxUrl?: (table: unknown, url: string) => string;
  ajaxObject?: { dataType: "json"; error: () => void };
  ajaxProcessing?: (
    data: unknown,
  ) => readonly [number, ReadonlyArray<readonly string[]>];
}

declare global {
  interface JQuery {
    tablesorter: (options: object) => JQuery;
    tablesorterPager: (options: TablesorterPager) => JQuery;
  }

  interface JQueryStatic {
    tablesorter: { addParser: (parser: TablesorterParser) => void };
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

/** The query that the pager fills in to request a page of games. */
const PAGE_QUERY = "?page={page}&size={size}&{sortList:col}&{filterList:fcol}";

$(document).ready(() => {
  init().catch(showError);
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

  const pager: TablesorterPager = {
    container: $(".pager"),
    output: "{startRow} - {endRow} / {filteredRows} ({totalRows})",
    fixedHeight: true,
    removeRows: false,
    cssGoto: ".gotoPage",
  };

  const { apiPath } = main.dataset;
  if (apiPath === undefined || apiPath === "") {
    table
      .tablesorter({
        widgets: ["zebra", "filter"],
        sortList: mode === "scores" ? [[0, 0]] : [[0, 1]],
      })
      .tablesorterPager(pager);
    return;
  }

  const spinner = $("div.tableSpinner");
  try {
    const response = await fetch("/api/v1/variants");
    if (!response.ok) {
      throw new Error("Unable to load variants.");
    }
    const variants = variantNamesSchema.parse(await response.json());

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

    pager.ajaxUrl = `${apiPath}${PAGE_QUERY}`;
    pager.customAjaxUrl = (_table, url) => {
      spinner.css("display", "flex");
      return url;
    };
    pager.ajaxObject = { dataType: "json", error: showError };
    pager.ajaxProcessing = (data) => {
      const result = publicGamePageSchema.safeParse(data);
      if (!result.success) {
        showError();
        return [0, []];
      }
      spinner.hide();
      $("#history-error").prop("hidden", true);
      return [result.data.total_rows, gameRows(result.data, mode, variants)];
    };

    table
      .tablesorter({
        headers,
        sortList: [[mode === "history" ? 0 : 2, 1]],
        widgets: ["zebra", "filter"],
        widgetOptions: {
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
      .tablesorterPager(pager);
  } catch {
    showError();
  }
}

function showError() {
  $("div.tableSpinner").hide();
  $("#history-error")
    .text("Unable to load games. Please reload to try again.")
    .prop("hidden", false);
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
