interface StatusStripProps {
  readonly turn: number;
  readonly score: number;
  readonly maxScore: number;
  readonly pace: string;
  readonly futureEfficiency: string;
  readonly minEfficiency: string;
  readonly variantName: string;
  readonly canOpenReplay: boolean;
  readonly onOpenReplay: () => void;
  readonly onClassicView: () => void;
  readonly onLobby: () => void;
}

function Stat({
  label,
  children,
}: {
  readonly label: string;
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
      <div title="The efficiency that the rest of the game needs, and the efficiency that the whole game needed at the start">
        <Stat label="Efficiency, needed / at start">
          <OutOf max={minEfficiency} value={futureEfficiency} />
        </Stat>
      </div>
      <div className="tw:min-w-0 tw:max-w-[260px]">
        <span className="tw:text-[13px] tw:text-game-muted">Variant</span>
        <div className="tw:truncate tw:text-[22px] tw:font-bold tw:text-game-muted tw:narrow-980:text-[17px]">
          {variantName}
        </div>
      </div>
      <div className="tw:ml-auto tw:flex tw:shrink-0 tw:flex-wrap tw:gap-2.5">
        <button
          className={buttonClass}
          disabled={!canOpenReplay}
          onClick={onOpenReplay}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-undo" />
          Replay
        </button>
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
