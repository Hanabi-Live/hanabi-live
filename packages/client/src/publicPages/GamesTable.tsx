// A list of games that the server sorts, filters, and pages, such as a player's history or the
// games on a seed. Each change loads that page from the server.

import type {
  gameListColumnSchema,
  GameSummary,
  publicPageTableSchema,
  scoreFrequencySchema,
} from "@hanabi-live/data";
import {
  errorDetails,
  gamePageSchema,
  httpError,
  variantNamesSchema,
} from "@hanabi-live/data";
import { getVariantById, MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { useEffect, useMemo, useState } from "react";
import type * as z from "zod";
import { PATH } from "../constants.ts";
import type { Column, Filters, Sort } from "./DataTable.tsx";
import {
  DataTable,
  nextFilters,
  nextSort,
  Pager,
  usePages,
} from "./DataTable.tsx";
import { ScoreChart } from "./ScoreChart.tsx";

type GamesTable = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "games" }
>;
type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;
type GameListColumn = z.infer<typeof gameListColumnSchema>;

/** The columns of a game list, and the server's name for those that it sorts or filters. */
type GameColumn = Column & { readonly server?: GameListColumn };

/** The Date & Time column, which narrow screens leave out. */
const DATE_COLUMN_CLASS = "tw:narrow-640:hidden";

function gameColumns(
  table: GamesTable,
  variants: Readonly<Record<string, string>>,
): readonly GameColumn[] {
  const seed = table.list === "seed";
  return [
    {
      header: "Game ID",
      sortable: true,
      filter: "none",
      server: "gameId",
    },
    {
      header: "# of Players",
      // The games on a seed share its player count and variant.
      sortable: !seed,
      filter: seed
        ? "none"
        : Array.from(iRange(MIN_PLAYERS, MAX_PLAYERS), (value) => ({
            value: String(value),
            text: String(value),
          })),
      server: "numPlayers",
    },
    {
      header: "Score",
      sortable: true,
      filter: "text",
      server: "score",
    },
    {
      header: "Variant",
      sortable: false,
      filter: seed
        ? "none"
        : Object.entries(variants).map(([value, text]) => ({
            value,
            text,
          })),
      server: "variantId",
    },
    {
      header: "Players",
      sortable: false,
      filter: "none",
    },
    {
      header: "Date & Time",
      sortable: false,
      filter: "none",
      className: DATE_COLUMN_CLASS,
      filterClassName: DATE_COLUMN_CLASS,
    },
    {
      header: seed ? "Percentile" : "Other Scores",
      sortable: false,
      filter: "none",
    },
    ...(table.list === "tags"
      ? [
          {
            header: "Tags",
            sortable: false,
            filter: "none",
          } as const,
        ]
      : []),
  ];
}

/** The server column of a column of the table. */
function serverColumn(
  columns: readonly GameColumn[],
  index: number,
): GameListColumn {
  const column = columns[index]?.server;
  if (column === undefined) {
    throw new Error(`The server does not sort or filter column ${index}.`);
  }
  return column;
}

export function GamesTable({
  table,
}: {
  readonly table: GamesTable;
}): React.JSX.Element {
  const [variants, setVariants] = useState<Readonly<Record<string, string>>>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const response = await fetch("/api/v1/variants", {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await httpError(response, "Loading the variants");
      }
      setVariants(variantNamesSchema.parse(await response.json()));
    })().catch((error_: unknown) => {
      if (!controller.signal.aborted) {
        setError(errorDetails(error_, "Loading the page"));
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  const frequencies = table.frequencies ?? [];
  return (
    <>
      {frequencies.length > 0 && (
        <>
          <ScoreChart frequencies={frequencies} />
          <hr />
        </>
      )}
      {variants === undefined ? (
        <ErrorMessage error={error} />
      ) : (
        <GameList table={table} variants={variants} />
      )}
    </>
  );
}

function GameList({
  table,
  variants,
}: {
  readonly table: GamesTable;
  readonly variants: Readonly<Record<string, string>>;
}) {
  const columns = useMemo(
    () => gameColumns(table, variants),
    [table, variants],
  );
  const [sort, setSort] = useState<Sort>({
    column: columns.findIndex(
      (column) =>
        column.server === (table.list === "seed" ? "score" : "gameId"),
    ),
    descending: true,
  });
  const [filters, setFilters] = useState<Filters>(new Map());
  const { page, size, setPage, setSize } = usePages();
  const [games, setGames] = useState<readonly GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const params = new URLSearchParams({
      offset: String(page * size),
      limit: String(size),
      sort: serverColumn(columns, sort.column),
      order: sort.descending ? "desc" : "asc",
    });
    for (const [column, value] of filters) {
      params.append(`filter[${serverColumn(columns, column)}]`, value);
    }

    // A new request cancels the one before it, so that only the latest request shows its games.
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      const response = await fetch(`${table.apiPath}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await httpError(response, "Loading games");
      }
      const result = gamePageSchema.parse(await response.json());
      setGames(result.games);
      setTotal(result.total);
      setError(undefined);
      setLoading(false);
    })().catch((error_: unknown) => {
      if (!controller.signal.aborted) {
        setError(errorDetails(error_, "Loading games"));
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
    };
  }, [table.apiPath, columns, page, size, sort, filters]);

  const pager = (
    <Pager
      allRows={false}
      onPage={setPage}
      onSize={setSize}
      page={page}
      rows={total}
      size={size}
      summary={String(total)}
    />
  );

  return (
    <>
      {pager}
      <DataTable
        columns={columns}
        onFilter={(index, value) => {
          const next = nextFilters(filters, index, value);
          if (next !== filters) {
            // A new filter starts again from the first page.
            setFilters(next);
            setPage(0);
          }
        }}
        onSort={(index) => {
          setSort(nextSort(sort, index));
          setPage(0);
        }}
        scrollLabel="Game history"
        sort={sort}
      >
        {games.map((game) => (
          <GameRow
            frequencies={table.frequencies ?? []}
            game={game}
            key={game.gameId}
            list={table.list}
          />
        ))}
      </DataTable>
      {pager}
      {loading && <Spinner />}
      <ErrorMessage error={error} />
    </>
  );
}

function GameRow({
  game,
  list,
  frequencies,
}: {
  readonly game: GameSummary;
  readonly list: GamesTable["list"];
  readonly frequencies: readonly ScoreFrequency[];
}) {
  const names = game.playerNames;
  return (
    <tr>
      <td>
        <a href={`${PATH.REPLAY}/${game.gameId}`}>{game.gameId}</a>
      </td>
      <td>{names.length}</td>
      <td>{game.score}</td>
      <td>{getVariantById(game.options.variantId).name}</td>
      <td>
        <a
          href={`${PATH.HISTORY}/${names.map((name) => encodeURIComponent(name)).join("/")}`}
        >
          {names.join(", ")}
        </a>
      </td>
      <td className={DATE_COLUMN_CLASS}>{displayTime(game.finishedAt)}</td>
      <td>
        {list === "seed" ? (
          percentile(game.score, frequencies)
        ) : (
          <a href={`${PATH.SEED}/${encodeURIComponent(game.seed)}`}>
            {game.numGamesOnSeed}
          </a>
        )}
      </td>
      {list === "tags" && <td>{game.tags.join(", ")}</td>}
    </tr>
  );
}

/**
 * The percent of the other games on a seed that a score beat, counting a tie as half, as in
 * duplicate bridge's match points. It is a dash when no other game was played.
 */
function percentile(
  score: number,
  frequencies: readonly ScoreFrequency[],
): string {
  let beaten = 0;
  let others = -1;
  for (const row of frequencies) {
    others += row.numGames;
    if (row.score < score) {
      beaten += row.numGames;
    } else if (row.score === score) {
      beaten += (row.numGames - 1) / 2;
    }
  }
  return others > 0 ? String(Math.round((beaten * 100) / others)) : "-";
}

/** A timestamp as the server's pages show it: the date, an em dash, and the time in UTC. */
function displayTime(timestamp: string): string {
  // Drop the fractional seconds and the time zone from the ISO 8601 timestamp.
  const match = /^(?<date>[^T]+)T(?<time>[^.Z]+)/u.exec(timestamp);
  if (match?.groups === undefined) {
    return timestamp;
  }
  const { date, time } = match.groups;
  return `${date} \u{2014} ${time} UTC`;
}

function ErrorMessage({ error }: { readonly error: string | undefined }) {
  return (
    <p hidden={error === undefined} role="alert">
      {error}
    </p>
  );
}

/** Covers the page while a page of games loads. */
function Spinner() {
  return (
    <div className="tw:fixed tw:inset-0 tw:z-[var(--z-spinner)] tw:flex tw:items-center tw:justify-center tw:bg-spinner-backdrop">
      <span className="tw:relative tw:box-border tw:inline-block tw:h-[48px] tw:w-[48px] tw:animate-spin tw:rounded-full tw:border-x-2 tw:border-y-[3px] tw:border-t-spinner-red tw:border-r-spinner-white/30 tw:border-b-spinner-white tw:border-l-spinner-brown tw:[border-style:solid_dotted] tw:before:absolute tw:before:top-0 tw:before:left-0 tw:before:border-[10px] tw:before:border-transparent tw:before:border-b-spinner-white tw:before:[transform:translate(-10px,19px)_rotate(-35deg)] tw:before:content-[''] tw:after:absolute tw:after:top-0 tw:after:left-0 tw:after:border-[10px] tw:after:border-transparent tw:after:border-t-spinner-red tw:after:[transform:translate(32px,3px)_rotate(-35deg)] tw:after:content-['']" />
    </div>
  );
}
