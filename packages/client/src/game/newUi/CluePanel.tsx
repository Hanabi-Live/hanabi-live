import type { Clue, PlayerIndex, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { tooltipRef } from "../../tooltipRef.ts";
import { getRankLabel } from "./Card.tsx";
import { KEY_CLASS } from "./surfaces.ts";

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

  /** Whether the chosen clue touches no cards in the chosen hand, and the rules forbid that. */
  readonly clueTouchesNothing: boolean;
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
 * The surface of the controls below the hands: a solid panel that sits above the table, like the
 * bar along the bottom and the chat, so that it reads as something to operate and not as part of
 * the game. When the viewer can give a clue, a gold ring marks it, like the current player's hand.
 * Otherwise, a thin line edges it.
 */
export const CONTROL_PANEL_CLASS =
  "tw:bg-game-panel tw:shadow-[0_4px_14px_rgb(0_0_0/30%)]";

const choiceClass = `tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[10px] tw:border-0 tw:text-lg tw:font-extrabold tw:disabled:cursor-default tw:disabled:opacity-40 ${KEY_CLASS}`;

/** Says that a clue touches no cards in the chosen hand. */
function getTouchesNothingLabel(clue: Clue): string {
  if (clue.type === "color") {
    return `No ${clue.value.name.toLowerCase()} cards in that hand`;
  }

  return `No ${clue.value}s in that hand`;
}

/**
 * Until the clue is ready, the "Give clue" button says what the player still has to choose, or why
 * they cannot give the chosen clue.
 */
function getGiveButtonLabel(
  target: PlayerIndex | undefined,
  clue: Clue | undefined,
  clueTouchesNothing: boolean,
): string {
  if (target === undefined) {
    return "Pick a player";
  }

  if (clue === undefined) {
    return "Pick a color or number";
  }

  return clueTouchesNothing ? getTouchesNothingLabel(clue) : "Give clue";
}

/** Every label that the "Give clue" button can show in this variant. */
function getGiveButtonLabels(variant: Variant): readonly string[] {
  return [
    "Pick a player",
    "Pick a color or number",
    "Give clue",
    ...variant.clueColors.map((color) =>
      getTouchesNothingLabel(newColorClue(color)),
    ),
    ...variant.clueRanks.map((rank) =>
      getTouchesNothingLabel(newRankClue(rank)),
    ),
  ];
}

/**
 * The controls for giving a clue: pick a player (with their button here, or by clicking their
 * hand), then a color or a rank. The buttons are large, because a player clicks them every turn.
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
  clueTouchesNothing,
  onGive,
}: CluePanelProps): React.JSX.Element {
  const label = getGiveButtonLabel(target, clue, clueTouchesNothing);

  // While the viewer cannot clue, the buttons keep their place, hidden behind the reason. So the
  // panel is the same size on every turn, and the hands above it do not change size. On a narrow
  // window, the page scrolls instead, so the buttons go away and the panel is short.
  return (
    <section
      aria-label="Give a clue"
      className={`tw:relative tw:flex tw:min-h-17 tw:flex-wrap tw:items-center tw:gap-2.5 tw:rounded-[14px] tw:px-4 tw:py-3 ${CONTROL_PANEL_CLASS} ${
        canClue ? "tw:ring-3 tw:ring-game-turn" : "tw:ring-1 tw:ring-game-line"
      }`}
    >
      {!canClue && (
        <div className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:px-4 tw:text-center tw:text-[18px] tw:font-semibold tw:text-game-muted tw:narrow-980:static tw:narrow-980:justify-start tw:narrow-980:px-0 tw:narrow-980:text-left tw:narrow-980:text-[15px] tw:narrow-980:font-normal">
          {waitingText}
        </div>
      )}
      <div
        className={`tw:contents ${canClue ? "" : "tw:invisible tw:narrow-980:hidden"}`}
      >
        {/* With one other player, such as in a 2-player game, the clue can only go to them, and
            their hand stands out, so the panel shows only the clues. */}
        {targets.length > 1 && (
          // At narrow widths, the players take a row of their own above the clues.
          <div
            aria-label="Player to clue"
            className="tw:mr-2 tw:flex tw:flex-wrap tw:gap-2 tw:narrow-980:mr-0 tw:narrow-980:w-full"
            role="group"
          >
            {targets.map(({ playerIndex, name }) => {
              const chosen = playerIndex === target;
              return (
                <button
                  aria-pressed={chosen}
                  className={`${KEY_CLASS} tw:h-11 tw:max-w-40 tw:cursor-pointer tw:truncate tw:rounded-full tw:border-0 tw:px-4 tw:text-[16px] tw:font-semibold ${
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
        {/* The colors are on one row and the ranks below them, as on the classic screen, with
      "Give clue" beside both. On a narrow window, "Give clue" goes below them. */}
        <div className="tw:flex tw:flex-auto tw:gap-3 tw:narrow-980:flex-col">
          <div className="tw:flex tw:flex-auto tw:flex-col tw:gap-2">
            <div className="tw:flex tw:flex-wrap tw:gap-2">
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
                      background: colorblindMode
                        ? color.fillColorblind
                        : color.fill,
                    }}
                    type="button"
                  />
                );
              })}
            </div>
            <div className="tw:flex tw:flex-wrap tw:gap-2">
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
            </div>
          </div>
          <button
            className={`tw:min-h-11 tw:shrink-0 tw:cursor-pointer tw:rounded-[10px] tw:border-0 tw:bg-clue tw:px-6 tw:text-[17px] tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
            disabled={!canGive}
            onClick={onGive}
            type="button"
          >
            {/* Every label sits in the same cell, so the button is as wide as the longest one and
                does not change size as the player chooses. */}
            <span className="tw:grid tw:items-center">
              {getGiveButtonLabels(variant).map((buttonLabel) => (
                <span
                  className={`tw:[grid-area:1/1] ${buttonLabel === label ? "" : "tw:invisible"}`}
                  key={buttonLabel}
                >
                  {buttonLabel}
                </span>
              ))}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
