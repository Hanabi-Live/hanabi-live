// The lobby area that shows the players and options of the table that we are at, before its game
// starts.

import type { PlayerIndex } from "@hanabi-live/game";
import { getVariant, MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { useEffect, useRef } from "react";
import { globals } from "../../Globals";
import { H_GROUP_LEVEL_URL_PREFIX } from "../../constants";
import { useAppSelector } from "../../store";
import * as tooltips from "../../tooltips";
import { OptionIcon } from "../OptionIcon";
import { getOptionDescriptions } from "../optionDescriptions";
import { selectTable } from "../tables/tablesSlice";
import { selectHGroupLevel } from "../users/usersSlice";
import type { Game } from "./pregameSlice";

/** What a player's statistics show for a player count that they have not played. */
const NO_SCORE = "\u{2013}";

const PASSWORD_DESCRIPTION = {
  icon: "fas fa-key",
  tooltip: "This is a password-protected game.",
} as const;

type Player = Game["players"][number];
type BestScores = Readonly<Player["stats"]["variant"]["bestScores"]>;

export function Pregame(): React.JSX.Element | undefined {
  const game = useAppSelector((state) => state.pregame.game);
  const username = useAppSelector((state) => state.session.username);
  const table = useAppSelector((state) =>
    game === undefined ? undefined : selectTable(state, game.tableID),
  );
  if (game === undefined) {
    return undefined;
  }

  const isSpectator = game.players.every(
    (player) => player.username !== username,
  );
  const spectators = table?.spectators ?? [];
  const shadowingPlayerIndex = spectators.find(
    (spectator) => spectator.username === username,
  )?.shadowingPlayerIndex;
  const optionDescriptions = getOptionDescriptions(game.options);
  const hasOptions = game.passwordProtected || optionDescriptions.length > 0;

  return (
    <div className="tw:flex tw:h-full">
      <div
        className="tw:w-[200px] tw:overflow-y-auto tw:pr-2 tw:text-[0.85em] tw:narrow-1440:w-[150px]"
        id="lobby-pregame-left"
      >
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-signature icon-label" />
            Name:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-name">
            {game.name}
          </span>
        </h4>
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-rainbow icon-label" />
            Variant:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-variant">
            {game.options.variantName}
          </span>
        </h4>
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-users icon-label" />
            Players:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-seats">
            {game.players.length} / {game.maxPlayers}
          </span>
        </h4>
        {hasOptions && (
          <h4 className="tw:pb-2" id="lobby-pregame-options-container">
            <span className="tw:font-normal" id="lobby-pregame-options-title">
              Options:
            </span>
            <br />
            <ul
              className="tw:m-0 tw:list-none tw:p-0"
              id="lobby-pregame-options"
            >
              {game.passwordProtected && (
                <OptionIcon description={PASSWORD_DESCRIPTION} />
              )}
              {optionDescriptions.map((description) => (
                <OptionIcon description={description} key={description.name} />
              ))}
            </ul>
          </h4>
        )}
        {spectators.length > 0 && (
          <h4 className="tw:pb-2" id="lobby-pregame-spectators-container">
            <strong>
              <i className="fas fa-glasses icon-label" />
              Spectators:
            </strong>
            <br />
            <ul
              className="tw:m-0 tw:list-none tw:p-0"
              id="lobby-pregame-spectators"
            >
              {spectators.map((spectator) => (
                <li key={spectator.username}>
                  &bull; <Name name={spectator.username} />
                  {spectator.shadowingPlayerIndex !== undefined && (
                    <>
                      {" "}
                      {/* eslint-disable-next-line complete/require-ascii */}
                      (🕵️{" "}
                      <em>
                        {table?.playerNames[spectator.shadowingPlayerIndex]}
                      </em>
                      )
                    </>
                  )}
                </li>
              ))}
            </ul>
          </h4>
        )}
      </div>
      <div className="tw:flex tw:h-full tw:flex-[1_1_100%] tw:flex-wrap tw:justify-start tw:overflow-y-auto">
        {game.players.map((player, i) => (
          <PlayerBox
            game={game}
            isSpectator={isSpectator}
            key={player.username}
            player={player}
            playerIndex={i as PlayerIndex}
            shadowed={shadowingPlayerIndex === i}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerBox({
  game,
  player,
  playerIndex,
  isSpectator,
  shadowed,
}: {
  readonly game: Game;
  readonly player: Player;
  readonly playerIndex: PlayerIndex;
  readonly isSpectator: boolean;
  readonly shadowed: boolean;
}) {
  // The "numPlayers" in the options is not set yet.
  const numPlayers = game.players.length;
  const variantStats = player.stats.variant;

  return (
    <div
      className={[
        "tw:mr-2 tw:mb-2 tw:max-h-[calc(100%-0.5em)] tw:max-w-[300px] tw:flex-[1_1_160px]",
        "tw:overflow-y-auto tw:rounded-[5px] tw:border tw:border-solid tw:border-(--pregame-player-border)",
        "tw:p-[0.8em] tw:narrow-980:max-w-[200px]",
      ].join(" ")}
      id={`lobby-pregame-player-${playerIndex + 1}`}
    >
      <p className="tw:m-0 tw:pb-2">
        <strong>
          {isSpectator ? (
            <ShadowName
              name={player.username}
              playerIndex={playerIndex}
              shadowed={shadowed}
            />
          ) : (
            <Name name={player.username} />
          )}
        </strong>
        <HGroupLevelBadge name={player.username} />
      </p>
      <StatRow label="Total games:" value={player.stats.numGames} />
      <StatRow label="...of this variant:" value={variantStats.numGames} />
      {numPlayers >= MIN_PLAYERS && (
        <StatRow
          label={`${numPlayers}-player best score:`}
          value={
            variantStats.bestScores[numPlayers - MIN_PLAYERS]?.score ?? NO_SCORE
          }
        />
      )}
      <StatRow
        label={`${numPlayers < MIN_PLAYERS ? "B" : "Other b"}est scores:`}
        value={
          <BestScoresIcon
            bestScores={variantStats.bestScores}
            variantName={game.options.variantName}
          />
        }
      />
      {!player.present && (
        <p className="tw:mt-4 tw:mb-0">
          <strong>AWAY</strong>
        </p>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="col-10">{label}</div>
      <div className="col-2 align-right tw:p-0">{value}</div>
    </div>
  );
}

function BestScoresIcon({
  bestScores,
  variantName,
}: {
  readonly bestScores: BestScores;
  readonly variantName: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const content = getBestScoresTooltip(bestScores, variantName);
  useEffect(() => tooltips.attach(ref.current!, content), [content]);

  return <i className="fas fa-chart-bar green" ref={ref} />;
}

function getBestScoresTooltip(
  bestScores: BestScores,
  variantName: string,
): string {
  const { maxScore } = getVariant(variantName);
  let html = '<div class="tw:w-32 tw:text-[0.75em]">';
  for (const bestScorePlayer of iRange(MIN_PLAYERS, MAX_PLAYERS)) {
    const bestScore = bestScores[bestScorePlayer - MIN_PLAYERS];
    if (bestScore === undefined) {
      continue;
    }
    const { score, modifier } = bestScore;

    // The grid's negative margin and gutter would push the rows out of the tooltip.
    html += '<div class="row tw:ml-0 tw:text-left">';
    html += `<div class="col-6 tw:pl-0">${bestScorePlayer}-player:</div>`;
    html += '<div class="col-6 tw:pl-0">';
    if (score === undefined) {
      html += ` ${NO_SCORE}`;
    } else if (score === maxScore) {
      html += `<strong> ${score} / ${maxScore}</strong> &nbsp; `;
      html +=
        modifier === 0
          ? '<i class="fas fa-check score-modifier green"></i>'
          : '<i class="fas fa-times score-modifier red"></i>';
    } else {
      html += ` ${score} / ${maxScore}`;
    }
    html += "</div></div>";
  }
  html += "</div>";
  return html;
}

/** A user's name, in the color that shows whether they are us or our friend. */
function Name({ name }: { readonly name: string }) {
  const className = useNameClassName(name);
  return <span className={className}>{name}</span>;
}

/**
 * The name of a player, for a spectator: clicking on it shadows the player, which shows their cards
 * as they see them. Clicking on the player that we shadow stops shadowing them.
 */
function ShadowName({
  name,
  playerIndex,
  shadowed,
}: {
  readonly name: string;
  readonly playerIndex: PlayerIndex;
  readonly shadowed: boolean;
}) {
  const nameClassName = useNameClassName(name);
  const shadowClassName = shadowed ? "un-shadow" : "shadow";
  return (
    <span
      className={
        nameClassName === undefined
          ? shadowClassName
          : `${nameClassName} ${shadowClassName}`
      }
      onClick={(event) => {
        event.stopPropagation();
        reattend(shadowed ? undefined : playerIndex);
      }}
    >
      {name}
      {/* eslint-disable-next-line complete/require-ascii */}
      {shadowed && " 🕵️"}
    </span>
  );
}

function useNameClassName(name: string): string | undefined {
  const isUs = useAppSelector((state) => state.session.username === name);
  const isFriend = useAppSelector((state) =>
    state.session.friends.includes(name),
  );
  if (isUs) {
    return "name-me";
  }
  return isFriend ? "friend" : undefined;
}

/** A link to the highest H-Group level that an online player chose, if they chose one. */
function HGroupLevelBadge({ name }: { readonly name: string }) {
  const level = useAppSelector((state) => selectHGroupLevel(state, name));
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (level === undefined) {
      return undefined;
    }
    return tooltips.attach(
      ref.current!,
      `<span class="small-tooltip-text">This player wants to play with H-Group conventions up to level ${level}.</span>`,
    );
  }, [level]);

  if (level === undefined) {
    return undefined;
  }

  return (
    <a
      className={[
        "tw:ml-2 tw:inline-block tw:rounded-[1em] tw:border tw:border-solid tw:border-current",
        "tw:px-[0.6em] tw:py-[0.1em] tw:align-[0.1em] tw:text-[0.8em] tw:leading-[1.3] tw:font-normal",
        "tw:whitespace-nowrap tw:text-inherit tw:no-underline tw:hover:underline",
      ].join(" ")}
      href={`${H_GROUP_LEVEL_URL_PREFIX}${level}`}
      ref={ref}
      rel="noopener noreferrer"
      target="_blank"
    >
      Level {level}
    </a>
  );
}

/** Spectates the table again, shadowing a player or no one. */
function reattend(shadowingPlayerIndex: PlayerIndex | undefined) {
  globals.conn!.send("tableUnattend", {
    tableID: globals.tableID,
  });
  globals.conn!.send("tableSpectate", {
    tableID: globals.tableID,
    shadowingPlayerIndex,
  });
}
