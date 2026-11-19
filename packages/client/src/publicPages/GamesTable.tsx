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
  PAGE_SIZES,
  variantNamesSchema,
} from "@hanabi-live/data";
import type { Suit } from "@hanabi-live/game";
import { getVariantById, MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as z from "zod";
import { PATH } from "../constants.ts";
import { getFadeStyle } from "../fade.ts";
import { store } from "../store.ts";
import { tooltipRef } from "../tooltipRef.ts";
import { usePages } from "./DataTable.tsx";
import { ScoreChart } from "./ScoreChart.tsx";

type GamesTable = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "games" }
>;
type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;
type GameListColumn = z.infer<typeof gameListColumnSchema>;
type EndCondition = GameSummary["endCondition"];

/** How long to wait after the last keystroke in a filter box before applying it. */
const FILTER_DELAY_MILLISECONDS = 300;

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

interface SortChoice {
  readonly text: string;
  readonly column: GameListColumn;
  readonly descending: boolean;
}

const SORT_CHOICES = [
  {
    text: "Newest first",
    column: "gameId",
    descending: true,
  },
  {
    text: "Oldest first",
    column: "gameId",
    descending: false,
  },
  {
    text: "Highest score",
    column: "score",
    descending: true,
  },
  {
    text: "Lowest score",
    column: "score",
    descending: false,
  },
  {
    text: "Most players",
    column: "numPlayers",
    descending: true,
  },
] as const satisfies readonly SortChoice[];

/** A link in a row, which sits above the link that covers the row. */
const ROW_LINK =
  "tw:relative tw:z-10 tw:text-link tw:no-underline tw:hover:underline";

/** How a game ended, when it did not end normally. */
const END_CONDITION_TEXT = {
  normal: undefined,
  strikeout: "Struck out",
  timeout: "Ran out of time",
  terminatedByPlayer: "Terminated",
  terminatedByVote: "Terminated by vote",
  speedrunFail: "Speedrun failed",
  idleTimeout: "Idle too long",
  characterSoftlock: "Stuck",
  allOrNothingFail: "Failed",
  allOrNothingSoftlock: "Stuck",
} as const satisfies Record<EndCondition, string | undefined>;

function GameList({
  table,
  variants,
}: {
  readonly table: GamesTable;
  readonly variants: Readonly<Record<string, string>>;
}) {
  const seed = table.list === "seed";
  const [sortIndex, setSortIndex] = useState(seed ? 2 : 0);
  const [variantId, setVariantId] = useState<string>();
  const [numPlayers, setNumPlayers] = useState<number>();
  const [score, setScore] = useState<string>();
  const [resetKey, setResetKey] = useState(0);
  const { page, size, setPage, setSize } = usePages();
  const [games, setGames] = useState<readonly GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const owners = useMemo(() => new Set(table.players), [table]);
  // The games on a seed share its player count.
  const sortChoices = seed
    ? SORT_CHOICES.filter((choice) => choice.column !== "numPlayers")
    : SORT_CHOICES;
  const sort = sortChoices[sortIndex] ?? SORT_CHOICES[0];
  const filtered =
    variantId !== undefined || numPlayers !== undefined || score !== undefined;

  useEffect(() => {
    const params = new URLSearchParams({
      offset: String(page * size),
      limit: String(size),
      sort: sort.column,
      order: sort.descending ? "desc" : "asc",
    });
    if (variantId !== undefined) {
      params.append("filter[variantId]", variantId);
    }
    if (numPlayers !== undefined) {
      params.append("filter[numPlayers]", String(numPlayers));
    }
    if (score !== undefined) {
      params.append("filter[score]", score);
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
      if (controller.signal.aborted) {
        return;
      }

      setError(errorDetails(error_, "Loading games"));
      setLoading(false);
    });
    return () => {
      controller.abort();
    };
  }, [table.apiPath, page, size, sort, variantId, numPlayers, score]);

  /** Applies a change to the filters or the sort, from the first page. */
  function change(apply: () => void) {
    apply();
    setPage(0);
  }

  return (
    <>
      <div
        className="tw:mt-6 tw:flex tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-3 tw:border-b tw:border-border tw:pb-4 tw:text-[0.9em]"
        key={resetKey}
      >
        {!seed && (
          <VariantFilter
            onChange={(id) => {
              change(() => {
                setVariantId(id);
              });
            }}
            variants={variants}
          />
        )}
        {!seed && (
          <div
            aria-label="Number of players"
            className="tw:flex tw:items-center tw:gap-1.5"
            role="group"
          >
            <span className="tw:mr-1 tw:text-text-label">Players</span>
            {[...iRange(MIN_PLAYERS, MAX_PLAYERS)].map((count) => (
              <button
                aria-pressed={numPlayers === count}
                className={`tw:h-8 tw:w-8 tw:cursor-pointer tw:rounded-[var(--radius)] tw:border tw:border-solid tw:p-0 tw:text-inherit tw:[font:inherit] ${numPlayers === count ? "tw:border-green tw:bg-green tw:text-text-on-accent" : "tw:border-border tw:bg-surface-sunken tw:hover:border-text-label"}`}
                key={count}
                onClick={() => {
                  change(() => {
                    setNumPlayers(numPlayers === count ? undefined : count);
                  });
                }}
                type="button"
              >
                {count}
              </button>
            ))}
          </div>
        )}
        <ScoreFilter
          onChange={(value) => {
            change(() => {
              setScore(value);
            });
          }}
        />
        {filtered && (
          <button
            className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-link tw:underline tw:[font:inherit]"
            onClick={() => {
              change(() => {
                setVariantId(undefined);
                setNumPlayers(undefined);
                setScore(undefined);
                setResetKey((key) => key + 1);
              });
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
        <label className="tw:m-0 tw:text-[1em] tw:ml-auto tw:flex tw:items-center tw:gap-2 tw:narrow-640:ml-0">
          <span className="tw:text-text-label">Sort</span>
          <select
            className="tw:h-8 tw:w-auto tw:py-0 tw:pr-10 tw:pl-3 tw:text-[1em] tw:leading-8"
            onChange={(event) => {
              change(() => {
                setSortIndex(Number(event.target.value));
              });
            }}
            value={sortIndex}
          >
            {sortChoices.map((choice, index) => (
              <option key={choice.text} value={index}>
                {choice.text}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error === undefined && !loading && games.length === 0 ? (
        <p className="tw:my-10 tw:text-center tw:text-text-label">
          {filtered
            ? "No games match these filters."
            : "No games have been played yet."}
        </p>
      ) : (
        <DayGroups
          frequencies={table.frequencies ?? []}
          games={games}
          list={table.list}
          owners={owners}
          showDays={sort.column === "gameId"}
        />
      )}

      <Pages
        onPage={setPage}
        onSize={setSize}
        page={page}
        size={size}
        total={total}
      />
      <Spinner shown={loading} />
      <ErrorMessage error={error} />
    </>
  );
}

/** A text box that picks a variant by its name, from a list that narrows as the player types. */
function VariantFilter({
  variants,
  onChange,
}: {
  readonly variants: Readonly<Record<string, string>>;
  readonly onChange: (variantId: string | undefined) => void;
}) {
  const ids = useMemo(
    () =>
      new Map(
        Object.entries(variants).map(([id, name]) => [name.toLowerCase(), id]),
      ),
    [variants],
  );
  return (
    <label className="tw:m-0 tw:text-[1em] tw:flex tw:min-w-0 tw:items-center tw:gap-2">
      <span className="tw:text-text-label">Variant</span>
      <input
        className="tw:h-8 tw:w-[16em] tw:max-w-full tw:px-3 tw:text-[1em]"
        list="variant-names"
        onChange={(event) => {
          const name = event.target.value.trim().toLowerCase();
          if (name === "") {
            onChange(undefined);
            return;
          }
          const id = ids.get(name);
          if (id !== undefined) {
            onChange(id);
          }
        }}
        placeholder="Any"
        type="text"
      />
      <datalist id="variant-names">
        {Object.values(variants).map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  );
}

/** A box for an exact score, which applies once the typing pauses. */
function ScoreFilter({
  onChange,
}: {
  readonly onChange: (score: string | undefined) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <label className="tw:m-0 tw:text-[1em] tw:flex tw:items-center tw:gap-2">
      <span className="tw:text-text-label">Score</span>
      <input
        className="tw:h-8 tw:w-[4em] tw:px-3 tw:text-[1em]"
        inputMode="numeric"
        onChange={(event) => {
          const value = event.target.value.trim();
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            onChange(value === "" ? undefined : value);
          }, FILTER_DELAY_MILLISECONDS);
        }}
        placeholder="Any"
        type="text"
      />
    </label>
  );
}

interface RowContext {
  readonly list: GamesTable["list"];
  readonly owners: ReadonlySet<string>;
  readonly frequencies: readonly ScoreFrequency[];
  /** Whether a row shows the date beside the time, when no heading above it shows the day. */
  readonly withDate: boolean;
}

/** The games, under a heading for each day when they are in the order that they were played. */
function DayGroups({
  games,
  showDays,
  ...rest
}: Omit<RowContext, "withDate"> & {
  readonly games: readonly GameSummary[];
  readonly showDays: boolean;
}) {
  const context = {
    ...rest,
    withDate: !showDays,
  };
  function list(rows: readonly GameSummary[]) {
    return (
      <ul className="tw:m-0 tw:list-none tw:p-0">
        {rows.map((game) => (
          <GameRow context={context} game={game} key={game.gameId} />
        ))}
      </ul>
    );
  }
  if (!showDays) {
    return list(games);
  }

  const groups: Array<{ day: string; games: GameSummary[] }> = [];
  for (const game of games) {
    const day = dayName(new Date(game.finishedAt));
    const last = groups.at(-1);
    if (last?.day === day) {
      last.games.push(game);
    } else {
      groups.push({
        day,
        games: [game],
      });
    }
  }
  return (
    <>
      {groups.map((group) => (
        <section key={group.day}>
          <h3 className="tw:m-0 tw:mt-6 tw:mb-1 tw:px-3 tw:text-[0.85em] tw:font-semibold tw:text-text-label tw:narrow-640:px-1">
            {group.day}
          </h3>
          {list(group.games)}
        </section>
      ))}
    </>
  );
}

/** "Today", "Yesterday", or the date, with the year only when it is not this year. */
function dayName(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() && { year: "numeric" }),
  });
}

function GameRow({
  game,
  context,
}: {
  readonly game: GameSummary;
  readonly context: RowContext;
}) {
  const variant = getVariantById(game.options.variantId);
  const teammates = game.playerNames.filter(
    (name) => !context.owners.has(name),
  );
  const ending = END_CONDITION_TEXT[game.endCondition];
  const beaten = percentile(game.score, context.frequencies);

  return (
    <li className="tw:relative tw:flex tw:items-center tw:gap-5 tw:border-b tw:border-border tw:px-3 tw:py-3 tw:hover:bg-[var(--row-hover-bg)] tw:narrow-640:gap-4 tw:narrow-640:px-1">
      <a
        aria-label={`Watch the replay of game ${game.gameId}`}
        className="tw:shrink-0 tw:text-inherit tw:no-underline tw:after:absolute tw:after:inset-0 tw:after:content-['']"
        href={`${PATH.REPLAY}/${game.gameId}`}
      >
        <Score max={variant.maxScore} score={game.score} />
      </a>
      <div className="tw:grid tw:min-w-0 tw:flex-1 tw:grid-cols-[minmax(0,24em)_minmax(0,1fr)_minmax(5em,max-content)_5.5em] tw:items-center tw:gap-x-6 tw:narrow-840:grid-cols-[minmax(0,1fr)_minmax(0,10em)_minmax(5em,max-content)] tw:narrow-640:flex tw:narrow-640:flex-wrap tw:narrow-640:gap-x-3 tw:narrow-640:gap-y-0.5">
        <div className="tw:min-w-0 tw:narrow-640:basis-full">
          <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
            <SuitDots suits={variant.suits} />
            <span className="tw:truncate">{variant.name}</span>
          </div>
          {ending !== undefined && (
            <div className="tw:text-[0.8em] tw:text-text-label">{ending}</div>
          )}
          {context.list === "tags" && game.tags.length > 0 && (
            <div className="tw:text-[0.8em] tw:text-text-label">
              <i aria-hidden className="fas fa-tag tw:mr-1.5" />
              {game.tags.join(", ")}
            </div>
          )}
        </div>
        <div className="tw:min-w-0 tw:truncate tw:text-[0.9em] tw:narrow-640:max-w-full">
          {teammates.length < game.playerNames.length && (
            <span className="tw:text-text-label">with </span>
          )}
          {teammates.map((name, index) => (
            <span key={name}>
              {index > 0 && ", "}
              <a
                className={ROW_LINK}
                href={`${PATH.HISTORY}/${encodeURIComponent(name)}`}
              >
                {name}
              </a>
            </span>
          ))}
        </div>
        <span
          className="tw:relative tw:z-10 tw:text-[0.9em] tw:text-text-label tw:tabular-nums"
          ref={tooltipRef(displayTime(game.finishedAt))}
        >
          {new Date(game.finishedAt).toLocaleString(undefined, {
            ...(context.withDate && {
              month: "short",
              day: "numeric",
            }),
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="tw:text-right tw:text-[0.9em] tw:narrow-840:hidden">
          <SeedResult beaten={beaten} game={game} list={context.list} />
        </span>
      </div>
    </li>
  );
}

/**
 * How the game did against the other games on its seed: on a seed's page, the percent that it beat,
 * and elsewhere, a link to the other games.
 */
function SeedResult({
  game,
  list,
  beaten,
}: {
  readonly game: GameSummary;
  readonly list: GamesTable["list"];
  readonly beaten: number | undefined;
}) {
  if (list === "seed") {
    return beaten === undefined ? null : (
      <span
        className="tw:relative tw:z-10 tw:text-text-label"
        ref={tooltipRef(
          "The percent of the other games on this seed that this score beat.",
        )}
      >
        Beat {beaten}%
      </span>
    );
  }
  const others = game.numGamesOnSeed - 1;
  return others > 0 ? (
    <a
      className={ROW_LINK}
      href={`${PATH.SEED}/${encodeURIComponent(game.seed)}`}
    >
      {others} {others === 1 ? "other" : "others"}
    </a>
  ) : null;
}

/** The score as a number over the variant's best score, with a bar that fills toward it. */
function Score({
  score,
  max,
}: {
  readonly score: number;
  readonly max: number;
}) {
  const perfect = score === max;
  return (
    <div className="tw:w-[4.25em]">
      <div className="tw:flex tw:items-baseline tw:gap-1 tw:leading-none">
        <span
          className={`tw:text-[1.6em] tw:font-semibold tw:tabular-nums ${perfect ? "tw:text-[var(--button-primary-bg)]" : ""}`}
        >
          {score}
        </span>
        <span className="tw:text-[0.75em] tw:text-text-label tw:tabular-nums">
          / {max}
        </span>
      </div>
      <div className="tw:mt-1.5 tw:h-1 tw:overflow-hidden tw:rounded-full tw:bg-border">
        <div
          className={`tw:h-full tw:rounded-full ${perfect ? "tw:bg-[var(--button-primary-bg)]" : "tw:bg-green-text"}`}
          style={{ width: `${(score * 100) / max}%` }}
        />
      </div>
    </div>
  );
}

/** A dot in the color of each suit of the variant. */
function SuitDots({ suits }: { readonly suits: readonly Suit[] }) {
  return (
    <span aria-hidden className="tw:flex tw:shrink-0 tw:gap-0.5">
      {suits.map((suit) => (
        <span
          className="tw:h-[0.6em] tw:w-[0.6em] tw:rounded-full tw:ring-1 tw:ring-white/25"
          key={suit.name}
          style={{
            background:
              suit.fill
              ?? `linear-gradient(135deg, ${suit.fillColors.join(", ")})`,
          }}
        />
      ))}
    </span>
  );
}

/** The count of games, and the controls that move between pages when there are more. */
function Pages({
  page,
  size,
  total,
  onPage,
  onSize,
}: {
  readonly page: number;
  readonly size: number;
  readonly total: number;
  readonly onPage: (page: number) => void;
  readonly onSize: (size: number) => void;
}) {
  if (total <= PAGE_SIZES[0]) {
    return (
      <p className="tw:mt-4 tw:mb-0 tw:text-center tw:text-[0.9em] tw:text-text-label">
        {total} {total === 1 ? "game" : "games"}
      </p>
    );
  }
  const pages = Math.ceil(total / size);
  const start = page * size;
  const end = Math.min(total, start + size);
  const arrow =
    "tw:h-8 tw:w-8 tw:cursor-pointer tw:rounded-[var(--radius)] tw:border tw:border-solid tw:border-border tw:bg-surface-sunken tw:p-0 tw:text-inherit tw:disabled:cursor-default tw:disabled:opacity-40";
  return (
    <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-center tw:gap-3 tw:text-[0.9em]">
      <button
        aria-label="Previous page"
        className={arrow}
        disabled={page === 0}
        onClick={() => {
          onPage(page - 1);
        }}
        type="button"
      >
        <i className="fas fa-chevron-left" />
      </button>
      <span className="tw:tabular-nums">
        {start + 1}-{end} of {total}
      </span>
      <button
        aria-label="Next page"
        className={arrow}
        disabled={page >= pages - 1}
        onClick={() => {
          onPage(page + 1);
        }}
        type="button"
      >
        <i className="fas fa-chevron-right" />
      </button>
      <select
        aria-label="Games per page"
        className="tw:ml-4 tw:h-8 tw:w-auto tw:py-0 tw:pr-10 tw:pl-3 tw:text-[1em] tw:leading-8"
        onChange={(event) => {
          onSize(Number(event.target.value));
        }}
        value={size}
      >
        {PAGE_SIZES.map((option) => (
          <option key={option} value={option}>
            {option} per page
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The percent of the other games on a seed that a score beat, counting a tie as half, as in
 * duplicate bridge's match points. It is undefined when no other game was played.
 */
function percentile(
  score: number,
  frequencies: readonly ScoreFrequency[],
): number | undefined {
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
  return others > 0 ? Math.round((beaten * 100) / others) : undefined;
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

/**
 * Covers the page while a page of games loads. It fades in and out, and the page can be clicked
 * while it fades out.
 */
function Spinner({ shown }: { readonly shown: boolean }) {
  // A public page reads the setting once, from the browser's cache (see "reducedMotionCache.ts").
  const { reducedMotion } = store.getState().session.settings;
  return (
    <div
      aria-hidden={!shown}
      className={`tw:fixed tw:inset-0 tw:z-[var(--z-spinner)] tw:flex tw:items-center tw:justify-center tw:bg-spinner-backdrop tw:transition-[opacity,visibility] ${shown ? "tw:visible tw:opacity-100" : "tw:pointer-events-none tw:invisible tw:opacity-0"}`}
      style={getFadeStyle(reducedMotion)}
    >
      <span className="tw:relative tw:box-border tw:inline-block tw:h-[48px] tw:w-[48px] tw:animate-spin tw:rounded-full tw:border-x-2 tw:border-y-[3px] tw:border-t-spinner-red tw:border-r-spinner-white/30 tw:border-b-spinner-white tw:border-l-spinner-brown tw:[border-style:solid_dotted] tw:before:absolute tw:before:top-0 tw:before:left-0 tw:before:border-[10px] tw:before:border-transparent tw:before:border-b-spinner-white tw:before:[transform:translate(-10px,19px)_rotate(-35deg)] tw:before:content-[''] tw:after:absolute tw:after:top-0 tw:after:left-0 tw:after:border-[10px] tw:after:border-transparent tw:after:border-t-spinner-red tw:after:[transform:translate(32px,3px)_rotate(-35deg)] tw:after:content-['']" />
    </div>
  );
}
