// The lobby area that shows the players and options of the table that we are at, before its game
// starts.

import type { PlayerIndex } from "@hanabi-live/game";
import { getVariant, MAX_PLAYERS, MIN_PLAYERS } from "@hanabi-live/game";
import { iRange } from "complete-common";
import { globals } from "../../Globals.ts";
import { H_GROUP_LEVEL_URL_PREFIX } from "../../constants.ts";
import { useAppSelector } from "../../store.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { OptionIcon } from "../OptionIcon.tsx";
import { SHADOW_NAME, UN_SHADOW_NAME } from "../cursorClasses.ts";
import { getOptionDescriptions } from "../optionDescriptions.ts";
import { selectTable } from "../tables/tablesSlice.ts";
import { selectHGroupLevel } from "../users/usersSlice.ts";
import type { Game } from "./pregameSlice.ts";

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
    game === undefined ? undefined : selectTable(state, game.tableId),
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
  const optionDescriptions = getOptionDescriptions(game.settings);
  const hasOptions = game.passwordProtected || optionDescriptions.length > 0;

  return (
    <div className="tw:flex tw:h-full">
      <div
        className="tw:w-[200px] tw:overflow-y-auto tw:pr-2 tw:text-[0.85em] tw:narrow-1440:w-[150px]"
        id="lobby-pregame-left"
      >
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-signature tw:mr-[0.4em]" />
            Name:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-name">
            {game.settings.name}
          </span>
        </h4>
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-rainbow tw:mr-[0.4em]" />
            Variant:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-variant">
            {game.settings.options.variantName}
          </span>
        </h4>
        <h4 className="tw:pb-2">
          <strong>
            <i className="fas fa-users tw:mr-[0.4em]" />
            Players:
          </strong>
          <br />
          <span className="tw:block" id="lobby-pregame-seats">
            {game.players.length} / {game.settings.maxPlayers}
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
              <i className="fas fa-glasses tw:mr-[0.4em]" />
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
            variantStats.bestScores[numPlayers - MIN_PLAYERS]?.best?.score
            ?? NO_SCORE
          }
        />
      )}
      <StatRow
        label={`${numPlayers < MIN_PLAYERS ? "B" : "Other b"}est scores:`}
        value={
          <BestScoresIcon
            bestScores={variantStats.bestScores}
            variantName={game.settings.options.variantName}
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
    <div className="tw:flex tw:gap-2">
      <div className="tw:flex-1">{label}</div>
      <div className="tw:text-right">{value}</div>
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
  return (
    <i
      className="fas fa-chart-bar green"
      ref={tooltipRefHtml(getBestScoresTooltip(bestScores, variantName))}
    />
  );
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
    const { best } = bestScore;

    // The grid's negative margin and gutter would push the rows out of the tooltip.
    html += '<div class="row tw:ml-0 tw:text-left">';
    html += `<div class="col-6 tw:pl-0">${bestScorePlayer}-player:</div>`;
    html += '<div class="col-6 tw:pl-0">';
    if (best === undefined) {
      html += ` ${NO_SCORE}`;
    } else if (best.score === maxScore) {
      html += `<strong> ${best.score} / ${maxScore}</strong> &nbsp; `;
      html += best.modified
        ? '<i class="fas fa-times score-modifier red"></i>'
        : '<i class="fas fa-check score-modifier green"></i>';
    } else {
      html += ` ${best.score} / ${maxScore}`;
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
  const shadowClassName = shadowed ? UN_SHADOW_NAME : SHADOW_NAME;
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
    return "tw:text-name-me";
  }
  return isFriend ? "tw:text-friend" : undefined;
}

/** A link to the highest H-Group level that an online player chose, if they chose one. */
function HGroupLevelBadge({ name }: { readonly name: string }) {
  const level = useAppSelector((state) => selectHGroupLevel(state, name));

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
      ref={tooltipRef(
        `This player wants to play with H-Group conventions up to level ${level}.`,
      )}
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
    tableId: globals.joinedTableId,
  });
  globals.conn!.send("tableSpectate", {
    tableId: globals.joinedTableId,
    shadowingPlayerIndex,
  });
}
