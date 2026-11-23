// A player's best scores in the curated variants, with each number of players from 2 to 5. A max
// score stands out, so that a player sees at a glance which variants they have mastered.

import type { publicPageTableSchema } from "@hanabi-live/data";
import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { ReadonlyMap } from "complete-common";
import type * as z from "zod";
import { PATH } from "../constants.ts";
import { CURATED_VARIANT_GROUPS, getCuratedLabel } from "../curatedVariants.ts";
import { tooltipRef } from "../tooltipRef.ts";
import { ModifierIcon } from "./MissingScoresTable.tsx";

type PublicPageTable = z.infer<typeof publicPageTableSchema>;
type BestScores = Extract<PublicPageTable, { type: "bestScores" }>;
type VariantBestScores = BestScores["rows"][number];

/** The numbers of players that the table shows. Games with 6 players are rare. */
const PLAYER_COUNTS = [2, 3, 4, 5] as const;

/** A cell without a score. */
const NONE = "\u{2013}";

interface Row {
  readonly recipe: string;
  readonly name: string;
  readonly maxScore: number;
  readonly scores: ReadonlyMap<number, VariantBestScores["scores"][number]>;
}

let catalogByRecipe: ReadonlyMap<string, string> | undefined;

/** The name of the catalog's variant with this recipe, if it has one. */
function getCatalogName(recipe: string): string | undefined {
  catalogByRecipe ??= new ReadonlyMap(
    VARIANT_NAMES.map((name) => [getVariant(name).recipe, name]),
  );
  return catalogByRecipe.get(recipe);
}

/**
 * The rows of a group. A curated variant that the catalog does not have yet, such as Critical Twos,
 * has no games, so it shows only once the server sends its scores.
 */
function getRows(
  recipes: readonly string[],
  played: ReadonlyMap<string, VariantBestScores>,
): readonly Row[] {
  return recipes.flatMap((recipe): Row[] => {
    const scores = played.get(recipe);
    const name = scores?.variantName ?? getCatalogName(recipe);
    if (name === undefined) {
      return [];
    }
    const variant = getVariant(name);
    return [
      {
        recipe,
        name,
        maxScore: scores?.maxScore ?? variant.maxScore,
        scores: new ReadonlyMap(
          (scores?.scores ?? []).map((score) => [score.numPlayers, score]),
        ),
      },
    ];
  });
}

/** Whether a score is a max score without an option that makes it easier. */
function isMax(
  score: VariantBestScores["scores"][number] | undefined,
  maxScore: number,
): boolean {
  return (
    score !== undefined
    && score.score === maxScore
    && score.modifier === undefined
  );
}

function ScoreCell({
  maxScore,
  score,
}: {
  readonly maxScore: number;
  readonly score: VariantBestScores["scores"][number] | undefined;
}): React.JSX.Element {
  if (score === undefined) {
    return <span className="tw:text-text-label">{NONE}</span>;
  }
  const max = isMax(score, maxScore);
  const className = max
    ? "tw:inline-block tw:min-w-[2.2em] tw:rounded-full tw:bg-green tw:px-1.5 tw:font-semibold tw:text-text-on-accent"
    : "";
  const tooltip = `${score.score} of ${maxScore}.`;
  return (
    <span className="tw:inline-flex tw:items-center tw:gap-1">
      {score.gameId === undefined ? (
        <span className={className} ref={tooltipRef(tooltip)}>
          {score.score}
        </span>
      ) : (
        // The link keeps the look of the score, so that the table stays calm. The tooltip and the
        // underline on hover show that it opens the game.
        <a
          className={`${className} tw:no-underline tw:hover:underline ${max ? "" : "tw:text-inherit"}`}
          href={`${PATH.REPLAY}/${score.gameId}`}
          ref={tooltipRef(
            `${tooltip} Click to show the first game with this score.`,
          )}
        >
          {score.score}
        </a>
      )}
      {score.modifier !== undefined && (
        <ModifierIcon modifier={score.modifier} />
      )}
    </span>
  );
}

export function BestScoresTable({
  table,
}: {
  readonly table: BestScores;
}): React.JSX.Element {
  const played = new ReadonlyMap(table.rows.map((row) => [row.recipe, row]));
  const groups = CURATED_VARIANT_GROUPS.map(({ label, recipes }) => ({
    label,
    rows: getRows(recipes, played),
  }));
  const allRows = groups.flatMap(({ rows }) => rows);

  return (
    <table className="tw:mx-auto tw:w-full tw:max-w-[42em] tw:border-collapse tw:text-left">
      <thead>
        <tr>
          <th className="tw:px-2 tw:pb-2 tw:align-bottom tw:text-[0.9em] tw:font-semibold">
            Variant
          </th>
          {PLAYER_COUNTS.map((numPlayers) => {
            const maxScores = allRows.filter((row) =>
              isMax(row.scores.get(numPlayers), row.maxScore),
            ).length;
            return (
              <th
                className="tw:w-[4.5em] tw:px-1 tw:pb-2 tw:text-center tw:align-bottom tw:text-[0.9em] tw:font-semibold"
                key={numPlayers}
                scope="col"
              >
                <span className="tw:block">{numPlayers}p</span>
                <span
                  className="tw:block tw:text-[0.8em] tw:font-normal tw:whitespace-nowrap tw:text-text-label tw:tabular-nums"
                  ref={tooltipRef(
                    `Max scores with ${numPlayers} players: ${maxScores} of ${allRows.length}`,
                  )}
                >
                  {maxScores}/{allRows.length}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      {groups.map(({ label, rows }) => (
        <tbody key={label ?? "top"}>
          {label !== undefined && (
            <tr>
              <th
                className="tw:px-2 tw:pt-4 tw:pb-1 tw:text-[0.85em] tw:font-semibold tw:text-text-label"
                colSpan={PLAYER_COUNTS.length + 1}
                scope="colgroup"
              >
                {label}
              </th>
            </tr>
          )}
          {rows.map((row) => (
            <tr className="tw:border-t tw:border-border" key={row.recipe}>
              {/* The site's stylesheet shrinks a table's header cells. */}
              <th
                className="tw:px-2 tw:py-1 tw:text-[1em] tw:font-normal"
                scope="row"
              >
                {getCuratedLabel(
                  row.name,
                  rows.map(({ name }) => name),
                )}
              </th>
              {PLAYER_COUNTS.map((numPlayers) => (
                <td
                  className="tw:px-1 tw:py-1 tw:text-center tw:tabular-nums"
                  key={numPlayers}
                >
                  <ScoreCell
                    maxScore={row.maxScore}
                    score={row.scores.get(numPlayers)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
