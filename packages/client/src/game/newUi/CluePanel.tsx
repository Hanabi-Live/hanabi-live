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

  /** The chosen player, if any. Clicking the chosen player again clears the choice. */
  readonly target: PlayerIndex | undefined;
  readonly onChooseTarget: (playerIndex: PlayerIndex | undefined) => void;

  /** The chosen clue, if any. Clicking the chosen clue again clears the choice. */
  readonly clue: Clue | undefined;
  readonly onChooseClue: (clue: Clue | undefined) => void;
  readonly canGive: boolean;
  readonly onGive: () => void;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  if (a?.type === "color" && b.type === "color") {
    return a.value.name === b.value.name;
  }

  return a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

/**
 * A name longer than this many characters may not fit in its space, which ends it with an ellipsis.
 * Such a name shows in full in a tooltip.
 */
const LONG_NAME_LENGTH = 10;

function fullNameTooltip(name: string) {
  return tooltipRef(name.length > LONG_NAME_LENGTH ? name : undefined);
}

/**
 * The surface of the controls above the hands: a solid panel that sits above the table, like the
 * bar along the bottom and the chat, so that it reads as something to operate and not as part of
 * the game. When the viewer can give a clue, a white ring marks it, like the current player's hand.
 * Otherwise, a thin line edges it.
 */
export const CONTROL_PANEL_CLASS =
  "tw:bg-game-panel tw:shadow-[0_4px_14px_rgb(0_0_0/30%)]";

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
  if (!canClue) {
    return (
      <section
        aria-label="Give a clue"
        className={`tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:rounded-[14px] tw:px-4 tw:text-game-muted ${CONTROL_PANEL_CLASS} tw:ring-1 tw:ring-game-line`}
      >
        {waitingText}
      </section>
    );
  }

  return (
    <section
      aria-label="Give a clue"
      className={`tw:flex tw:min-h-14 tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-[14px] tw:px-4 tw:py-2 ${CONTROL_PANEL_CLASS} tw:ring-2 tw:ring-game-text`}
    >
      {/* With one other player, such as in a 2-player game, the clue can only go to them, and their
      hand stands out, so the panel shows only the clues. */}
      {targets.length > 1 && (
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
                  onChooseTarget(chosen ? undefined : playerIndex);
                }}
                ref={fullNameTooltip(name)}
                type="button"
              >
                {name}
              </button>
            );
          })}
        </div>
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
                onChooseClue(pressed ? undefined : colorClue);
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
                onChooseClue(pressed ? undefined : rankClue);
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
