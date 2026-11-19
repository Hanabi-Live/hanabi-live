// The screens that show our past games and the other games on a seed.

import type { GameSummary } from "@hanabi-live/data";
import { MAX_HISTORY_FILTER_LENGTH } from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import { getVariantById, secondsToClockString } from "@hanabi-live/game";
import { Fragment } from "react";
import { PATH } from "../../constants.ts";
import { OptionIcons } from "../../enums/OptionIcons.ts";
import { globals } from "../../Globals.ts";
import {
  END_CONDITION_TEXT,
  groupByDay,
  Score,
} from "../../publicPages/gameSummary.tsx";
import { SuitDots } from "../../publicPages/SuitDots.tsx";
import { useAppSelector } from "../../store.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { dateTimeFormatter } from "../../utils.ts";
import {
  filterHistory,
  hide,
  HISTORY_PAGE_SIZE,
  showMore,
  showMoreOtherScores,
  showOtherScoresFromHistory,
} from "../history.ts";
import { replayVisibility } from "../replayVisibility.ts";
import { selectHistoryGames, selectHistoryTotal } from "./historySlice.ts";

/** A game's players, which the server lists in seat order, in alphabetical order, ignoring case. */
function alphabetical(names: readonly string[]): readonly string[] {
  return names.toSorted((a, b) => {
    const [first, second] = [a.toLowerCase(), b.toLowerCase()];
    if (first === second) {
      return 0;
    }
    return first < second ? -1 : 1;
  });
}

/** Games with more options than this show an ellipsis, with the options listed in the tooltip. */
const MAX_OPTION_ICONS = 3;

/** Takes the number at the end of a seed, such as "12" from "p2v0s12". */
const SEED_NUMBER_REGEX = /p\d+v\d+[els](?<seedNumber>\d+)/u;

/** A larger icon inside a table button. */
const BUTTON_ICON = "tw:relative tw:top-[0.22em] tw:text-[1.5em]";

export function HistoryList(): React.JSX.Element {
  const games = useAppSelector(selectHistoryGames);
  const loading = useAppSelector((state) => state.history.loading);
  const filter = useAppSelector((state) => state.history.filter);
  const total = useAppSelector(selectHistoryTotal);
  const username = useAppSelector((state) => state.session.username);

  return (
    <div className="tw:flex tw:h-full tw:flex-col">
      <div className="tw:mx-auto tw:flex tw:w-full tw:max-w-[64em] tw:flex-wrap tw:items-end tw:justify-between tw:gap-x-6 tw:gap-y-3 tw:border-b tw:border-border tw:pb-4">
        <div>
          <h2 className="tw:m-0 tw:text-[1.75em] tw:leading-tight">
            Your games
          </h2>
          <div className="tw:text-[0.9em] tw:text-text-label">
            <GameCount />
          </div>
        </div>
        <HistoryFilter />
      </div>

      <div
        className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto"
        id="lobby-history-table-container"
      >
        <div className="tw:mx-auto tw:max-w-[64em]">
          {games.length === 0 ? (
            <p
              className="tw:my-10 tw:text-center tw:text-text-label"
              id="lobby-history-no"
            >
              {historyEmptyText(loading, filter)}
            </p>
          ) : (
            groupByDay(games).map((group) => (
              <section key={group.day}>
                <h3 className="tw:m-0 tw:mt-5 tw:mb-1 tw:px-3 tw:text-[0.85em] tw:font-semibold tw:text-text-label tw:narrow-640:px-1">
                  {group.day}
                </h3>
                <ul className="tw:m-0 tw:list-none tw:p-0">
                  {group.games.map((game) => (
                    <HistoryRow
                      game={game}
                      key={game.gameId}
                      username={username}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}

          <div className="tw:mt-4 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-x-6 tw:gap-y-3 tw:px-3 tw:text-[0.9em] tw:narrow-640:px-1">
            <span className="tw:text-text-label">
              {games.length > 0
                && `Showing ${games.length}${total === undefined ? "" : ` of ${total}`} ${pluralGames(total ?? games.length)}`}
            </span>
            <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-5 tw:gap-y-3">
              <a
                href={`${PATH.HISTORY}/${username}`}
                id="lobby-history-show-all"
                rel="noopener noreferrer"
                target="_blank"
              >
                Open on its own page
              </a>
              {games.length > 0
                && (total === undefined || games.length < total) && (
                  <button
                    className={`button ${ROW_BUTTON}`}
                    disabled={loading}
                    id="lobby-history-show-more"
                    onClick={showMore}
                    type="button"
                  >
                    <i aria-hidden className="fas fa-chevron-down" />
                    Show{" "}
                    {total === undefined
                      ? HISTORY_PAGE_SIZE
                      : Math.min(HISTORY_PAGE_SIZE, total - games.length)}{" "}
                    more
                  </button>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the history says when it shows no games. */
function historyEmptyText(loading: boolean, filter: string): string {
  if (loading) {
    return "Loading history...";
  }
  return filter === ""
    ? "No game history. Play some games!"
    : `No games match "${filter}".`;
}

function pluralGames(count: number): string {
  return count === 1 ? "game" : "games";
}

/** The number of games that we played, or that the filter finds. */
function GameCount() {
  const filter = useAppSelector((state) => state.history.filter);
  const total = useAppSelector(selectHistoryTotal);
  const failed = useAppSelector((state) => state.history.totalGamesFailed);

  if (total !== undefined) {
    return (
      <>
        {total} {pluralGames(total)}
        {filter !== "" && " found"}
      </>
    );
  }

  if (filter !== "" || !failed) {
    return <>Loading...</>;
  }

  return (
    <span
      className="tw:cursor-pointer"
      onClick={() => {
        globals.conn?.send("lobbyLoad", {});
      }}
      ref={tooltipRef("Loading lobby statistics failed.")}
    >
      Unavailable (click to retry)
    </span>
  );
}

/** A box that shows only the games of a variant or with a player. */
function HistoryFilter() {
  return (
    <label className="tw:m-0 tw:flex tw:w-[18em] tw:max-w-full tw:items-center tw:text-[0.9em] tw:narrow-640:w-full">
      <i
        aria-hidden
        className="fas fa-search tw:pointer-events-none tw:relative tw:left-[0.85em] tw:w-0 tw:text-text-label"
      />
      <input
        aria-label="Filter by variant or player"
        className="tw:h-[2.25em] tw:w-full tw:py-0 tw:pr-3 tw:pl-[2.25em] tw:text-[1em]"
        id="lobby-history-filter"
        maxLength={MAX_HISTORY_FILTER_LENGTH}
        onChange={(event) => {
          filterHistory(event.target.value);
        }}
        placeholder="Filter by variant or player"
        type="text"
      />
    </label>
  );
}

/** A button in a row of the history, or under it. */
const ROW_BUTTON =
  "tw:m-0 tw:inline-flex tw:h-[2.25em] tw:items-center tw:justify-center tw:gap-2 tw:px-3 tw:leading-none";

/** A row's button that shows only an icon. */
const ROW_ICON_BUTTON = `${ROW_BUTTON} tw:w-[2.25em] tw:px-0`;

function HistoryRow({
  game,
  username,
}: {
  readonly game: GameSummary;
  readonly username: string;
}) {
  const variant = getVariantById(game.options.variantId);
  const ending = END_CONDITION_TEXT[game.endCondition];
  const otherGameCount = game.numGamesOnSeed - 1;
  const teammates = alphabetical(game.playerNames).filter(
    (name) => name !== username,
  );

  return (
    <li className="tw:flex tw:items-center tw:gap-5 tw:border-b tw:border-border tw:px-3 tw:py-3 tw:hover:bg-[var(--row-hover-bg)] tw:narrow-640:flex-wrap tw:narrow-640:items-start tw:narrow-640:gap-x-4 tw:narrow-640:gap-y-2 tw:narrow-640:px-1">
      <Score max={variant.maxScore} score={game.score} />
      <div className="tw:grid tw:min-w-0 tw:flex-1 tw:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] tw:items-center tw:gap-x-6 tw:gap-y-0.5 tw:narrow-980:grid-cols-1">
        <div className="tw:min-w-0">
          <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
            <SuitDots suits={variant.suits} />
            <span className="tw:truncate">{variant.name}</span>
          </div>
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:text-[0.8em] tw:text-text-label">
            {ending !== undefined && <span>{ending}</span>}
            <HistoryOptions options={game.options} />
            <span className="tw:tabular-nums">
              {timeFormatter.format(new Date(game.finishedAt))}
            </span>
            <span className="tw:tabular-nums">#{game.gameId}</span>
          </div>
        </div>
        <div className="tw:min-w-0 tw:truncate tw:text-[0.9em]">
          <span className="tw:text-text-label">with </span>
          {teammates.join(", ")}
        </div>
      </div>
      <div className="tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:narrow-640:basis-full tw:narrow-640:pl-[5.25em]">
        <button
          className={`button ${ROW_BUTTON}`}
          id={`replay-${game.gameId}`}
          onClick={() => {
            watchReplay(game.gameId, false);
          }}
          type="button"
        >
          <i aria-hidden className="fas fa-play" />
          Replay
        </button>
        <button
          aria-label="Watch in a shared replay"
          className={`button ${ROW_ICON_BUTTON}`}
          id={`shared-replay-${game.gameId}`}
          onClick={() => {
            watchReplay(game.gameId, true);
          }}
          ref={tooltipRef("Watch in a shared replay.")}
          type="button"
        >
          <i aria-hidden className="fas fa-users" />
        </button>
        {/* The slot keeps its width, so that the buttons of every row line up. */}
        <span className="tw:w-[6.5em] tw:narrow-640:w-auto">
          {otherGameCount > 0 && (
            <button
              aria-label={`Other scores: ${otherGameCount}`}
              className={`button ${ROW_BUTTON}`}
              id={`history-other-scores-${game.gameId}`}
              onClick={() => {
                showOtherScoresFromHistory(game.seed);
              }}
              ref={tooltipRef("See the other games on this seed.")}
              type="button"
            >
              <i aria-hidden className="fas fa-chart-bar" />
              <span className="tw:tabular-nums">
                {otherGameCount}
                <span className="tw:narrow-640:hidden">
                  {" "}
                  {otherGameCount === 1 ? "other" : "others"}
                </span>
              </span>
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function OtherScoresList(): React.JSX.Element {
  const shown = useAppSelector((state) => state.history.otherScores);
  const username = useAppSelector((state) => state.session.username);
  const variantId = shown?.variantId;
  const maxScore =
    variantId === undefined ? 0 : getVariantById(variantId).maxScore;

  return (
    <div className="tw:h-full tw:overflow-y-auto">
      <table>
        <thead>
          <tr>
            <th>Game ID</th>
            <th>Score</th>
            <th>Options</th>
            <th>Players</th>
            <th>Date Played</th>
            <th>Seed</th>
            <th>Watch Replay</th>
            <th>Share Replay</th>
          </tr>
        </thead>
        <tbody id="lobby-history-other-scores-table-tbody">
          {shown?.games.map((game) => (
            <OtherScoreRow
              game={game}
              key={game.gameId}
              maxScore={maxScore}
              ourGame={game.playerNames.includes(username)}
            />
          ))}
        </tbody>
      </table>

      {shown !== undefined
        && shown.total !== undefined
        && shown.games.length < shown.total && (
          <div className="tw:text-center">
            <button
              className={shown.loading ? "button disabled" : "button"}
              id="lobby-history-other-scores-show-more"
              onClick={shown.loading ? undefined : showMoreOtherScores}
              type="submit"
            >
              <i className="fas fa-chevron-circle-down tw:mr-[0.625em]" />
              Show More Scores
            </button>
          </div>
        )}
    </div>
  );
}

function OtherScoreRow({
  game,
  maxScore,
  ourGame,
}: {
  readonly game: GameSummary;
  readonly maxScore: number;
  readonly ourGame: boolean;
}) {
  // Our own game stands out.
  function emphasize(text: string) {
    return ourGame ? <strong>{text}</strong> : text;
  }

  const seedNumber =
    SEED_NUMBER_REGEX.exec(game.seed)?.groups?.["seedNumber"] ?? "Unknown";

  return (
    <tr>
      <td>{emphasize(`#${game.gameId}`)}</td>
      <td>{emphasize(`${game.score}/${maxScore}`)}</td>
      <td>
        <HistoryOptions emptyText="[none]" options={game.options} />
      </td>
      <td>{emphasize(alphabetical(game.playerNames).join(", "))}</td>
      <td>{emphasize(formatDate(game))}</td>
      <td>{emphasize(seedNumber)}</td>
      <td>
        <ReplayButton gameId={game.gameId} visibility="solo" />
      </td>
      <td>
        <ReplayButton gameId={game.gameId} visibility="shared" />
      </td>
    </tr>
  );
}

/**
 * A few icons for the options of a game, with a tooltip that lists all of them. A game without
 * options shows the empty text.
 */
function HistoryOptions({
  options,
  emptyText,
}: {
  readonly options: GameOptions;
  readonly emptyText?: string;
}) {
  const items = getOptionItems(options);
  if (items.length === 0) {
    return emptyText === undefined ? null : <>{emptyText}</>;
  }

  const tooltip = items
    .map(
      ({ icon, text }) =>
        `<li class="tw:mb-[0.3em] tw:pl-[0.2em] tw:last:mb-0"><i class="${icon} icon-label"></i>${text}</li>`,
    )
    .join("");
  const ref = tooltipRefHtml(
    `<ul class="small-tooltip-text tw:m-0 tw:list-none tw:p-0">${tooltip}</ul>`,
    { instant: true },
  );

  // The tooltip's arrow points at the middle of this element, so it must be only as wide as the
  // icons, not the cell.
  return (
    <div className="tw:w-fit" ref={ref}>
      {items.length > MAX_OPTION_ICONS ? (
        <i className="fas fa-ellipsis-h" />
      ) : (
        items.map(({ icon }, i) => (
          <Fragment key={icon}>
            {i > 0 && " "}
            <i className={icon} />
          </Fragment>
        ))
      )}
    </div>
  );
}

function getOptionItems(
  options: GameOptions,
): ReadonlyArray<{ readonly icon: OptionIcons; readonly text: string }> {
  const items: Array<{ icon: OptionIcons; text: string }> = [];
  const { timeControl } = options;
  if (timeControl !== undefined) {
    items.push({
      icon: OptionIcons.Timed,
      text: `Timed (${secondsToClockString(timeControl.baseSeconds)} + ${secondsToClockString(timeControl.perTurnSeconds)})`,
    });
  }
  if (options.speedrun) {
    items.push({
      icon: OptionIcons.Speedrun,
      text: "Speedrun",
    });
  }
  if (options.deckPlays) {
    items.push({
      icon: OptionIcons.DeckPlays,
      text: "Bottom-Deck Blind-Plays",
    });
  }
  if (options.emptyClues) {
    items.push({
      icon: OptionIcons.EmptyClues,
      text: "Empty Clues",
    });
  }
  if (options.oneExtraCard) {
    items.push({
      icon: OptionIcons.OneExtraCard,
      text: "One Extra Card",
    });
  }
  if (options.oneLessCard) {
    items.push({
      icon: OptionIcons.OneLessCard,
      text: "One Less Card",
    });
  }
  if (options.allOrNothing) {
    items.push({
      icon: OptionIcons.AllOrNothing,
      text: "All or Nothing",
    });
  }
  if (options.detrimentalCharacters) {
    items.push({
      icon: OptionIcons.DetrimentalCharacters,
      text: "Detrimental Characters",
    });
  }
  return items;
}

function ReplayButton({
  gameId,
  visibility,
}: {
  readonly gameId: number;
  readonly visibility: "solo" | "shared";
}) {
  return (
    <button
      className="button fit tw:m-0"
      id={`${visibility === "solo" ? "replay" : "shared-replay"}-${gameId}`}
      onClick={() => {
        watchReplay(gameId, visibility === "shared");
      }}
      type="button"
    >
      <i
        className={`fas ${visibility === "solo" ? "fa-undo" : "fa-users"} ${BUTTON_ICON}`}
      />
    </button>
  );
}

/** Opens the replay of a game. We leave the history to watch a shared replay with others. */
function watchReplay(gameId: number, shared: boolean) {
  globals.connection.send("replayCreate", {
    source: {
      type: "saved",
      gameId,
    },
    visibility: replayVisibility(shared),
  });
  if (shared) {
    hide();
  }
}

function formatDate(game: GameSummary): string {
  return dateTimeFormatter.format(new Date(game.finishedAt));
}
