// The top of a seed's page: the variant and player count of its games, their statistics, and a
// chart of how many games reached each score. A click on a score's bar shows only those games.

import type {
  scoreFrequencySchema,
  seedStatisticsSchema,
} from "@hanabi-live/data";
import { getVariantById } from "@hanabi-live/game";
import { iRange } from "complete-common";
import type * as z from "zod";
import { tooltipRef } from "../tooltipRef.ts";

type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;
type SeedStatistics = z.infer<typeof seedStatisticsSchema>;

/** The decimal places of the average score. */
const AVERAGE_SCORE_DECIMALS = 1;

/** Past this percent of the chart's width, the average's label goes on the left of its line. */
const LABEL_FLIP_PERCENT = 70;

/** The score axis labels every score that is a multiple of this, and the best score. */
const SCORE_LABEL_STEP = 5;

export function SeedSummary({
  seed,
  statistics,
  frequencies,
  selectedScore,
  onSelectScore,
}: {
  readonly seed: string;
  readonly statistics: SeedStatistics | undefined;
  readonly frequencies: readonly ScoreFrequency[];
  /** The score that the list shows only, if any. */
  readonly selectedScore: number | undefined;
  readonly onSelectScore: (score: number | undefined) => void;
}): React.JSX.Element {
  if (statistics === undefined) {
    return (
      <div className="tw:text-center">
        <h2 className="tw:mb-2">Seed {seed}</h2>
      </div>
    );
  }

  const variant = getVariantById(statistics.variantId);
  return (
    <>
      <div className="tw:text-center">
        <h2 className="tw:mb-1">{variant.name}</h2>
        <p className="tw:m-0 tw:text-text-label">
          {statistics.numPlayers} players, seed {seed}
        </p>
        <Facts statistics={statistics} />
      </div>
      <ScoreHistogram
        average={statistics.averageScore}
        frequencies={frequencies}
        maxScore={statistics.maxScore}
        onSelectScore={onSelectScore}
        selectedScore={selectedScore}
      />
    </>
  );
}

/** The statistics of the games, one short sentence on each line. */
function Facts({ statistics }: { readonly statistics: SeedStatistics }) {
  const strong = "tw:font-semibold tw:text-text";
  const { difficulty } = statistics;
  return (
    <ul className="tw:mx-auto tw:mt-4 tw:mb-0 tw:list-none tw:p-0 tw:text-text-label">
      <li className="tw:p-0">
        <span className={strong}>{statistics.numGames}</span>{" "}
        {statistics.numGames === 1 ? "game" : "games"}.
      </li>
      <li className="tw:p-0">
        <span className={strong}>{statistics.numMaxScores}</span> perfect{" "}
        {statistics.numMaxScores === 1 ? "score" : "scores"} (
        {Math.round(statistics.maxScoreRate)}%).
      </li>
      <li className="tw:p-0">
        Average{" "}
        <span className={strong}>
          {statistics.averageScore.toFixed(AVERAGE_SCORE_DECIMALS)}
        </span>{" "}
        of {statistics.maxScore}.
      </li>
      {difficulty !== undefined && (
        <li className="tw:p-0">
          Harder than{" "}
          <span className={strong}>{Math.round(difficulty.percentile)}%</span>{" "}
          of the {difficulty.numSeeds} other {difficulty.numPlayers}-player
          seeds of this variant.
        </li>
      )}
    </ul>
  );
}

/**
 * A bar for each score from 0 to the best score, as tall as the number of games that reached it.
 * The best score's bar is brass. A line marks the average score.
 */
function ScoreHistogram({
  frequencies,
  maxScore,
  average,
  selectedScore,
  onSelectScore,
}: {
  readonly frequencies: readonly ScoreFrequency[];
  readonly maxScore: number;
  readonly average: number;
  readonly selectedScore: number | undefined;
  readonly onSelectScore: (score: number | undefined) => void;
}) {
  const counts = new Map(frequencies.map((row) => [row.score, row.numGames]));
  const highest = Math.max(1, ...counts.values());
  const scores = [...iRange(0, maxScore)];
  /** Where the average's line is, as a percent of the chart's width. */
  const averageCenter = ((average + 0.5) * 100) / scores.length;
  /**
   * The score whose column the average's line is in. When that column has a bar, the bar draws the
   * line itself and stops it above its count, so that the line does not cross the count.
   */
  const averageScore = Math.min(Math.round(average), maxScore);
  const averageInBar = (counts.get(averageScore) ?? 0) > 0;

  return (
    <figure className="tw:mx-0 tw:mt-8 tw:mb-0">
      <div className="tw:relative tw:flex tw:h-[11em] tw:items-end tw:border-b tw:border-text-label/40">
        <div
          aria-hidden
          className={`tw:pointer-events-none tw:absolute tw:top-0 tw:bottom-0 ${averageInBar ? "" : "tw:border-l tw:border-dashed tw:border-text-label"}`}
          style={{ left: `${averageCenter}%` }}
        >
          {/* Near the right edge, the label goes on the left of the line, so that it fits. */}
          <span
            className={`tw:absolute tw:-top-1 tw:text-[0.75em] tw:whitespace-nowrap tw:text-text-label ${averageCenter > LABEL_FLIP_PERCENT ? "tw:right-1.5" : "tw:left-1.5"}`}
          >
            Average {average.toFixed(AVERAGE_SCORE_DECIMALS)}
          </span>
        </div>
        {scores.map((score) => (
          <ScoreBar
            averageOffset={
              averageInBar && score === averageScore
                ? (average - score + 0.5) * 100
                : undefined
            }
            count={counts.get(score) ?? 0}
            dimmed={selectedScore !== undefined && selectedScore !== score}
            highest={highest}
            key={score}
            onSelect={() => {
              onSelectScore(selectedScore === score ? undefined : score);
            }}
            perfect={score === maxScore}
            score={score}
            selected={selectedScore === score}
          />
        ))}
      </div>
      <div aria-hidden className="tw:flex tw:pt-1">
        {scores.map((score) => (
          <span
            className="tw:flex-1 tw:text-center tw:text-[0.75em] tw:text-text-label tw:tabular-nums"
            key={score}
          >
            {score === maxScore || score % SCORE_LABEL_STEP === 0 ? score : ""}
          </span>
        ))}
      </div>
      <figcaption className="tw:mt-1 tw:text-center tw:text-[0.8em] tw:text-text-label">
        Games by score. Click a bar to see only those games.
      </figcaption>
    </figure>
  );
}

function ScoreBar({
  averageOffset,
  score,
  count,
  highest,
  perfect,
  selected,
  dimmed,
  onSelect,
}: {
  /** Where the average's line crosses this column, as a percent of its width, if it does. */
  readonly averageOffset: number | undefined;
  readonly score: number;
  readonly count: number;
  readonly highest: number;
  readonly perfect: boolean;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onSelect: () => void;
}) {
  const games = `${count} ${count === 1 ? "game" : "games"}`;
  // The count and the bar dim, but not the average's line.
  const dim = dimmed ? "tw:opacity-35" : "";
  const label = `${games} scored ${score}.`;
  if (count === 0) {
    return (
      <div
        aria-label={label}
        className="tw:flex-1"
        ref={tooltipRef(label)}
        role="img"
      />
    );
  }
  return (
    <button
      aria-label={label}
      aria-pressed={selected}
      className="tw:group tw:relative tw:flex tw:h-full tw:flex-1 tw:cursor-pointer tw:flex-col tw:items-stretch tw:justify-end tw:border-0 tw:bg-transparent tw:px-px tw:pt-5 tw:pb-0 tw:text-inherit tw:[font:inherit]"
      onClick={onSelect}
      ref={tooltipRef(label)}
      type="button"
    >
      {averageOffset !== undefined && (
        // The space above the count. The line starts at the top of the chart, over the padding.
        <span aria-hidden className="tw:relative tw:flex-1">
          <span
            className="tw:absolute tw:-top-5 tw:bottom-0.5 tw:border-l tw:border-dashed tw:border-text-label"
            style={{ left: `${averageOffset}%` }}
          />
        </span>
      )}
      <span
        className={`tw:mb-0.5 tw:text-center tw:text-[0.7em] tw:text-text tw:tabular-nums ${dim}`}
      >
        {count}
      </span>
      <span
        className={`tw:block tw:min-h-[2px] tw:rounded-t-[4px] ${dim} tw:group-hover:brightness-125 ${perfect ? "tw:bg-[var(--button-primary-bg)]" : "tw:bg-green-text"} ${selected ? "tw:outline-2 tw:outline-offset-1 tw:outline-text tw:outline-solid" : ""}`}
        style={{ height: `calc((100% - 1.5em) * ${count / highest})` }}
      />
    </button>
  );
}
