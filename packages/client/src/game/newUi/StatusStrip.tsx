import { tooltipRefHtml } from "../../tooltipRef.ts";

/**
 * Explains the two efficiency numbers, in the words of the classic screen's tooltip. The text wraps
 * in a narrow box: the icon is near the left edge of the window, and a wide tooltip would not fit
 * centered over it.
 */
const EFFICIENCY_HELP = `
  <span class="small-tooltip-text tw:max-w-[19em] tw:narrow-980:max-w-[15em]">
    The first number is the minimum amount of efficiency needed from this turn
    onward in order to win (i.e. future required efficiency).<br />
    The second number shows the minimum possible efficiency needed to win with
    the current number of players and the current variant.
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

  /** The HTML of the tooltip on the variant: the game's seed, options, and table. */
  readonly gameInfoTooltip: string;
  readonly canOpenReplay: boolean;

  /** A finished game is all replay, so it has no button to open one. */
  readonly finished: boolean;
  readonly onOpenReplay: () => void;

  /** The menu to view the game from a seat, for anyone who does not play in it. */
  readonly viewAsMenu: React.ReactNode;

  /** The button to end the game early, for the players of an ongoing game. */
  readonly endGameMenu: React.ReactNode;
  readonly onClassicView: () => void;
  readonly onLobby: () => void;
}

/**
 * The text of a stat's label and value. Their line heights are close to their text, so that the
 * space above the labels and below the values looks the same. (A taller line box adds space above
 * the small labels that no one can see is part of the box.)
 */
const STAT_LABEL_CLASS =
  "tw:block tw:text-[13px] tw:leading-[16px] tw:text-game-muted";

/**
 * The sizes of the values. The score is what players check most, so it is the largest. Pace and
 * efficiency help to plan, so they are smaller and quieter than the game's progress.
 */
const STAT_VALUE_CLASS = {
  large:
    "tw:text-[28px] tw:leading-[30px] tw:font-bold tw:text-game-text tw:narrow-980:text-[20px] tw:narrow-980:leading-[24px]",
  normal:
    "tw:text-[22px] tw:leading-[30px] tw:font-bold tw:text-game-text tw:narrow-980:text-[17px] tw:narrow-980:leading-[24px]",
  small:
    "tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:text-game-text/85 tw:narrow-980:leading-[24px]",
} as const;

function Stat({
  label,
  size = "normal",
  truncate = true,
  children,
}: {
  readonly label: React.ReactNode;
  readonly size?: keyof typeof STAT_VALUE_CLASS;

  /** Whether a long value ends with an ellipsis. A value that pops must not be cut off. */
  readonly truncate?: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
      <span className={STAT_LABEL_CLASS}>{label}</span>
      <span
        className={`tw:block ${truncate ? "tw:truncate" : ""} ${STAT_VALUE_CLASS[size]}`}
      >
        {children}
      </span>
    </div>
  );
}

/** A thin line between two groups of the bar. On a narrow screen, the groups wrap instead. */
function GroupDivider(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="tw:h-10 tw:w-px tw:shrink-0 tw:self-center tw:bg-game-line tw:narrow-980:hidden"
    />
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
  return (
    <button
      aria-label={label}
      className="tw:ml-1.5 tw:cursor-help tw:border-0 tw:bg-transparent tw:p-0 tw:text-game-link tw:hover:text-game-text"
      ref={tooltipRefHtml(tooltip)}
      type="button"
    >
      <i aria-hidden="true" className="fas fa-question-circle" />
    </button>
  );
}

function OutOf({
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
  gameInfoTooltip,
  canOpenReplay,
  finished,
  onOpenReplay,
  viewAsMenu,
  endGameMenu,
  onClassicView,
  onLobby,
}: StatusStripProps): React.JSX.Element {
  return (
    <footer className="tw:flex tw:h-[76px] tw:shrink-0 tw:items-center tw:gap-8 tw:border-t tw:border-game-raised tw:bg-game-panel tw:px-7 tw:narrow-980:h-auto tw:narrow-980:flex-wrap tw:narrow-980:gap-x-5 tw:narrow-980:gap-y-2 tw:narrow-980:px-3 tw:narrow-980:py-3">
      {/* Three groups, split by thin lines: the game's progress, the numbers that help to plan,
          and what game this is. */}
      <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:narrow-980:gap-5">
        <Stat label="Turn">{turn}</Stat>
        <Stat label="Score" size="large" truncate={false}>
          {/* The score pops when a card lands on a stack (see "playMotion.ts"). */}
          <span className="tw:inline-block" data-score>
            <OutOf max={maxScore} value={score} />
          </span>
        </Stat>
      </div>
      <GroupDivider />
      <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:narrow-980:gap-5">
        <Stat label="Pace" size="small">
          {pace}
        </Stat>
        <Stat
          label={
            <>
              Efficiency
              <HelpIcon
                label={EFFICIENCY_HELP_LABEL}
                tooltip={EFFICIENCY_HELP}
              />
            </>
          }
          size="small"
        >
          <OutOf max={minEfficiency} value={futureEfficiency} />
        </Stat>
      </div>
      <GroupDivider />
      {/* The variant opens the game's information: its seed, options, and table. */}
      {/* The button is as wide as the name, so that its tooltip opens over the name. */}
      <div className="tw:flex tw:min-w-0 tw:flex-auto">
        <button
          aria-label={`Variant: ${variantName}. Show the game's information`}
          className="tw:flex tw:max-w-full tw:min-w-0 tw:cursor-help tw:[font-family:inherit] tw:flex-col tw:items-start tw:gap-0.5 tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:text-game-muted tw:hover:text-game-text"
          ref={tooltipRefHtml(gameInfoTooltip)}
          type="button"
        >
          <span className={STAT_LABEL_CLASS}>
            Variant
            <i
              aria-hidden="true"
              className="fas fa-info-circle tw:ml-1.5 tw:text-game-link"
            />
          </span>
          <span className="tw:block tw:max-w-full tw:truncate tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:narrow-980:leading-[24px]">
            {variantName}
          </span>
        </button>
      </div>
      <div className="tw:ml-auto tw:flex tw:max-w-full tw:shrink-0 tw:flex-wrap tw:justify-end tw:gap-2.5">
        <button className={buttonClass} onClick={onClassicView} type="button">
          Classic view
        </button>
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
        {viewAsMenu}
        {endGameMenu}
        {/* "Lobby" sits in the bottom-right corner of the screen, which is easy to find. */}
        <button className={buttonClass} onClick={onLobby} type="button">
          Lobby
        </button>
      </div>
    </footer>
  );
}
