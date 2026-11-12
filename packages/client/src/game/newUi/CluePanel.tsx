import type { Clue, PlayerIndex, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { tooltipRef } from "../../tooltipRef.ts";
import { getRankLabel } from "./Card.tsx";

interface CluePanelProps {
  readonly variant: Variant;
  readonly colorblindMode: boolean;

  /** Whether it is the viewer's turn and the team has a clue to give. */
  readonly canClue: boolean;

  /** Why the viewer cannot clue, shown in place of the buttons. */
  readonly waitingText: string;

  /**
   * The players who can get the clue, in the order that their hands show. With more than one, a
   * button for each comes first, so that a clue goes left to right: player, clue, then "Give clue".
   */
  readonly targets: ReadonlyArray<{
    readonly playerIndex: PlayerIndex;
    readonly name: string;
  }>;

  /** The chosen player, if any. */
  readonly target: PlayerIndex | undefined;
  readonly onChooseTarget: (playerIndex: PlayerIndex) => void;

  readonly clue: Clue | undefined;
  readonly onChooseClue: (clue: Clue) => void;
  readonly canGive: boolean;
  readonly onGive: () => void;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  if (a?.type === "color" && b.type === "color") {
    return a.value.name === b.value.name;
  }

  return a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

const choiceClass =
  "tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:text-base tw:font-extrabold tw:disabled:cursor-default tw:disabled:opacity-40";

/**
 * The controls for giving a clue: pick a player (with their button here, or by clicking their
 * hand), then a color or a rank.
 */
export function CluePanel({
  variant,
  colorblindMode,
  canClue,
  waitingText,
  targets,
  target,
  onChooseTarget,
  clue,
  onChooseClue,
  canGive,
  onGive,
}: CluePanelProps): React.JSX.Element {
  const targetName = targets.find(
    (player) => player.playerIndex === target,
  )?.name;

  if (!canClue) {
    return (
      <section
        aria-label="Give a clue"
        className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:rounded-[14px] tw:bg-game-zone tw:px-4 tw:text-game-muted"
      >
        {waitingText}
      </section>
    );
  }

  return (
    <section
      aria-label="Give a clue"
      className="tw:flex tw:min-h-14 tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-[14px] tw:bg-game-zone tw:px-4 tw:py-2"
    >
      {targets.length > 1 ? (
        // At narrow widths, the players take a row of their own above the clues.
        <div
          aria-label="Player to clue"
          className="tw:mr-2 tw:flex tw:flex-wrap tw:gap-1.5 tw:narrow-980:mr-0 tw:narrow-980:w-full"
          role="group"
        >
          {targets.map(({ playerIndex, name }) => {
            const chosen = playerIndex === target;
            return (
              <button
                aria-pressed={chosen}
                className={`tw:h-9 tw:max-w-36 tw:cursor-pointer tw:truncate tw:rounded-full tw:border-0 tw:px-3.5 tw:text-[15px] tw:font-semibold ${
                  chosen
                    ? "tw:bg-game-text tw:text-card-ink"
                    : "tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line"
                }`}
                key={playerIndex}
                onClick={() => {
                  onChooseTarget(playerIndex);
                }}
                type="button"
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="tw:mr-1 tw:min-w-0 tw:truncate tw:text-game-muted">
          {targetName === undefined ? "Pick a hand" : `Clue ${targetName}:`}
        </span>
      )}
      {/* The clues stay together: when they do not fit beside the players, they all move to a row
      of their own below them. */}
      <div className="tw:flex tw:flex-auto tw:flex-wrap tw:items-center tw:gap-2">
        {variant.clueColors.map((color) => {
          const colorClue = newColorClue(color);
          const pressed = isSameClue(clue, colorClue);
          return (
            <button
              aria-label={color.name}
              aria-pressed={pressed}
              className={`${choiceClass} ${pressed ? "tw:ring-3 tw:ring-game-text" : ""}`}
              key={color.name}
              onClick={() => {
                onChooseClue(colorClue);
              }}
              ref={tooltipRef(color.name)}
              style={{
                background: colorblindMode ? color.fillColorblind : color.fill,
              }}
              type="button"
            />
          );
        })}
        {variant.clueRanks.map((rank) => {
          const rankClue = newRankClue(rank);
          const pressed = isSameClue(clue, rankClue);
          return (
            <button
              aria-pressed={pressed}
              className={`${choiceClass} tw:bg-game-text tw:text-card-ink ${pressed ? "tw:ring-3 tw:ring-clue" : ""}`}
              key={rank}
              onClick={() => {
                onChooseClue(rankClue);
              }}
              type="button"
            >
              {getRankLabel(rank)}
            </button>
          );
        })}
        <button
          className="tw:ml-auto tw:h-10 tw:shrink-0 tw:cursor-pointer tw:rounded-[10px] tw:border-0 tw:bg-clue tw:px-4 tw:font-bold tw:text-card-ink tw:disabled:cursor-default tw:disabled:opacity-40"
          disabled={!canGive}
          onClick={onGive}
          type="button"
        >
          Give clue
        </button>
      </div>
    </section>
  );
}
