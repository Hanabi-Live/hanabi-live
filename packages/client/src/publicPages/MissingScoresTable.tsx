// The table of the max scores that players are missing.

import type { publicPageTableSchema } from "@hanabi-live/data";
import type * as z from "zod";
import { tooltipRefHtml } from "../tooltipRef.ts";
import type { LocalColumn } from "./LocalTable.tsx";
import { LocalTable } from "./LocalTable.tsx";
import { MissingScoresFilters } from "./MissingScoresFilters.tsx";

type PublicPageTable = z.infer<typeof publicPageTableSchema>;
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
export function ModifierIcon({
  modifier,
}: {
  readonly modifier: ScoreModifierOption;
}): React.JSX.Element {
  return (
    <i
      className="fas fa-xmark score-modifier red"
      ref={tooltipRefHtml(
        `This score is not legitimate since the <strong>${MODIFIER_NAMES[modifier]}</strong> option was used.`,
        { instant: true },
      )}
    />
  );
}

function scoreText(score: number | undefined, maxScore: number): string {
  return `${score ?? "\u{2013}"} / ${maxScore}`;
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
    className: "tw:w-[55%]",
    text: (row) => row.variantName,
    cell: (row) => row.variantName,
  },
  {
    header: "# of Players",
    sortable: false,
    className: `tw:w-[15%] ${CENTER}`,
    text: (row) => String(row.numPlayers),
    cell: (row) => row.numPlayers,
  },
  {
    header: "Highest Score",
    sortable: true,
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
        emptyText="No max scores are missing."
        initialSort={undefined}
        noun={["score", "scores"]}
        rowKey={(row) => `${row.numPlayers}-${row.variantName}`}
        rows={table.rows}
      />
    </>
  );
}
