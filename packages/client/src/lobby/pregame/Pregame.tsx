// The lobby area that shows the players and options of the table that we are at, before its game
// starts.

import type { PlayerIndex } from "@hanabi-live/game";
import { getCardsPerHand, getVariantById } from "@hanabi-live/game";
import { useEffect, useState } from "react";
import { globals } from "../../Globals.ts";
import { SpectatorsIcon } from "../../SpectatorsIcon.tsx";
import { CARD_BACK_STYLE } from "../../cardBack.ts";
import { H_GROUP_LEVEL_URL_PREFIX } from "../../constants.ts";
import { FADE_IN_CLASS, getFadeStyle, useReducedMotion } from "../../fade.ts";
import { useAppSelector } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { OptionIcon } from "../OptionIcon.tsx";
import { SHADOW_NAME, UN_SHADOW_NAME } from "../cursorClasses.ts";
import { getOptionDescriptions } from "../optionDescriptions.ts";
import { selectTable } from "../tables/tablesSlice.ts";
import { Screen } from "../types/Screen.ts";
import { selectHGroupLevel } from "../users/usersSlice.ts";
import type { Game } from "./pregameSlice.ts";

/** What a player's statistics show for a player count that they have not played. */
const NO_SCORE = "\u{2013}";

const PASSWORD_DESCRIPTION = {
  icon: "fas fa-key",
  tooltip: "This is a password-protected game.",
} as const;

type Player = Game["players"][number];

/**
 * The icons that start the rows of the header. They are as wide as the spectators icon, so that the
 * text after each icon lines up.
 */
const HEADER_ICON_CLASS = "tw:mr-[0.4em] tw:w-[1.115em]";
type BestScores = Readonly<Player["stats"]["variant"]["bestScores"]>;

export function Pregame(): React.JSX.Element | undefined {
  const game = useAppSelector((state) => state.pregame.game);
  const username = useAppSelector((state) => state.session.username);
  const table = useAppSelector((state) =>
    game === undefined ? undefined : selectTable(state, game.tableId),
  );
  const reducedMotion = useReducedMotion();
  // The people who are at the table when we join it show at once, with the table. The people who
  // come after them fade in, and so does our own seat, to show that we took it. The table's details
  // come before the screen shows, and an element that stops being hidden plays its starting style
  // again, so we wait for the screen.
  const shown = useAppSelector(
    (state) => state.session.screen === Screen.PreGame,
  );
  const shownTableId = shown ? game?.tableId : undefined;
  const [fadingTableId, setFadingTableId] = useState(shownTableId);
  useEffect(() => {
    setFadingTableId(shownTableId);
  }, [shownTableId]);
  if (game === undefined) {
    return undefined;
  }

  const fadeStyle = getFadeStyle(
    reducedMotion || shownTableId !== fadingTableId,
  );

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
  const cardsPerHand = getCardsPerHand({
    ...game.settings.options,
    numPlayers: game.settings.maxPlayers,
  });
  const numOpenSeats = Math.max(
    game.settings.maxPlayers - game.players.length,
    0,
  );

  return (
    <div className="tw:flex tw:min-h-0 tw:flex-auto tw:flex-col">
      <header className="tw:mb-4 tw:flex-none">
        <h3
          className="tw:m-0 tw:text-[1.4em] tw:leading-tight tw:font-bold"
          id="lobby-pregame-name"
        >
          {game.settings.name}
        </h3>
        <div className="tw:mt-1 tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-5 tw:gap-y-1 tw:text-game-muted">
          <span id="lobby-pregame-variant">
            <i
              className={`fas fa-palette tw:text-center ${HEADER_ICON_CLASS}`}
              ref={tooltipRef("Variant")}
            />
            {variant.name}
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
        </div>
        {/*
          The row keeps its height with no spectators, so that the seats do not
          move when one joins.
        */}
        <div className="tw:mt-2 tw:flex tw:min-h-[1.75em] tw:items-center tw:text-game-muted">
          {spectators.length > 0 && (
            <>
              <span
                className={`tw:inline-flex tw:self-stretch tw:items-center ${FADE_IN_CLASS}`}
                ref={tooltipRef("Spectators")}
                style={fadeStyle}
              >
                <SpectatorsIcon className={HEADER_ICON_CLASS} />
              </span>
              <ul
                className="tw:m-0 tw:flex tw:list-none tw:flex-wrap tw:gap-1.5 tw:p-0"
                id="lobby-pregame-spectators"
              >
                {spectators.map((spectator) => (
                  <SpectatorChip
                    fadeStyle={fadeStyle}
                    key={spectator.username}
                    name={spectator.username}
                    shadowedName={
                      spectator.shadowingPlayerIndex === undefined
                        ? undefined
                        : table?.playerNames[spectator.shadowingPlayerIndex]
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </header>
      {/* Every row is as tall as the tallest card, so that the open seats look the same. One column
          on a phone has no rows to match. The padding holds a seat while it pops past its size, so
          that no scroll bar shows, and the margin keeps the seats in place. */}
      <div className="tw:-m-1 tw:min-h-0 tw:flex-auto tw:overflow-y-auto tw:p-1">
        <ol className="tw:m-0 tw:grid tw:list-none tw:auto-rows-fr tw:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] tw:gap-2 tw:p-0 tw:narrow-410:auto-rows-auto">
          {game.players.map((player, i) => (
            <PlayerBox
              fadeStyle={
                player.username === username
                  ? getFadeStyle(reducedMotion)
                  : fadeStyle
              }
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
            <OpenSeat
              cardsPerHand={cardsPerHand}
              key={`open-seat-${i}`}
              seat={game.players.length + i + 1}
            />
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
        "tw:rounded-[5px] tw:border tw:border-solid tw:border-game-line/50 tw:bg-game-zone tw:p-[0.8em]",
        JOIN_CLASS,
        player.present ? "" : "tw:opacity-60",
      ].join(" ")}
      id={`lobby-pregame-player-${playerIndex + 1}`}
      style={fadeStyle}
    >
      <p className="tw:m-0 tw:mb-2 tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:text-[1.15em]">
        <SeatNumber seat={playerIndex + 1} />
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

/**
 * The number of a seat, which is its place in the turn order: a token in a well in the felt. The
 * first seat takes the first turn, so it has the ring of the player whose turn it is.
 */
function SeatNumber({ seat }: { readonly seat: number }) {
  const first = seat === 1;
  return (
    <span
      className={[
        "tw:inline-flex tw:flex-none tw:items-center tw:justify-center tw:rounded-full",
        "tw:size-[1.6em] tw:border tw:border-solid tw:bg-game-well tw:text-[0.8em] tw:font-bold tw:tabular-nums",
        first
          ? "tw:border-game-turn tw:text-game-turn"
          : "tw:border-game-line/60",
      ].join(" ")}
      ref={tooltipRef(
        first
          ? "This seat takes the first turn."
          : `Seat ${seat} in the turn order.`,
      )}
    >
      {seat}
    </span>
  );
}

/**
 * A spectator, as a chip on the rail of the table. A spectator who views the game as a player
 * carries that player's name in a smaller chip.
 */
function SpectatorChip({
  fadeStyle,
  name,
  shadowedName,
}: {
  readonly fadeStyle: React.CSSProperties;
  readonly name: string;
  readonly shadowedName: string | undefined;
}) {
  return (
    <li
      className={[
        "tw:inline-flex tw:items-center tw:gap-[0.4em] tw:rounded-full tw:border tw:border-solid tw:border-game-line/40 tw:bg-game-well",
        "tw:py-[0.15em] tw:leading-[1.3]",
        shadowedName === undefined
          ? "tw:px-[0.7em]"
          : "tw:pr-[0.2em] tw:pl-[0.7em]",
        FADE_IN_CLASS,
      ].join(" ")}
      style={fadeStyle}
    >
      <Name name={name} />
      {shadowedName !== undefined && (
        <span
          className="tw:rounded-full tw:border tw:border-solid tw:border-game-line/60 tw:px-[0.6em] tw:text-[0.8em]"
          ref={tooltipRef(`${name} views the game as ${shadowedName}.`)}
        >
          {shadowedName}
        </span>
      )}
    </li>
  );
}

/** How far each card of a hand turns from the next one, in degrees. */
const HAND_FAN_STEP_DEGREES = 8;

/**
 * A seat that no one sits in yet: an empty well in the felt, with a hand of cards that waits face
 * down for its player.
 */
function OpenSeat({
  cardsPerHand,
  seat,
}: {
  readonly cardsPerHand: number;
  readonly seat: number;
}) {
  return (
    <li className="tw:flex tw:min-h-[3em] tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-[5px] tw:border tw:border-dashed tw:border-game-line/40 tw:bg-game-well tw:p-[0.8em] tw:text-game-muted">
      <div className="tw:flex tw:h-[3.2em] tw:items-end tw:justify-center">
        {Array.from({ length: cardsPerHand }, (_, i) => i).map((i) => (
          <span
            className="tw:-mx-[0.35em] tw:block tw:h-[2.8em] tw:w-[1.9em] tw:origin-[50%_120%] tw:rounded-[4px] tw:border tw:border-solid tw:border-white/30 tw:shadow-[0_1px_3px_rgb(0_0_0/50%)]"
            key={i}
            style={{
              ...CARD_BACK_STYLE,
              rotate: `${(i - (cardsPerHand - 1) / 2) * HAND_FAN_STEP_DEGREES}deg`,
            }}
          />
        ))}
      </div>
      <span className="tw:flex tw:items-center tw:gap-2">
        <SeatNumber seat={seat} />
        Open seat
      </span>
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
  // Only the asterisk of a modified score needs an explanation.
  const tooltip =
    best?.modified === true
      ? 'The game used an option such as "One Extra Card", so the score does not count as a normal one.'
      : "";

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
        changeShadow(shadowed ? undefined : playerIndex);
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

/** Changes the player that we shadow, or stops shadowing when the index is `undefined`. */
function changeShadow(shadowingPlayerIndex: PlayerIndex | undefined) {
  globals.connection.send("tableSpectate", {
    tableId: globals.joinedTableId,
    shadowingPlayerIndex,
  });
}
