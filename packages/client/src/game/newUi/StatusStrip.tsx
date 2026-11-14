import { tooltipRefHtml } from "../../tooltipRef.ts";
import { KEY_CLASS } from "./surfaces.ts";

/**
 * Explains the two efficiency numbers, in the words of the classic screen's tooltip. The text wraps
 * in a narrow box: the icon is near the left edge of the window, and a wide tooltip would not fit
 * centered over it.
 */
const EFFICIENCY_HELP = `
  <ul class="small-tooltip-text tw:m-0 tw:max-w-[19em] tw:list-disc tw:space-y-2 tw:pl-[1.2em] tw:narrow-980:max-w-[15em]">
    <li>
      <strong>First number:</strong> the efficiency that the team needs from
      now on in order to win.
    </li>
    <li>
      <strong>Second number:</strong> the efficiency needed over the whole
      game, for this variant and number of players.
    </li>
  </ul>
`;

/** The plain text of `EFFICIENCY_HELP`, for screen readers. */
const EFFICIENCY_HELP_LABEL =
  "About efficiency: the first number is the efficiency that the team needs from now on in order to win, and the second number is the efficiency needed over the whole game, for this variant and number of players.";

/** Explains pace, in the words of the classic screen's tooltip. */
const PACE_HELP = `
  <p class="small-tooltip-text tw:m-0 tw:max-w-[19em] tw:narrow-980:max-w-[15em]">
    Pace is a measure of how many discards can happen while still having a
    chance to get the maximum score.
  </p>
`;

/** The plain text of `PACE_HELP`, for screen readers. */
const PACE_HELP_LABEL =
  "About pace: pace is a measure of how many discards can happen while still having a chance to get the maximum score.";

interface StatusStripProps {
  readonly turn: number;

  /**
   * The last turn of the game, while the screen shows a replay, so that the turn reads as "5 / 21".
   * It is `undefined` in the game as it stands, in a hypothetical, and in a spoiler-free replay.
   */
  readonly lastTurn: number | undefined;
  readonly score: number;
  readonly maxScore: number;
  readonly pace: string;

  /** The color of the pace, by how risky it would be to discard, as on the classic screen. */
  readonly paceColor: string | undefined;
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

  /**
   * The players' button for what comes next at the table: to end an ongoing game early, or to play
   * a finished one again.
   */
  readonly tableMenu: React.ReactNode;
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

/** An icon that explains the stat beside it in a tooltip, like those on the lobby screens. */
function HelpIcon({
  icon = "fa-question-circle",
  label,
  tooltip,
}: {
  /** The Font Awesome icon: a question mark for help, or an "i" for information. */
  readonly icon?: string;
  readonly label: string;
  readonly tooltip: string;
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="tw:ml-1.5 tw:cursor-help tw:border-0 tw:bg-transparent tw:p-0 tw:text-game-link tw:hover:text-game-text"
      ref={tooltipRefHtml(tooltip, { instant: true })}
      type="button"
    >
      <i aria-hidden="true" className={`fas ${icon}`} />
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
      {value}{" "}
      {/* The maximum score pops when it drops (see "scoreMotion.ts"). A transform needs a box. */}
      <span
        className="tw:inline-block tw:font-medium tw:text-game-muted"
        data-out-of-max
      >
        / {max}
      </span>
    </>
  );
}

/**
 * The turn holds the space of a two-digit turn from the start. With digits of equal width, every
 * two-digit turn takes the same space. (A turn of 100 or more is rare.)
 */
const FIRST_TWO_DIGIT_TURN = 10;

const buttonClass = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:bg-game-raised tw:px-4 tw:text-[15px] tw:text-game-text tw:hover:bg-game-line tw:narrow-980:h-9 tw:narrow-980:px-3 tw:narrow-980:text-sm tw:disabled:cursor-default tw:disabled:opacity-50 ${KEY_CLASS}`;

/**
 * The numbers about the whole game, along the bottom of the screen, most important first. (The clue
 * tokens and strikes sit with the deck instead, since they are tokens on the table.)
 */
export function StatusStrip({
  turn,
  lastTurn,
  score,
  maxScore,
  pace,
  paceColor,
  futureEfficiency,
  minEfficiency,
  variantName,
  gameInfoTooltip,
  canOpenReplay,
  finished,
  onOpenReplay,
  viewAsMenu,
  tableMenu,
  onClassicView,
  onLobby,
}: StatusStripProps): React.JSX.Element {
  const reservedTurn = Math.max(lastTurn ?? turn, FIRST_TWO_DIGIT_TURN);

  return (
    <footer className="tw:flex tw:h-[76px] tw:shrink-0 tw:items-center tw:gap-8 tw:border-t tw:border-game-raised tw:bg-game-panel tw:px-7 tw:narrow-980:h-auto tw:narrow-980:flex-wrap tw:narrow-980:gap-x-5 tw:narrow-980:gap-y-2 tw:narrow-980:px-3 tw:narrow-980:py-3">
      {/* Three groups, split by thin lines: the game's progress, the numbers that help to plan,
          and what game this is. */}
      <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:narrow-980:gap-5">
        <Stat label="Turn">
          {/* An invisible "10 / 10" holds the space (or the real turn, if it is wider). Then the bar
              does not move when a replay adds " / 21" to the turn, or when the turn reaches 10. */}
          <span className="tw:inline-grid tw:tabular-nums">
            <span
              aria-hidden="true"
              className="tw:invisible tw:col-start-1 tw:row-start-1"
            >
              <OutOf max={reservedTurn} value={reservedTurn} />
            </span>
            <span className="tw:col-start-1 tw:row-start-1" data-turn>
              {lastTurn === undefined ? (
                turn
              ) : (
                <OutOf max={lastTurn} value={turn} />
              )}
            </span>
          </span>
        </Stat>
        <Stat label="Score" size="large" truncate={false}>
          {/* The score glows red when the last strike ends the game (see "playMotion.ts"). */}
          <span className="tw:inline-block" data-score>
            <OutOf max={maxScore} value={score} />
          </span>
        </Stat>
      </div>
      <GroupDivider />
      <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:narrow-980:gap-5">
        <Stat
          label={
            <>
              Pace
              <HelpIcon label={PACE_HELP_LABEL} tooltip={PACE_HELP} />
            </>
          }
          size="small"
        >
          <span style={{ color: paceColor }}>{pace}</span>
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
      <div className="tw:flex tw:min-w-0 tw:flex-auto tw:flex-col tw:gap-0.5">
        <span className={STAT_LABEL_CLASS}>
          Variant
          <HelpIcon
            icon="fa-info-circle"
            label={"Show the game's information: its table, options, and seed"}
            tooltip={gameInfoTooltip}
          />
        </span>
        <span className="tw:block tw:max-w-full tw:truncate tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:text-game-muted tw:narrow-980:leading-[24px]">
          {variantName}
        </span>
      </div>
      <div className="tw:ml-auto tw:flex tw:max-w-full tw:shrink-0 tw:flex-wrap tw:justify-end tw:gap-2.5">
        <button className={buttonClass} onClick={onClassicView} type="button">
          Classic UI
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
        {tableMenu}
        {/* "Lobby" sits in the bottom-right corner of the screen, which is easy to find. */}
        <button className={buttonClass} onClick={onLobby} type="button">
          Lobby
        </button>
      </div>
    </footer>
  );
}
