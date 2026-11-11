import { useEffect, useRef } from "react";
import * as tooltips from "../../tooltips.ts";

/** Explains the two efficiency numbers, in the words of the classic screen's tooltip. */
const EFFICIENCY_HELP = `
  <span class="small-tooltip-text">
    The first number is the minimum amount of efficiency needed from<br />
    this turn onward in order to win (i.e. future required efficiency).<br />
    The second number shows the minimum possible efficiency needed<br />
    to win with the current number of players and the current variant.
  </span>
`;

/** The plain text of `EFFICIENCY_HELP`, for screen readers. */
const EFFICIENCY_HELP_LABEL =
  "About efficiency: the first number is the future required efficiency, and the second number is the minimum possible efficiency needed to win with the current number of players and the current variant.";

interface StatusStripProps {
  readonly turn: number;
  readonly score: number;
  readonly maxScore: number;
  readonly pace: string;
  readonly futureEfficiency: string;
  readonly minEfficiency: string;
  readonly variantName: string;
  readonly canOpenReplay: boolean;

  /** A finished game is all replay, so it has no button to open one. */
  readonly finished: boolean;
  readonly onOpenReplay: () => void;
  readonly onClassicView: () => void;
  readonly onLobby: () => void;
}

function Stat({
  label,
  children,
}: {
  readonly label: React.ReactNode;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
      <span className="tw:text-[13px] tw:text-game-muted">{label}</span>
      <span className="tw:truncate tw:text-[22px] tw:font-bold tw:text-game-text tw:narrow-980:text-[17px]">
        {children}
      </span>
    </div>
  );
}

/**
 * A question mark that explains the stat beside it in a tooltip, like those on the lobby screens.
 */
function HelpIcon({
  label,
  tooltip,
}: {
  readonly label: string;
  readonly tooltip: string;
}): React.JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => tooltips.attach(ref.current!, tooltip), [tooltip]);

  return (
    <button
      aria-label={label}
      className="tw:ml-1.5 tw:cursor-help tw:border-0 tw:bg-transparent tw:p-0 tw:text-game-link tw:hover:text-game-text"
      ref={ref}
      type="button"
    >
      <i aria-hidden="true" className="fas fa-question-circle" />
    </button>
  );
}

export function OutOf({
  value,
  max,
}: {
  readonly value: number | string;
  readonly max: number | string;
}): React.JSX.Element {
  return (
    <>
      {value}
      <span className="tw:font-medium tw:text-game-muted"> / {max}</span>
    </>
  );
}

const buttonClass =
  "tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-[10px] tw:border-0 tw:bg-game-raised tw:px-4 tw:text-[15px] tw:text-game-text tw:hover:bg-game-line tw:narrow-980:h-9 tw:narrow-980:px-3 tw:narrow-980:text-sm tw:disabled:cursor-default tw:disabled:opacity-50";

/**
 * The numbers about the whole game, along the bottom of the screen, most important first. (The clue
 * tokens and strikes sit with the deck instead, since they are tokens on the table.)
 */
export function StatusStrip({
  turn,
  score,
  maxScore,
  pace,
  futureEfficiency,
  minEfficiency,
  variantName,
  canOpenReplay,
  finished,
  onOpenReplay,
  onClassicView,
  onLobby,
}: StatusStripProps): React.JSX.Element {
  return (
    <footer className="tw:flex tw:h-[76px] tw:shrink-0 tw:items-center tw:gap-8 tw:border-t tw:border-game-raised tw:bg-game-panel tw:px-7 tw:narrow-980:h-auto tw:narrow-980:flex-wrap tw:narrow-980:gap-x-5 tw:narrow-980:gap-y-2 tw:narrow-980:px-3 tw:narrow-980:py-3">
      <Stat label="Turn">{turn}</Stat>
      <Stat label="Score">
        <OutOf max={maxScore} value={score} />
      </Stat>
      <Stat label="Pace">{pace}</Stat>
      <Stat
        label={
          <>
            Efficiency
            <HelpIcon label={EFFICIENCY_HELP_LABEL} tooltip={EFFICIENCY_HELP} />
          </>
        }
      >
        <OutOf max={minEfficiency} value={futureEfficiency} />
      </Stat>
      <div className="tw:min-w-0 tw:flex-auto">
        <span className="tw:text-[13px] tw:text-game-muted">Variant</span>
        <div className="tw:truncate tw:text-[22px] tw:font-bold tw:text-game-muted tw:narrow-980:text-[17px]">
          {variantName}
        </div>
      </div>
      <div className="tw:ml-auto tw:flex tw:shrink-0 tw:flex-wrap tw:gap-2.5">
        {!finished && (
          <button
            className={buttonClass}
            disabled={!canOpenReplay}
            onClick={onOpenReplay}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-undo" />
            Replay
          </button>
        )}
        <button className={buttonClass} onClick={onClassicView} type="button">
          Classic view
        </button>
        <button className={buttonClass} onClick={onLobby} type="button">
          Lobby
        </button>
      </div>
    </footer>
  );
}
