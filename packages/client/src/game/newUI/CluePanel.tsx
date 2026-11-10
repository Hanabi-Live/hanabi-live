import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { getRankLabel } from "./Card";

interface CluePanelProps {
  readonly variant: Variant;
  readonly colorblindMode: boolean;

  /** Whether it is the viewer's turn and the team has a clue to give. */
  readonly canClue: boolean;

  /** Why the viewer cannot clue, shown in place of the buttons. */
  readonly waitingText: string;

  /** The name of the chosen player, if any. */
  readonly targetName: string | undefined;

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

/** The controls for giving a clue: pick a player's hand, then a color or a rank. */
export function CluePanel({
  variant,
  colorblindMode,
  canClue,
  waitingText,
  targetName,
  clue,
  onChooseClue,
  canGive,
  onGive,
}: CluePanelProps): React.JSX.Element {
  if (!canClue) {
    return (
      <section
        aria-label="Give a clue"
        className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:rounded-[14px] tw:bg-surface tw:px-4 tw:text-text-label"
      >
        {waitingText}
      </section>
    );
  }

  return (
    <section
      aria-label="Give a clue"
      className="tw:flex tw:min-h-14 tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:rounded-[14px] tw:bg-surface tw:px-4 tw:py-2"
    >
      <span className="tw:mr-1 tw:min-w-0 tw:truncate tw:text-text-label">
        {targetName === undefined ? "Pick a hand" : `Clue ${targetName}:`}
      </span>
      {variant.clueColors.map((color) => {
        const colorClue = newColorClue(color);
        const pressed = isSameClue(clue, colorClue);
        return (
          <button
            aria-label={color.name}
            aria-pressed={pressed}
            className={`${choiceClass} ${pressed ? "tw:ring-3 tw:ring-text-strong" : ""}`}
            disabled={targetName === undefined}
            key={color.name}
            onClick={() => {
              onChooseClue(colorClue);
            }}
            style={{
              background: colorblindMode ? color.fillColorblind : color.fill,
            }}
            title={color.name}
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
            className={`${choiceClass} tw:bg-text-strong tw:text-surface ${pressed ? "tw:ring-3 tw:ring-clue" : ""}`}
            disabled={targetName === undefined}
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
    </section>
  );
}
