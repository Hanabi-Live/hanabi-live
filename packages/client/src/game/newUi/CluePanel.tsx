import type { Clue, PlayerIndex, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useLayoutEffect, useRef } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { getRankLabel } from "./Card.tsx";
import { KEY_CLASS, PANEL_SHADOW_CLASS } from "./surfaces.ts";

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

  /**
   * Buttons for the top-right corner, such as those of a hypothetical. They stay usable while the
   * viewer cannot clue.
   */
  readonly actions?: React.ReactNode;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  if (a?.type === "color" && b.type === "color") {
    return a.value.name === b.value.name;
  }

  return a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

const choiceClass = `tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:text-lg tw:font-extrabold tw:disabled:cursor-default tw:disabled:opacity-40 ${KEY_CLASS}`;

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

/** The size of the players' names when they fit, in pixels. */
const PLAYER_FONT_SIZE = 16;

/** The smallest size of the players' names, in pixels. */
const PLAYER_MIN_FONT_SIZE = PLAYER_FONT_SIZE / 2;

/** How much smaller the names get at each step, until they fit, in pixels. */
const PLAYER_FONT_SIZE_STEP = 0.1;

/**
 * A button for each player who can get the clue. They stay on one row. When the row does not fit,
 * its text, padding, and gaps get smaller together until it fits, so that every name shows in full.
 * At narrow widths, the players take a row of their own above the clues.
 */
function PlayerButtons({
  targets,
  target,
  onChooseTarget,
}: Pick<
  CluePanelProps,
  "targets" | "target" | "onChooseTarget"
>): React.JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const names = targets.map(({ name }) => name).join("\n");

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const row = rowRef.current!;
    function fit() {
      row.style.fontSize = `${PLAYER_FONT_SIZE}px`;
      const fullWidth = row.offsetWidth;
      // The full width is the space that the row asks for, so that its new size does not change the
      // space that it gets.
      outer.style.flexBasis = `${fullWidth}px`;
      const room = outer.clientWidth;
      let fontSize =
        fullWidth > room
          ? Math.floor((10 * PLAYER_FONT_SIZE * room) / fullWidth) / 10
          : PLAYER_FONT_SIZE;
      row.style.fontSize = `${fontSize}px`;

      // Text does not always shrink in proportion to its size: letters can snap to whole pixels,
      // and letter spacing in pixels does not shrink. So it gets smaller until it really fits.
      while (row.offsetWidth > room && fontSize > PLAYER_MIN_FONT_SIZE) {
        fontSize -= PLAYER_FONT_SIZE_STEP;
        row.style.fontSize = `${fontSize}px`;
      }
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    // The names are measured again when a font loads, which can change their width.
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [names]);

  return (
    <div
      className="tw:mr-2 tw:max-w-full tw:min-w-0 tw:narrow-980:mr-0 tw:narrow-980:w-full"
      ref={outerRef}
    >
      <div
        aria-label="Player to clue"
        className="tw:flex tw:w-max tw:gap-[0.5em]"
        ref={rowRef}
        role="group"
      >
        {targets.map(({ playerIndex, name }) => {
          const chosen = playerIndex === target;
          return (
            <button
              aria-pressed={chosen}
              className={`${KEY_CLASS} tw:h-11 tw:cursor-pointer tw:rounded-full tw:border-0 tw:px-[1em] tw:font-semibold tw:whitespace-nowrap ${
                chosen
                  ? "tw:bg-game-text tw:text-card-ink"
                  : "tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line"
              }`}
              key={playerIndex}
              onClick={() => {
                onChooseTarget(chosen ? undefined : playerIndex);
              }}
              type="button"
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
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
  actions,
}: CluePanelProps): React.JSX.Element {
  const label = getGiveButtonLabel(target, clue, clueTouchesNothing);

  const hiddenClass = canClue ? "" : "tw:invisible tw:narrow-980:hidden";

  const targetButtons = (
    <>
      {/* With one other player, such as in a 2-player game, the clue can only go to them, and
          their hand stands out, so the panel shows only the clues. */}
      {targets.length > 1 && (
        <PlayerButtons
          onChooseTarget={onChooseTarget}
          target={target}
          targets={targets}
        />
      )}
    </>
  );

  const clueButtons = (
    <>
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
          className={`tw:min-h-11 tw:shrink-0 tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-6 tw:text-[17px] tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
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
    </>
  );

  const idleRingClass =
    actions === undefined
      ? "tw:inset-ring-1 tw:inset-ring-game-line"
      : "tw:inset-ring-1 tw:inset-ring-game-mode";

  // While the viewer cannot clue, the buttons keep their place, hidden behind the reason. So the
  // panel is the same size on every turn, and the hands above it do not change size. On a narrow
  // window, the page scrolls instead, so the buttons go away and the panel is short.
  return (
    <section
      aria-label="Give a clue"
      // A solid panel that sits above the table, like the bar along the bottom and the chat, so
      // that it reads as something to operate and not as part of the game. When the viewer can give
      // a clue, a gold ring marks it, like the current player's hand. Otherwise, a thin line edges
      // it. In a hypothetical, the panel has the colors of the mode, as the replay bar does.
      className={`tw:relative tw:flex tw:min-h-17 tw:flex-wrap tw:items-center tw:gap-2.5 tw:rounded-game-panel tw:px-4 tw:py-3 ${PANEL_SHADOW_CLASS} ${
        actions === undefined ? "tw:bg-game-panel" : "tw:bg-game-mode-panel"
      } ${canClue ? "tw:inset-ring-3 tw:inset-ring-game-turn" : idleRingClass}`}
    >
      {!canClue && (
        <div className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:px-4 tw:text-center tw:text-[18px] tw:font-semibold tw:text-game-muted tw:narrow-980:static tw:narrow-980:justify-start tw:narrow-980:px-0 tw:narrow-980:text-left tw:narrow-980:text-[15px] tw:narrow-980:font-normal tw:select-none">
          {waitingText}
        </div>
      )}
      {actions === undefined ? (
        <div className={`tw:contents ${hiddenClass}`}>
          {targetButtons}
          {clueButtons}
        </div>
      ) : (
        <>
          {/* The players are on the left of the actions, and the clues are below both. On a
              narrow window, the actions go first, so that they stay above the reason. */}
          <div className="tw:flex tw:w-full tw:flex-wrap tw:items-center tw:gap-2.5 tw:narrow-980:order-first">
            <div
              className={`tw:min-w-0 tw:flex-1 tw:empty:hidden ${hiddenClass}`}
            >
              {targetButtons}
            </div>
            {/* Over the reason, which covers the panel, so that the buttons can be clicked. */}
            <div className="tw:relative tw:ml-auto tw:flex tw:flex-wrap tw:justify-end tw:gap-2 tw:narrow-980:w-full tw:narrow-980:*:flex-1">
              {actions}
            </div>
          </div>
          <div className={`tw:contents ${hiddenClass}`}>{clueButtons}</div>
        </>
      )}
    </section>
  );
}
