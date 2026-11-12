// The screens that show our past games and the other games on a seed.

import type { GameHistoryEntry } from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import { getVariant, secondsToClockString } from "@hanabi-live/game";
import { Fragment } from "react";
import { PATH } from "../../constants.ts";
import { OptionIcons } from "../../enums/OptionIcons.ts";
import { globals } from "../../Globals.ts";
import { useAppSelector } from "../../store.ts";
import { tooltipRefHtml } from "../../tooltipRef.ts";
import { dateTimeFormatter } from "../../utils.ts";
import { BORDERED_TABLE } from "../borderedTable.ts";
import {
  hide,
  showMore,
  showMoreOtherScores,
  showOtherScoresFromHistory,
} from "../history.ts";
import { selectHistoryGames, selectShownGameCount } from "./historySlice.ts";

/** Games with more options than this show an ellipsis, with the options listed in the tooltip. */
const MAX_OPTION_ICONS = 3;

/** Takes the number at the end of a seed, such as "12" from "p2v0s12". */
const SEED_NUMBER_REGEX = /p\d+v\d+[els](\d+)/u;

/** A larger icon inside a table button. */
const BUTTON_ICON = "tw:relative tw:top-[0.22em] tw:text-[1.5em]";

export function HistoryList(): React.JSX.Element {
  const games = useAppSelector(selectHistoryGames);
  const loading = useAppSelector((state) => state.history.loading);
  const totalGames = useAppSelector((state) => state.history.totalGames);
  const username = useAppSelector((state) => state.session.username);

  if (games.length === 0) {
    return (
      <div className="tw:flex tw:h-full tw:items-center tw:justify-center">
        <h3 className="tw:text-center" id="lobby-history-no">
          {loading ? "Loading history..." : "No game history. Play some games!"}
        </h3>
      </div>
    );
  }

  return (
    <div
      className="tw:h-full tw:overflow-y-auto"
      id="lobby-history-table-container"
    >
      <table className={BORDERED_TABLE}>
        <thead>
          <tr>
            <th>Game ID</th>
            <th># of Players</th>
            <th>Score</th>
            <th>Variant</th>
            <th>Options</th>
            <th id="lobby-history-table-players">Other Players</th>
            <th>Date Played</th>
            <th>Watch Replay</th>
            <th>Share Replay</th>
            <th>Other Scores</th>
          </tr>
        </thead>
        <tbody id="lobby-history-table-tbody">
          {games.map((game) => (
            <HistoryRow game={game} key={game.gameId} username={username} />
          ))}
        </tbody>
      </table>

      <div className="tw:text-center">
        {(totalGames === undefined || games.length < totalGames) && (
          <button
            className="button"
            id="lobby-history-show-more"
            onClick={showMore}
            style={{ marginRight: "2em" }}
            type="submit"
          >
            <i className="fas fa-chevron-circle-down tw:mr-[0.625em]" />
            Show More History
          </button>
        )}
        <a
          href={`${PATH.HISTORY}/${username}`}
          id="lobby-history-show-all"
          rel="noopener noreferrer"
          target="_blank"
        >
          <button
            className="button"
            id="lobby-history-show-all-button"
            type="button"
          >
            <i className="fas fa-history tw:mr-[0.625em]" />
            All History
          </button>
        </a>
      </div>
    </div>
  );
}

/** The "Shown games" count on the history screen's navigation bar. */
export function ShownGameCount(): React.JSX.Element {
  return <>{useAppSelector(selectShownGameCount)}</>;
}

function HistoryRow({
  game,
  username,
}: {
  readonly game: GameHistoryEntry;
  readonly username: string;
}) {
  const { seed, numGamesOnSeed } = game;
  const otherGameCount = numGamesOnSeed - 1;
  const hasOtherGames = otherGameCount > 0;

  return (
    <tr>
      <td>#{game.gameId}</td>
      <td>{game.playerNames.length}</td>
      <td>
        {game.score}/{getVariant(game.options.variantName).maxScore}
      </td>
      <td>{game.options.variantName}</td>
      <td>
        <HistoryOptions options={game.options} />
      </td>
      <td>{game.playerNames.filter((name) => name !== username).join(", ")}</td>
      <td>{formatDate(game)}</td>
      <td>
        <ReplayButton gameId={game.gameId} visibility="solo" />
      </td>
      <td>
        <ReplayButton gameId={game.gameId} visibility="shared" />
      </td>
      <td>
        <button
          className={
            hasOtherGames ? "button fit tw:m-0" : "button fit tw:m-0 disabled"
          }
          id={`history-other-scores-${game.gameId}`}
          onClick={
            hasOtherGames
              ? () => {
                  showOtherScoresFromHistory(seed);
                }
              : undefined
          }
          type="button"
        >
          <i className={`fas fa-chart-bar ${BUTTON_ICON} tw:mr-[0.4em]`} />
          {otherGameCount}
        </button>
      </td>
    </tr>
  );
}

export function OtherScoresList(): React.JSX.Element {
  const shown = useAppSelector((state) => state.history.otherScores);
  const username = useAppSelector((state) => state.session.username);
  const variantName = shown?.variantName;
  const maxScore =
    variantName === undefined ? 0 : getVariant(variantName).maxScore;

  return (
    <div className="tw:h-full tw:overflow-y-auto">
      <table className={BORDERED_TABLE}>
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
  readonly game: GameHistoryEntry;
  readonly maxScore: number;
  readonly ourGame: boolean;
}) {
  // Our own game stands out.
  function emphasize(text: string) {
    return ourGame ? <strong>{text}</strong> : text;
  }

  const seedNumber = SEED_NUMBER_REGEX.exec(game.seed)?.[1] ?? "Unknown";

  return (
    <tr>
      <td>{emphasize(`#${game.gameId}`)}</td>
      <td>{emphasize(`${game.score}/${maxScore}`)}</td>
      <td>
        <HistoryOptions options={game.options} />
      </td>
      <td>{emphasize(game.playerNames.join(", "))}</td>
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

/** A few icons for the options of a game, with a tooltip that lists all of them. */
function HistoryOptions({ options }: { readonly options: GameOptions }) {
  const items = getOptionItems(options);
  const tooltip = items
    .map(
      ({ icon, text }) =>
        `<li class="tw:mb-[0.3em] tw:pl-[0.2em] tw:last:mb-0"><i class="${icon} icon-label"></i>${text}</li>`,
    )
    .join("");
  const ref = tooltipRefHtml(
    tooltip === ""
      ? undefined
      : `<ul class="tw:m-0 tw:list-none tw:p-0">${tooltip}</ul>`,
  );

  if (items.length === 0) {
    return <>[none]</>;
  }

  return (
    <div ref={ref}>
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
    items.push({ icon: OptionIcons.Speedrun, text: "Speedrun" });
  }
  if (options.deckPlays) {
    items.push({
      icon: OptionIcons.DeckPlays,
      text: "Bottom-Deck Blind-Plays",
    });
  }
  if (options.emptyClues) {
    items.push({ icon: OptionIcons.EmptyClues, text: "Empty Clues" });
  }
  if (options.oneExtraCard) {
    items.push({ icon: OptionIcons.OneExtraCard, text: "One Extra Card" });
  }
  if (options.oneLessCard) {
    items.push({ icon: OptionIcons.OneLessCard, text: "One Less Card" });
  }
  if (options.allOrNothing) {
    items.push({ icon: OptionIcons.AllOrNothing, text: "All or Nothing" });
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
      className="button fit tw:m-0 history-table enter-history-game"
      id={`replay-${gameId}`}
      onClick={() => {
        globals.conn!.send("replayCreate", {
          source: { type: "saved", gameId },
          visibility: { type: visibility },
        });
        if (visibility === "shared") {
          hide();
        }
      }}
      type="button"
    >
      <i
        className={`fas ${visibility === "solo" ? "fa-eye" : "fa-users"} ${BUTTON_ICON}`}
      />
    </button>
  );
}

function formatDate(game: GameHistoryEntry): string {
  return dateTimeFormatter.format(new Date(game.finishedAt));
}
