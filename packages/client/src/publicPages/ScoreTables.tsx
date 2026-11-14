// The tables of best scores: a player's scores on each variant, and the max scores that players are
// missing.

import type { publicPageTableSchema } from "@hanabi-live/data";
import { MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import type * as z from "zod";
import { tooltipRefHtml } from "../tooltipRef.ts";
import type { LocalColumn } from "./LocalTable.tsx";
import { LocalTable } from "./LocalTable.tsx";
import { MissingScoresFilters } from "./MissingScoresFilters.tsx";

type PublicPageTable = z.infer<typeof publicPageTableSchema>;
type ScoresTable = Extract<PublicPageTable, { type: "scores" }>;
type MissingScoresTable = Extract<PublicPageTable, { type: "missingScores" }>;
type MissingScore = MissingScoresTable["rows"][number];
type ScoreModifierOption = NonNullable<MissingScore["modifier"]>;

/** The name of each option that keeps a score from counting as a normal one. */
const MODIFIER_NAMES = {
  allOrNothing: "All or Nothing",
  deckPlays: "Bottom-Deck Blind-Play",
  emptyClues: "Empty Clue",
  oneExtraCard: "One Extra Card",
  oneLessCard: "One Less Card",
} as const satisfies Record<ScoreModifierOption, string>;

const CENTER = "tw:text-center";

/** A cross that explains which option kept a score from counting as a normal one. */
function ModifierIcon({
  modifier,
}: {
  readonly modifier: ScoreModifierOption;
}): React.JSX.Element {
  return (
    <i
      className="fas fa-times score-modifier red"
      ref={tooltipRefHtml(
        `<div class="tw:text-[0.75em]">This score is not legitimate since the <strong>${MODIFIER_NAMES[modifier]}</strong> option was used.</div>`,
        { instant: true },
      )}
    />
  );
}

function scoreText(score: number | undefined, maxScore: number): string {
  return `${score ?? "\u{2013}"} / ${maxScore}`;
}

export function ScoresTable({
  table,
}: {
  readonly table: ScoresTable;
}): React.JSX.Element {
  type VariantScores = ScoresTable["variants"][number];
  const columns: Array<LocalColumn<VariantScores>> = [
    {
      header: "Variant",
      sortable: true,
      filter: "select",
      text: (row) => row.variantName,
      cell: (row) => row.variantName,
    },
    {
      header: "Total Games",
      sortable: true,
      filter: "text",
      className: CENTER,
      text: (row) => String(row.numGames),
      cell: (row) => row.numGames,
    },
    ...Array.from(
      iRange(MIN_PLAYERS, MAX_PLAYERS),
      (players, index): LocalColumn<VariantScores> => ({
        header: `${players}-Player Best Score`,
        sortable: true,
        filter: "text",
        ratio: true,
        className: CENTER,
        text: (row) => {
          const { score } = row.bestScores[index] ?? {};
          return score === undefined
            ? "\u{2013}"
            : scoreText(score, row.maxScore);
        },
        cell: (row) => {
          const { score, modifier } = row.bestScores[index] ?? {};
          if (score === undefined) {
            return "\u{2013}";
          }
          if (score !== row.maxScore) {
            return scoreText(score, row.maxScore);
          }
          return (
            <>
              <strong>{scoreText(score, row.maxScore)}</strong>{" "}
              {modifier === undefined ? (
                <i className="fas fa-check score-modifier green" />
              ) : (
                <ModifierIcon modifier={modifier} />
              )}
            </>
          );
        },
      }),
    ),
  ];

  return (
    <LocalTable
      columns={columns}
      initialSort={{ column: 0, descending: false }}
      rowKey={(row) => row.variantName}
      rows={table.variants}
      scrollLabel="Scores"
    />
  );
}

/** The classes of an efficiency's cell, which stands out when a max score is hard. */
const DIFFICULTY_CLASSES = {
  normal: "",
  hard: "tw:bg-difficulty-hard tw:text-text-on-accent",
  veryHard: "tw:bg-difficulty-very-hard tw:text-text-on-accent",
} as const satisfies Record<MissingScore["difficulty"], string>;

const missingScoreColumns: ReadonlyArray<LocalColumn<MissingScore>> = [
  {
    header: "Variant",
    sortable: true,
    filter: "none",
    className: "tw:w-[55%]",
    text: (row) => row.variantName,
    cell: (row) => row.variantName,
  },
  {
    header: "# of Players",
    sortable: false,
    filter: "none",
    className: `tw:w-[15%] ${CENTER}`,
    text: (row) => String(row.numPlayers),
    cell: (row) => row.numPlayers,
  },
  {
    header: "Highest Score",
    sortable: true,
    filter: "none",
    ratio: true,
    className: `tw:w-[15%] ${CENTER}`,
    text: (row) => scoreText(row.score, row.maxScore),
    cell: (row) => (
      <>
        {`${scoreText(row.score, row.maxScore)} \u{A0}`}
        {row.modifier !== undefined && (
          <>
            {" "}
            <ModifierIcon modifier={row.modifier} />
          </>
        )}
      </>
    ),
  },
  {
    header: "Efficiency",
    sortable: true,
    filter: "none",
    className: `tw:w-[15%] ${CENTER}`,
    text: (row) => row.efficiency,
    cell: (row) => row.efficiency,
    cellClassName: (row) =>
      `tw:w-[15%] ${CENTER} ${DIFFICULTY_CLASSES[row.difficulty]}`,
  },
];

export function MissingScoresTable({
  table,
}: {
  readonly table: MissingScoresTable;
}): React.JSX.Element {
  return (
    <>
      <MissingScoresFilters filters={table.filters} />
      <LocalTable
        columns={missingScoreColumns}
        initialSort={undefined}
        rowKey={(row) => `${row.numPlayers}-${row.variantName}`}
        rows={table.rows}
      />
    </>
  );
}
