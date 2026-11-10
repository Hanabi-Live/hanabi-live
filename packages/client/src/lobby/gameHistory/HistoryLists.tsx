// The screens that show our past games and the other games on a seed.

import type { GameHistory } from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import { getVariant, secondsToClockString } from "@hanabi-live/game";
import { Fragment, useEffect, useRef } from "react";
import { PATH } from "../../constants";
import { OptionIcons } from "../../enums/OptionIcons";
import { globals } from "../../Globals";
import { useAppSelector } from "../../store";
import * as tooltips from "../../tooltips";
import { dateTimeFormatter } from "../../utils";
import {
  hide,
  showMore,
  showMoreOtherScores,
  showOtherScoresFromHistory,
} from "../history";
import { selectHistoryGames, selectShownGameCount } from "./historySlice";

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
      <div className="align-center-v tw:h-full">
        <h3 className="align-center" id="lobby-history-no">
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
      <table className="alt">
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
            <HistoryRow game={game} key={game.id} username={username} />
          ))}
        </tbody>
      </table>

      <div className="align-center">
        {(totalGames === undefined || games.length < totalGames) && (
          <button
            className="button align-center"
            id="lobby-history-show-more"
            onClick={showMore}
            style={{ marginRight: "2em" }}
            type="submit"
          >
            <i className="fas fa-chevron-circle-down icon-label" />
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
            className="button align-center"
            id="lobby-history-show-all-button"
            type="button"
          >
            <i className="fas fa-history icon-label" />
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
  readonly game: GameHistory;
  readonly username: string;
}) {
  const otherGameCount = game.numGamesOnThisSeed - 1;

  return (
    <tr>
      <td>#{game.id}</td>
      <td>{game.options.numPlayers}</td>
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
        <ReplayButton databaseID={game.id} visibility="solo" />
      </td>
      <td>
        <ReplayButton databaseID={game.id} visibility="shared" />
      </td>
      <td>
        <button
          className={
            otherGameCount === 0
              ? "button fit margin0 disabled"
              : "button fit margin0"
          }
          id={`history-other-scores-${game.id}`}
          onClick={
            otherGameCount === 0
              ? undefined
              : () => {
                  showOtherScoresFromHistory(game.seed);
                }
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
      <table className="alt">
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
              key={game.id}
              maxScore={maxScore}
              ourGame={game.playerNames.includes(username)}
            />
          ))}
        </tbody>
      </table>

      {shown !== undefined
        && shown.total !== undefined
        && shown.games.length < shown.total && (
          <div className="align-center">
            <button
              className={
                shown.loading
                  ? "button align-center disabled"
                  : "button align-center"
              }
              id="lobby-history-other-scores-show-more"
              onClick={shown.loading ? undefined : showMoreOtherScores}
              type="submit"
            >
              <i className="fas fa-chevron-circle-down icon-label" />
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
  readonly game: GameHistory;
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
      <td>{emphasize(`#${game.id}`)}</td>
      <td>{emphasize(`${game.score}/${maxScore}`)}</td>
      <td>
        <HistoryOptions options={game.options} />
      </td>
      <td>{emphasize(game.playerNames.join(", "))}</td>
      <td>{emphasize(formatDate(game))}</td>
      <td>{emphasize(seedNumber)}</td>
      <td>
        <ReplayButton databaseID={game.id} visibility="solo" />
      </td>
      <td>
        <ReplayButton databaseID={game.id} visibility="shared" />
      </td>
    </tr>
  );
}

/** A few icons for the options of a game, with a tooltip that lists all of them. */
function HistoryOptions({ options }: { readonly options: Options }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = getOptionItems(options);
  const tooltip = items
    .map(
      ({ icon, text }) =>
        `<li class="tw:mb-[0.3em] tw:pl-[0.2em] tw:last:mb-0"><i class="${icon} icon-label"></i>${text}</li>`,
    )
    .join("");
  useEffect(
    () =>
      tooltip === ""
        ? undefined
        : tooltips.attach(
            ref.current!,
            `<ul class="tw:m-0 tw:list-none tw:p-0">${tooltip}</ul>`,
          ),
    [tooltip],
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
  options: Options,
): ReadonlyArray<{ readonly icon: OptionIcons; readonly text: string }> {
  const items: Array<{ icon: OptionIcons; text: string }> = [];
  if (options.timed) {
    items.push({
      icon: OptionIcons.Timed,
      text: `Timed (${secondsToClockString(options.timeBaseSeconds)} + ${secondsToClockString(options.timePerTurnSeconds)})`,
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
  databaseID,
  visibility,
}: {
  readonly databaseID: number;
  readonly visibility: "solo" | "shared";
}) {
  return (
    <button
      className="button fit margin0 history-table enter-history-game"
      id={`replay-${databaseID}`}
      onClick={() => {
        globals.conn!.send("replayCreate", {
          source: "id",
          databaseID,
          visibility,
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

function formatDate(game: GameHistory): string {
  return dateTimeFormatter.format(new Date(game.datetimeFinished));
}
