// The chart of how many games on a seed reached each score. The seed page loads Chart.js as a
// global.

import type { scoreFrequencySchema } from "@hanabi-live/data";
import { useEffect, useRef } from "react";
import type * as z from "zod";

declare const Chart: {
  register: (plugin: unknown) => void;
  new (
    canvas: HTMLCanvasElement,
    config: object,
  ): { readonly destroy: () => void };
};
declare const ChartDataLabels: unknown;

type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;

/** The font size of the count drawn above each bar, in pixels. */
const LABEL_FONT_SIZE = 16;

/** The space above the bars, which keeps the tallest bar's count in view. */
const TOP_PADDING = 2.5 * LABEL_FONT_SIZE;

/** The colors that the bars of ordinary scores cycle through. */
const BAR_COLORS = ["#99bbff", "#3366ff", "#6699ff"] as const;

/** Red */
const ZERO_SCORE_BAR_COLOR = "#aa5555";

/** Green */
const BEST_SCORE_BAR_COLOR = "#00aa00";

/** Zero scores are red, the best score is green, and the rest alternate shades of blue. */
function barColor(row: ScoreFrequency, best: boolean, index: number): string {
  if (row.score === 0) {
    return ZERO_SCORE_BAR_COLOR;
  }
  if (best) {
    return BEST_SCORE_BAR_COLOR;
  }
  return BAR_COLORS[index % BAR_COLORS.length] ?? BAR_COLORS[0];
}

export function ScoreChart({
  frequencies,
}: {
  readonly frequencies: readonly ScoreFrequency[];
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvas.current === null) {
      return undefined;
    }
    Chart.register(ChartDataLabels);
    const chart = new Chart(canvas.current, {
      type: "bar",
      data: {
        labels: frequencies.map((row) => row.score),
        datasets: [
          {
            data: frequencies.map((row) => row.numGames),
            backgroundColor: frequencies.map((row, i) =>
              barColor(row, i === frequencies.length - 1, i),
            ),
          },
        ],
      },
      options: {
        layout: { padding: { top: TOP_PADDING } },
        plugins: {
          legend: { display: false },
          datalabels: {
            color: "#000000",
            anchor: "end",
            align: "end",
            font: { weight: "bold", size: LABEL_FONT_SIZE },
          },
        },
        scales: {
          x: { title: { display: true, text: "Score" } },
          y: { title: { display: true, text: "Number of games" } },
        },
      },
    });
    return () => {
      chart.destroy();
    };
  }, [frequencies]);

  return (
    <canvas className="tw:m-auto tw:w-full tw:max-w-[700px]" ref={canvas} />
  );
}
