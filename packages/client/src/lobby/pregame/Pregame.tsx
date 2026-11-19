// The lobby area that shows the players and options of the table that we are at, before its game
// starts.

import type { PlayerIndex } from "@hanabi-live/game";
import { getVariantById } from "@hanabi-live/game";
import { useEffect, useState } from "react";
import { globals } from "../../Globals.ts";
import { SpectatorsIcon } from "../../SpectatorsIcon.tsx";
import { H_GROUP_LEVEL_URL_PREFIX } from "../../constants.ts";
import { FADE_IN_CLASS, getFadeStyle, useReducedMotion } from "../../fade.ts";
import { useAppSelector } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
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
  const reducedMotion = useReducedMotion();
  // The people who are at the table when we join it show at once, with the table. The people who
  // come after them fade in.
  const tableId = game?.tableId;
  const [shownTableId, setShownTableId] = useState(tableId);
  useEffect(() => {
    setShownTableId(tableId);
  }, [tableId]);
  if (game === undefined) {
    return undefined;
  }

  const fadeStyle = getFadeStyle(reducedMotion || tableId !== shownTableId);

  const isSpectator = game.players.every(
    (player) => player.username !== username,
  );
  const spectators = table?.spectators ?? [];
  const shadowingPlayerIndex = spectators.find(
    (spectator) => spectator.username === username,
  )?.shadowingPlayerIndex;
  const optionDescriptions = getOptionDescriptions(game.settings);
  const hasOptions = game.passwordProtected || optionDescriptions.length > 0;

  const variant = getVariantById(game.settings.options.variantId);
  const numOpenSeats = Math.max(
    game.settings.maxPlayers - game.players.length,
    0,
  );

  return (
    <div className="tw:flex tw:h-full tw:flex-col">
      <header className="tw:mb-4 tw:flex-none">
        <h3
          className="tw:m-0 tw:text-[1.4em] tw:leading-tight tw:font-bold"
          id="lobby-pregame-variant"
        >
          {variant.name}
        </h3>
        <div className="tw:mt-1 tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-5 tw:gap-y-1 tw:text-game-muted">
          <span id="lobby-pregame-name">{game.settings.name}</span>
          <span id="lobby-pregame-seats">
            <i className="fas fa-users tw:mr-[0.4em]" />
            {game.players.length} / {game.settings.maxPlayers}
          </span>
          {hasOptions && (
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
          )}
          {spectators.length > 0 && (
            <span
              className={`tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2 ${FADE_IN_CLASS}`}
              ref={tooltipRef("Spectators")}
              style={fadeStyle}
            >
              <SpectatorsIcon />
              <ul
                className="tw:m-0 tw:contents tw:list-none tw:p-0"
                id="lobby-pregame-spectators"
              >
                {spectators.map((spectator) => (
                  <li
                    className={FADE_IN_CLASS}
                    key={spectator.username}
                    style={fadeStyle}
                  >
                    <Name name={spectator.username} />
                    {spectator.shadowingPlayerIndex !== undefined && (
                      <>
                        {" "}
                        (<SpectatorsIcon />{" "}
                        <em>
                          {table?.playerNames[spectator.shadowingPlayerIndex]}
                        </em>
                        )
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </span>
          )}
        </div>
      </header>
      {/* Every row is as tall as the tallest card, so that the open seats look the same. One column
          on a phone has no rows to match. */}
      <div className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
        <ol className="tw:m-0 tw:grid tw:list-none tw:auto-rows-fr tw:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] tw:gap-2 tw:p-0 tw:narrow-410:auto-rows-auto">
          {game.players.map((player, i) => (
            <PlayerBox
              fadeStyle={fadeStyle}
              isSpectator={isSpectator}
              key={player.username}
              maxScore={variant.maxScore}
              numPlayers={game.players.length}
              player={player}
              playerIndex={i as PlayerIndex}
              shadowed={shadowingPlayerIndex === i}
            />
          ))}
          {Array.from({ length: numOpenSeats }, (_, i) => i).map((i) => (
            <li
              className={[
                "tw:flex tw:min-h-[3em] tw:items-center tw:justify-center tw:rounded-[5px]",
                "tw:border tw:border-dashed tw:border-game-line/40 tw:text-game-muted",
              ].join(" ")}
              key={`open-seat-${i}`}
            >
              Open seat
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * A player who joins pops into their seat: the card grows a little past its size and settles. The
 * "Reduced motion" setting leaves out the pop and the fade.
 */
const JOIN_CLASS =
  "tw:transition-[opacity,scale] tw:ease-[cubic-bezier(0.34,1.56,0.64,1)] tw:starting:scale-90 tw:starting:opacity-0";

function PlayerBox({
  fadeStyle,
  isSpectator,
  maxScore,
  numPlayers,
  player,
  playerIndex,
  shadowed,
}: {
  readonly fadeStyle: React.CSSProperties;
  readonly isSpectator: boolean;
  readonly maxScore: number;
  readonly numPlayers: number;
  readonly player: Player;
  readonly playerIndex: PlayerIndex;
  readonly shadowed: boolean;
}) {
  const variantStats = player.stats.variant;

  return (
    <li
      className={[
        "tw:rounded-[5px] tw:border tw:border-solid tw:border-game-line/50 tw:p-[0.8em]",
        JOIN_CLASS,
        player.present ? "" : "tw:opacity-60",
      ].join(" ")}
      id={`lobby-pregame-player-${playerIndex + 1}`}
      style={fadeStyle}
    >
      <p className="tw:m-0 tw:mb-2 tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-2 tw:text-[1.15em]">
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
        {!player.present && (
          <span className="tw:text-[0.8em] tw:text-game-muted">Away</span>
        )}
      </p>
      <StatRow label="Games" value={player.stats.numGames} />
      <StatRow label="This variant" value={variantStats.numGames} />
      <BestScoreRow
        bestScores={variantStats.bestScores}
        maxScore={maxScore}
        numPlayers={numPlayers}
      />
    </li>
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
      <div className="tw:flex-1 tw:text-game-muted">{label}</div>
      <div className="tw:text-right">{value}</div>
    </div>
  );
}

/** The player's best score on the variant at the player count of this table. */
function BestScoreRow({
  bestScores,
  maxScore,
  numPlayers,
}: {
  readonly bestScores: BestScores;
  readonly maxScore: number;
  readonly numPlayers: number;
}) {
  const best = bestScoreAt(bestScores, numPlayers);
  const perfect = best !== undefined && best.score === maxScore;
  const tooltip =
    best === undefined
      ? `No ${numPlayers}-player games of this variant yet.`
      : `${numPlayers}-player best score: ${best.score} / ${maxScore}.${
          best.modified
            ? ' The game used an option such as "One Extra Card", so the score does not count as a normal one.'
            : ""
        }`;

  return (
    <div className="tw:flex tw:gap-2" ref={tooltipRef(tooltip)}>
      <div className="tw:flex-1 tw:text-game-muted">
        Best score ({numPlayers}p)
      </div>
      <div
        className={[
          "tw:text-right",
          perfect && !best.modified ? "tw:font-bold tw:text-green-text" : "",
        ].join(" ")}
      >
        {best === undefined ? NO_SCORE : best.score}
        {best?.modified === true && "*"}
      </div>
    </div>
  );
}

function bestScoreAt(
  bestScores: BestScores,
  numPlayers: number,
): BestScores[number] | undefined {
  return bestScores.find((bestScore) => bestScore.numPlayers === numPlayers);
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
    <button
      className={[
        "tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:[font:inherit] tw:text-inherit",
        shadowClassName,
        nameClassName ?? "",
      ].join(" ")}
      onClick={(event) => {
        event.stopPropagation();
        reattend(shadowed ? undefined : playerIndex);
      }}
      type="button"
    >
      {name}
      {shadowed && <SpectatorsIcon className="tw:ml-[0.3em]" />}
    </button>
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
  globals.connection.send("tableUnattend", {
    tableId: globals.joinedTableId,
  });
  globals.connection.send("tableSpectate", {
    tableId: globals.joinedTableId,
    shadowingPlayerIndex,
  });
}
