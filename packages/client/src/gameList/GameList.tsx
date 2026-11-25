// A list of games that the server sorts, filters, and pages, such as a player's history or the
// games on a seed. The public pages and the lobby show it. Each change loads that page from the
// server.

import type {
  gameListColumnSchema,
  GameSummary,
  publicPageTableSchema,
  scoreFrequencySchema,
} from "@hanabi-live/data";
import { errorDetails, gamePageSchema, httpError } from "@hanabi-live/data";
import type { Variant } from "@hanabi-live/game";
import {
  getVariant,
  getVariantById,
  MAX_PLAYERS,
  MIN_PLAYERS,
  VARIANT_NAMES,
} from "@hanabi-live/game";
import { iRange } from "complete-common";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type * as z from "zod";
import { PATH } from "../constants.ts";
import { getFadeStyle } from "../fade.ts";
import { Pages, usePages } from "../publicPages/DataTable.tsx";
import { Select, SMALL_SELECT_CLASS } from "../Select.tsx";
import { store } from "../store.ts";
import { suggestVariants } from "../SuggestBox.tsx";
import { tooltipRef } from "../tooltipRef.ts";
import { useDelayedCallback } from "../useDelayedCallback.ts";
import { WaitingCard } from "../WaitingCard.tsx";
import {
  END_CONDITION_TEXT,
  GameOptionIcons,
  groupByDay,
  NO_OTHER_GAMES_TOOLTIP,
  OTHER_GAMES_TOOLTIP,
  ROW_BUTTON,
  ROW_ICON_BUTTON,
  Score,
  SHARED_REPLAY_TOOLTIP,
} from "./gameSummary.tsx";
import { NameFilter } from "./NameFilter.tsx";
import { SeedSummary } from "./SeedSummary.tsx";

/** A list of games that a page shows, which the server puts in the page. */
export type GameListData = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "games" }
>;
type ScoreFrequency = z.infer<typeof scoreFrequencySchema>;
type GameListColumn = z.infer<typeof gameListColumnSchema>;

/**
 * What the buttons of a row do in the lobby. The lobby opens a replay through its connection, so
 * that the site does not load again. Elsewhere, the buttons are links.
 */
export interface GameActions {
  readonly watchReplay: (gameId: number, shared: boolean) => void;
  readonly showOtherGames: (seed: string) => void;
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
] as const satisfies readonly SortChoice[];

/** What the count under the list calls one game and several. */
const GAME_NOUN = ["game", "games"] as const;

/** A link to a player in a row. */
const ROW_LINK = "tw:text-link tw:no-underline tw:hover:underline";

export function GameList({
  table,
  actions,
}: {
  readonly table: GameListData;
  readonly actions?: GameActions;
}): React.JSX.Element {
  const seed = table.list === "seed";
  const [sortIndex, setSortIndex] = useState(seed ? 2 : 0);
  const [variant, setVariant] = useState("");
  const [exactMatch, setExactMatch] = useState(true);
  const [players, setPlayers] = useState("");
  const [numPlayers, setNumPlayers] = useState<number>();
  const [score, setScore] = useState<string>();
  const [resetKey, setResetKey] = useState(0);
  const { page, size, setPage, setSize } = usePages();
  const [games, setGames] = useState<readonly GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const owners = useMemo(() => new Set(table.players), [table]);
  const sort = SORT_CHOICES[sortIndex] ?? SORT_CHOICES[0];
  /** The variant that the box names, when a search for its name also finds other variants. */
  const containedVariant = useMemo(
    () => findContainedVariant(variant),
    [variant],
  );
  const exactVariantId = exactMatch ? containedVariant?.id : undefined;
  const filtered =
    variant !== ""
    || players !== ""
    || numPlayers !== undefined
    || score !== undefined;

  useEffect(() => {
    const params = new URLSearchParams({
      offset: String(page * size),
      limit: String(size),
      sort: sort.column,
      order: sort.descending ? "desc" : "asc",
    });
    if (exactVariantId !== undefined) {
      params.append("filter[variantId]", String(exactVariantId));
    } else if (variant !== "") {
      params.append("filter[variant]", variant);
    }
    if (players !== "") {
      params.append("filter[player]", players);
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
  }, [
    table.apiPath,
    page,
    size,
    sort,
    variant,
    exactVariantId,
    players,
    numPlayers,
    score,
  ]);

  /** Applies a change to the filters or the sort, from the first page. */
  function change(apply: () => void) {
    apply();
    setPage(0);
  }

  return (
    <>
      {/* The lobby shows the other games on a seed without the seed's summary, which a link in
          its navigation opens on the seed's page. */}
      {seed && actions === undefined && (
        <SeedSummary
          frequencies={table.frequencies ?? []}
          onSelectScore={(selected) => {
            change(() => {
              setScore(selected === undefined ? undefined : String(selected));
            });
          }}
          seed={decodeURIComponent(table.apiPath.split("/").at(-1) ?? "")}
          selectedScore={score === undefined ? undefined : Number(score)}
          statistics={table.statistics}
        />
      )}
      <div
        className="tw:mt-6 tw:flex tw:flex-wrap tw:items-center tw:gap-x-4 tw:gap-y-3 tw:border-b tw:border-border tw:pb-4 tw:text-[0.9em]"
        key={resetKey}
      >
        {/* The games on a seed share its variant and player count. */}
        {!seed && (
          <NameFilter
            label="Variant"
            onChange={(value) => {
              change(() => {
                setVariant(value);
                setExactMatch(true);
              });
            }}
            placeholder="Any"
            suggest={suggestVariants}
            widthClassName="tw:w-[10em]"
          />
        )}
        {!seed && containedVariant !== undefined && (
          <ExactMatch
            checked={exactMatch}
            onChange={(checked) => {
              change(() => {
                setExactMatch(checked);
              });
            }}
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
        {/* A player's history leaves out its own players, so the box names the others. */}
        <NameFilter
          label={seed ? "Players" : "With"}
          onChange={(value) => {
            change(() => {
              setPlayers(value);
            });
          }}
          placeholder={seed ? "Any" : "Anyone"}
          widthClassName="tw:w-[8em]"
        />
        <ScoreFilter
          onChange={(value) => {
            change(() => {
              setScore(value);
            });
          }}
          value={score}
        />
        {filtered && (
          <button
            className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:text-link tw:underline tw:[font:inherit]"
            onClick={() => {
              change(() => {
                setVariant("");
                setPlayers("");
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
          <Select
            className={SMALL_SELECT_CLASS}
            onChange={(event) => {
              change(() => {
                setSortIndex(Number(event.target.value));
              });
            }}
            value={sortIndex}
          >
            {SORT_CHOICES.map((choice, index) => (
              <option key={choice.text} value={index}>
                {choice.text}
              </option>
            ))}
          </Select>
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
          actions={actions}
          frequencies={table.frequencies ?? []}
          games={games}
          list={table.list}
          owners={owners}
          showDays={sort.column === "gameId"}
        />
      )}

      <Pages
        noun={GAME_NOUN}
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

/**
 * The variant that the text names in full, ignoring case, if the names of other variants also
 * contain the text.
 */
function findContainedVariant(text: string): Variant | undefined {
  const lowercase = text.trim().toLowerCase();
  if (lowercase === "") {
    return undefined;
  }
  const matches = VARIANT_NAMES.filter((name) =>
    name.toLowerCase().includes(lowercase),
  );
  const named = matches.find((name) => name.toLowerCase() === lowercase);
  return named === undefined || matches.length === 1
    ? undefined
    : getVariant(named);
}

/** Whether the list leaves out the variants whose names only contain the name in the box. */
function ExactMatch({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div>
      <input
        checked={checked}
        id={id}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        type="checkbox"
      />
      <label className="tw:m-0 tw:text-[1em]" htmlFor={id}>
        Exact match
      </label>
    </div>
  );
}

/** A box for an exact score, which applies once the typing pauses. */
function ScoreFilter({
  value,
  onChange,
}: {
  /** The score that the list shows, which a click on the seed page's chart can also set. */
  readonly value: string | undefined;
  readonly onChange: (score: string | undefined) => void;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => {
    setText(value ?? "");
  }, [value]);
  const applyLater = useDelayedCallback((typed: string) => {
    onChange(typed === "" ? undefined : typed);
  });
  return (
    <label className="tw:m-0 tw:text-[1em] tw:flex tw:items-center tw:gap-2">
      <span className="tw:text-text-label">Score</span>
      <input
        className="tw:h-8 tw:w-[4em] tw:px-3 tw:text-[1em]"
        inputMode="numeric"
        onChange={(event) => {
          setText(event.target.value);
          applyLater(event.target.value.trim());
        }}
        placeholder="Any"
        type="text"
        value={text}
      />
    </label>
  );
}

interface RowContext {
  readonly list: GameListData["list"];
  readonly actions: GameActions | undefined;
  readonly owners: ReadonlySet<string>;
  readonly frequencies: readonly ScoreFrequency[];
  /** Whether a row shows the date beside the time, when no heading above it shows the day. */
  readonly withDate: boolean;
  /**
   * Whether a row that shows the date can also show a year, because a game is not from this year.
   * Then every row makes room for it, so that the columns line up.
   */
  readonly withYear: boolean;
}

/** The games, under a heading for each day when they are in the order that they were played. */
function DayGroups({
  games,
  showDays,
  ...rest
}: Omit<RowContext, "withDate" | "withYear"> & {
  readonly games: readonly GameSummary[];
  readonly showDays: boolean;
}) {
  const thisYear = new Date().getFullYear();
  const context = {
    ...rest,
    withDate: !showDays,
    withYear: games.some(
      (game) => new Date(game.finishedAt).getFullYear() !== thisYear,
    ),
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

  return (
    <>
      {groupByDay(games).map((group) => (
        <section key={group.day}>
          <h3 className="tw:m-0 tw:mt-8 tw:mb-1 tw:px-3 tw:text-[1em] tw:font-semibold tw:text-text-label tw:narrow-640:px-1">
            {group.day}
          </h3>
          {list(group.games)}
        </section>
      ))}
    </>
  );
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
  const finishedAt = new Date(game.finishedAt);

  return (
    <li className="tw:flex tw:items-center tw:gap-5 tw:border-b tw:border-border tw:px-3 tw:py-3 tw:hover:bg-[var(--row-hover-bg)] tw:narrow-640:flex-wrap tw:narrow-640:items-start tw:narrow-640:gap-x-4 tw:narrow-640:gap-y-2 tw:narrow-640:px-1">
      <Score max={variant.maxScore} score={game.score} />
      <div
        className={`tw:grid tw:min-w-0 tw:flex-1 tw:items-center tw:gap-x-6 ${context.list === "seed" ? "tw:grid-cols-[minmax(0,1fr)_max-content_5.5em] tw:narrow-840:grid-cols-[minmax(0,1fr)_max-content]" : "tw:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_max-content]"} tw:narrow-640:flex tw:narrow-640:flex-wrap tw:narrow-640:gap-x-3 tw:narrow-640:gap-y-0.5`}
      >
        <div className="tw:min-w-0 tw:narrow-640:basis-full">
          {/* The games on a seed share its variant, which the top of the page shows. */}
          {context.list === "seed" ? (
            <div className="tw:break-words">
              <PlayerLinks
                inLobby={context.actions !== undefined}
                names={game.playerNames}
              />
            </div>
          ) : (
            <div
              className="tw:truncate"
              ref={tooltipRef(variant.name, { onlyWhenTruncated: true })}
            >
              {variant.name}
            </div>
          )}
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:text-[0.8em] tw:text-text-label">
            {/* The ID comes first, so that it lines up from row to row. */}
            <span className="tw:tabular-nums">#{game.gameId}</span>
            {ending !== undefined && <span>{ending}</span>}
            <GameOptionIcons options={game.options} />
          </div>
          {context.list === "tags" && game.tags.length > 0 && (
            <div className="tw:text-[0.8em] tw:text-text-label">
              <i aria-hidden className="fas fa-tag tw:mr-1.5" />
              {game.tags.join(", ")}
            </div>
          )}
        </div>
        {context.list !== "seed" && (
          <div className="tw:min-w-0 tw:break-words tw:text-[0.9em] tw:leading-snug tw:narrow-640:max-w-full">
            {teammates.length < game.playerNames.length && (
              <span className="tw:text-text-label">with </span>
            )}
            <PlayerLinks
              inLobby={context.actions !== undefined}
              names={teammates}
            />
          </div>
        )}
        {/* Each row is its own grid, so the time has a fixed width. Otherwise a wider time, such as
            "12:28 AM", would move the columns of its row. */}
        <span
          className={`tw:text-right tw:text-[0.9em] tw:text-text-label tw:tabular-nums tw:narrow-640:w-auto ${dateWidth(context)}`}
          ref={tooltipRef(displayTime(game.finishedAt))}
        >
          {finishedAt.toLocaleString(undefined, {
            ...(context.withDate && {
              month: "short",
              day: "numeric",
              ...(finishedAt.getFullYear() !== new Date().getFullYear() && {
                year: "numeric",
              }),
            }),
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        {context.list === "seed" && (
          <span className="tw:text-right tw:text-[0.9em] tw:narrow-840:hidden">
            <BeatenPercent beaten={beaten} />
          </span>
        )}
      </div>
      <GameButtons actions={context.actions} game={game} list={context.list} />
    </li>
  );
}

/** The width of the time column, which fits the widest time that a row of the list can show. */
function dateWidth(context: RowContext): string {
  if (!context.withDate) {
    return "tw:w-[4.75em]";
  }
  return context.withYear ? "tw:w-[11.5em]" : "tw:w-[9em]";
}

/** Links to the history of each player. */
function PlayerLinks({
  names,
  inLobby,
}: {
  readonly names: readonly string[];
  /** Whether the links open in a new tab, so that they do not leave the lobby. */
  readonly inLobby: boolean;
}) {
  return (
    <>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 && ", "}
          <a
            className={ROW_LINK}
            href={`${PATH.HISTORY}/${encodeURIComponent(name)}`}
            {...(inLobby && {
              rel: "noopener noreferrer",
              target: "_blank",
            })}
          >
            {name}
          </a>
        </span>
      ))}
    </>
  );
}

/** The percent of the other games on a seed that a game's score beat, on the seed's page. */
function BeatenPercent({ beaten }: { readonly beaten: number | undefined }) {
  return beaten === undefined ? null : (
    <span
      className="tw:text-text-label"
      ref={tooltipRef(
        "The percent of the other games on this seed that this score beat.",
      )}
    >
      Beat {beaten}%
    </span>
  );
}

/**
 * The buttons of a game: its replay, a shared replay, and the other games on its seed. They are
 * links, so that they can open in a new tab. In the lobby, a click does the lobby's action instead.
 */
function GameButtons({
  game,
  list,
  actions,
}: {
  readonly game: GameSummary;
  readonly list: GameListData["list"];
  readonly actions: GameActions | undefined;
}) {
  const others = game.numGamesOnSeed - 1;
  function onClick(action: (gameActions: GameActions) => void) {
    if (actions === undefined) {
      return undefined;
    }
    return (event: React.MouseEvent) => {
      // A click with a modifier key, such as Ctrl, opens the link in a new tab.
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      action(actions);
    };
  }
  return (
    <div className="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:narrow-640:basis-full tw:narrow-640:pl-[5.25em]">
      <a
        className={`button ${ROW_BUTTON}`}
        href={`${PATH.REPLAY}/${game.gameId}`}
        onClick={onClick((gameActions) => {
          gameActions.watchReplay(game.gameId, false);
        })}
      >
        <i aria-hidden className="fas fa-play" />
        Replay
      </a>
      <a
        aria-label="Watch in a shared replay"
        className={`button ${ROW_ICON_BUTTON}`}
        href={`${PATH.SHARED_REPLAY}/${game.gameId}`}
        onClick={onClick((gameActions) => {
          gameActions.watchReplay(game.gameId, true);
        })}
        ref={tooltipRef(SHARED_REPLAY_TOOLTIP)}
      >
        <i aria-hidden className="fas fa-share-nodes" />
      </a>
      {/* A seed's page shows the other games on the seed. Elsewhere, the slot keeps its width, so
          that the buttons of every row line up. */}
      {list !== "seed" && (
        <span className="tw:w-[6.5em] tw:narrow-640:w-auto">
          {others > 0 ? (
            <a
              aria-label={`Other scores: ${others}`}
              className={`button ${ROW_BUTTON}`}
              href={`${PATH.SEED}/${encodeURIComponent(game.seed)}`}
              onClick={onClick((gameActions) => {
                gameActions.showOtherGames(game.seed);
              })}
              ref={tooltipRef(OTHER_GAMES_TOOLTIP)}
            >
              <OtherGamesLabel others={others} />
            </a>
          ) : (
            // Dim text, not a button, tells the player that the seed has no other games yet.
            <span
              className={`${ROW_BUTTON} tw:text-text-label`}
              ref={tooltipRef(NO_OTHER_GAMES_TOOLTIP)}
            >
              <OtherGamesLabel others={0} />
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** The icon and the count of a row's other games on the seed. */
function OtherGamesLabel({ others }: { readonly others: number }) {
  return (
    <>
      <i aria-hidden className="fas fa-chart-bar" />
      <span className="tw:tabular-nums">
        {others}
        <span className="tw:narrow-640:hidden">
          {" "}
          {others === 1 ? "other" : "others"}
        </span>
      </span>
    </>
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
 * while it fades out. It is in the body, because the box around the table has a backdrop filter,
 * which would make the cover only as large as the box.
 */
function Spinner({ shown }: { readonly shown: boolean }) {
  // A public page reads the setting once, from the browser's cache (see "reducedMotionCache.ts").
  const { reducedMotion } = store.getState().session.settings;
  return createPortal(
    <div
      aria-hidden={!shown}
      className={`tw:fixed tw:inset-0 tw:z-[var(--z-spinner)] tw:flex tw:items-center tw:justify-center tw:bg-spinner-backdrop tw:transition-[opacity,visibility] ${shown ? "tw:visible tw:opacity-100" : "tw:pointer-events-none tw:invisible tw:opacity-0"}`}
      style={getFadeStyle(reducedMotion)}
    >
      <WaitingCard />
    </div>,
    document.body,
  );
}
