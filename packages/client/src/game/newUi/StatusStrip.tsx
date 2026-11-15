import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRefHtml } from "../../tooltipRef.ts";
import {
  HARD_VARIANT_EFFICIENCY_COLOR,
  LOW_SCORE_PHASE_COLOR,
  MODIFIED_EFFICIENCY_COLOR,
} from "../ui/constants.ts";
import { useElementSize } from "./hooks.ts";
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
   * The HTML of the tooltip of the turn's information icon: the most turns and rounds that are
   * left.
   */
  readonly turnTooltip: string;

  /** Asks which turn to go to. */
  readonly onTurnClick: () => void;

  /**
   * The last turn of the game, while the screen shows a replay, so that the turn reads as "5 / 21".
   * It is `undefined` in the game as it stands, in a hypothetical, and in a spoiler-free replay.
   */
  readonly lastTurn: number | undefined;
  /**
   * The score, or in "Throw It in a Hole" variants, where the players cannot see the score, the
   * cards that they played.
   */
  readonly score: number;

  /** The maximum score, or `undefined` when the players cannot see the score. */
  readonly maxScore: number | undefined;

  /** "Score", or "Plays" when the players cannot see the score. */
  readonly scoreLabel: string;

  /**
   * Whether the score is in the H-Group's "Low Score Phase" and the player follows the H-Group's
   * conventions, so that it is in another color, as on the classic screen.
   */
  readonly lowScorePhase: boolean;

  /**
   * How a finished game ended, on every turn of its replay, with a tooltip in HTML. The classic
   * screen writes it in its action log. Here, an icon beside the score shows it, so that the bar
   * does not grow.
   */
  readonly result:
    { readonly summary: string; readonly tooltipHtml: string } | undefined;

  readonly pace: string;

  /** The color of the pace, by how risky it would be to discard, as on the classic screen. */
  readonly paceColor: string | undefined;
  readonly futureEfficiency: string;

  /** Whether the player's own modifier changes the future efficiency, so it is in another color. */
  readonly efficiencyModified: boolean;

  /** The HTML of the tooltip on the future efficiency, which breaks it down. */
  readonly efficiencyTooltip: string;

  /** Asks for a modifier of the cards gotten. */
  readonly onEfficiencyClick: () => void;
  readonly minEfficiency: string;

  /**
   * Whether the variant is "Hard" and the player follows the H-Group's conventions, so that the
   * minimum efficiency is in another color, as on the classic screen.
   */
  readonly hardVariant: boolean;

  /** Whether the colored numbers are also bold, for players who cannot tell the colors apart. */
  readonly colorblindMode: boolean;
  readonly variantName: string;

  /** The HTML of the tooltip on the variant: the game's seed, options, and table. */
  readonly gameInfoTooltip: string;
  /**
   * The button that goes into the in-game replay and back out. A finished game is all replay, so it
   * has none.
   */
  readonly replayToggle: ReplayToggleProps | undefined;

  /** The controls of the replay that the screen shows, or `undefined` in the game as it stands. */
  readonly replayControls: React.ReactNode;

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
function GroupDivider({
  className = "",
}: {
  readonly className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:h-10 tw:w-px tw:shrink-0 tw:self-center tw:bg-game-line tw:narrow-980:hidden ${className}`}
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
      className="tw:ml-1.5 tw:cursor-help tw:border-0 tw:bg-transparent tw:p-0 tw:text-game-muted tw:hover:text-game-text"
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
  maxStyle,
}: {
  readonly value: React.ReactNode;
  readonly max: number | string;
  readonly maxStyle?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <>
      {value}{" "}
      {/* The maximum score pops when it drops (see "scoreMotion.ts"). A transform needs a box. */}
      <span
        className="tw:inline-block tw:font-medium tw:text-game-muted"
        data-out-of-max
        style={maxStyle}
      >
        / {max}
      </span>
    </>
  );
}

/**
 * A value that opens a prompt when clicked. It looks like the other values, and a dotted line under
 * it on hover shows that it does something. The line goes under a child with `VALUE_LINE_CLASS`.
 */
const VALUE_BUTTON_CLASS =
  "tw:group tw:cursor-pointer tw:rounded-sm tw:border-0 tw:bg-transparent tw:p-0 tw:text-left tw:text-inherit tw:[font:inherit] tw:outline-none";

/**
 * The dotted line under the text of a value button. It is a border, not an underline, so it runs on
 * under the parts of a value such as " / 66", which are boxes of their own that an underline skips.
 * It goes on an inline element, where a border takes no space, so the bar does not move.
 */
const VALUE_LINE_CLASS =
  "tw:border-b-2 tw:border-dotted tw:border-transparent tw:group-hover:border-current tw:group-focus-visible:border-current";

/**
 * Puts the tooltip of a value in the smaller text of the screen's other tooltips. Its labels are
 * wide enough for "Current cards noted as gotten" to fit on one line.
 */
function valueTooltip(html: string): string {
  return `<div class="small-tooltip-text tw:[&_.efficiency-description]:w-[14em]">${html}</div>`;
}

/** The color of a number that a setting or the player's own modifier marks, and its weight. */
function markedStyle(
  color: string,
  marked: boolean,
  colorblindMode: boolean,
): React.CSSProperties | undefined {
  return marked
    ? {
        color,
        fontWeight: colorblindMode ? "bold" : undefined,
      }
    : undefined;
}

/**
 * The turn and the score hold the space of a two-digit number from the start. With digits of equal
 * width, every two-digit number takes the same space. (A turn of 100 or more is rare.)
 */
const FIRST_TWO_DIGIT_NUMBER = 10;

/** The shape of a button on the bar. It sets no color. */
const BUTTON_SHAPE_CLASS = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:px-4 tw:text-[15px] tw:narrow-980:h-9 tw:narrow-980:px-3 tw:narrow-980:text-sm tw:disabled:cursor-default tw:disabled:opacity-50 ${KEY_CLASS}`;

const buttonClass = `${BUTTON_SHAPE_CLASS} tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line`;

/** How many times the replay button pulses when it becomes our turn while we look back. */
const OUR_TURN_PULSES = 3;

/** How long one pulse of the replay button takes, in milliseconds. */
const OUR_TURN_PULSE_MILLISECONDS = 1200;

interface ReplayToggleProps {
  readonly inReplay: boolean;
  /** Whose turn it is in the game now, which the screen does not show while we look back. */
  readonly currentName: string | undefined;
  readonly ourTurn: boolean;
  readonly reducedMotion: boolean;
  readonly onToggle: () => void;
}

/**
 * One button goes into the in-game replay and back out, so that a player finds the way out where
 * they went in. In the replay, it is lit and says whose turn it is in the game. When it is our
 * turn, it is in the color that marks our turn. When our turn comes while we look back, a ring also
 * pulses out of it a few times, so that we do not keep the other players waiting. Both labels hold
 * their space, so the button keeps its size, and the buttons beside it do not move.
 */
function ReplayToggle({
  inReplay,
  currentName,
  ourTurn,
  reducedMotion,
  onToggle,
}: ReplayToggleProps): React.JSX.Element {
  const ringRef = useRef<HTMLSpanElement>(null);
  const wasOurTurn = useRef(ourTurn);
  useLayoutEffect(() => {
    const ring = ringRef.current;
    const turnCame = ourTurn && !wasOurTurn.current;
    wasOurTurn.current = ourTurn;
    if (ring === null || !turnCame || !inReplay || reducedMotion) {
      return undefined;
    }
    const pulse = ring.animate(
      [
        {
          opacity: 0.8,
          transform: "scale(1)",
        },
        {
          opacity: 0,
          transform: "scale(1.15, 1.6)",
        },
      ],
      {
        duration: OUR_TURN_PULSE_MILLISECONDS,
        easing: "ease-out",
        iterations: OUR_TURN_PULSES,
      },
    );
    return () => {
      pulse.cancel();
    };
  }, [ourTurn, inReplay, reducedMotion]);

  let colorClass = buttonClass;
  if (inReplay) {
    colorClass = ourTurn
      ? `${BUTTON_SHAPE_CLASS} tw:bg-game-turn tw:font-bold tw:text-card-ink tw:hover:brightness-110`
      : `${BUTTON_SHAPE_CLASS} tw:bg-game-text tw:font-bold tw:text-card-ink tw:hover:bg-white`;
  }

  return (
    <div className="tw:relative tw:shrink-0">
      <span
        aria-hidden="true"
        className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-game-control tw:opacity-0 tw:ring-2 tw:ring-game-turn"
        ref={ringRef}
      />
      <button
        className={`${colorClass} tw:relative tw:grid tw:leading-tight`}
        onClick={onToggle}
        type="button"
      >
        <span
          className={`tw:flex tw:items-center tw:justify-center tw:gap-2 tw:[grid-area:1/1] ${inReplay ? "tw:invisible" : ""}`}
        >
          <i aria-hidden="true" className="fas fa-undo" />
          Replay
        </span>
        <span
          className={`tw:flex tw:flex-col tw:items-center tw:font-bold tw:[grid-area:1/1] ${inReplay ? "" : "tw:invisible"}`}
        >
          Back to the game
          {/* The name does not widen the button. A long one is cut off. */}
          {currentName !== undefined && (
            <span
              className={`tw:w-0 tw:min-w-full tw:truncate tw:text-center tw:text-xs ${ourTurn ? "tw:font-bold" : "tw:font-medium tw:opacity-70"}`}
              data-live-turn
            >
              {ourTurn ? "Your turn" : `${currentName}'s turn`}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

/**
 * The attribute that gives the replay controls a row of their own. The bar's styles for that layout
 * depend on it (as "data-own-row"), so that the bar can try the one-row layout without drawing it.
 */
const OWN_ROW_ATTRIBUTE = "data-own-row";

/**
 * Whether the replay controls need a row of their own, because the bar has no room for them in one
 * row with the numbers and the buttons. In one row, nothing in the bar wraps, so the bar or the
 * controls overflow when they have no room. After each render and resize, the bar takes away the
 * attribute of the two-row layout, checks whether anything overflows, and puts the attribute back.
 * All of it happens before the browser draws the bar.
 */
function useOwnRow(
  footer: HTMLElement | null,
  controls: RefObject<HTMLDivElement | null>,
): boolean {
  // Measures again when the bar's width changes.
  useElementSize(footer);
  const [ownRow, setOwnRow] = useState(false);
  useLayoutEffect(() => {
    const group = controls.current;
    if (footer === null || group === null) {
      setOwnRow(false);
      return;
    }
    const hadOwnRow = footer.hasAttribute(OWN_ROW_ATTRIBUTE);
    footer.removeAttribute(OWN_ROW_ATTRIBUTE);
    const overflows =
      footer.scrollWidth > footer.clientWidth
      || group.scrollWidth > group.clientWidth;
    if (hadOwnRow) {
      footer.setAttribute(OWN_ROW_ATTRIBUTE, "");
    }
    setOwnRow(overflows);
  });
  return ownRow;
}

/**
 * The numbers about the whole game, along the bottom of the screen, most important first. (The clue
 * tokens and strikes sit with the deck instead, since they are tokens on the table.) In a replay,
 * the bar takes the colors of the screen's mode, and its controls are in the middle. So the numbers
 * and the buttons do not move when a replay starts or ends.
 */
export function StatusStrip({
  turn,
  turnTooltip,
  onTurnClick,
  lastTurn,
  score,
  maxScore,
  scoreLabel,
  lowScorePhase,
  result,
  pace,
  paceColor,
  futureEfficiency,
  efficiencyModified,
  efficiencyTooltip,
  onEfficiencyClick,
  minEfficiency,
  hardVariant,
  colorblindMode,
  variantName,
  gameInfoTooltip,
  replayToggle,
  replayControls,
  viewAsMenu,
  tableMenu,
  onClassicView,
  onLobby,
}: StatusStripProps): React.JSX.Element {
  const reservedTurn = Math.max(lastTurn ?? turn, FIRST_TWO_DIGIT_NUMBER);
  const reservedScore = Math.max(score, FIRST_TWO_DIGIT_NUMBER);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const inReplay = replayControls !== undefined;
  const controlsRef = useRef<HTMLDivElement>(null);
  const ownRow = useOwnRow(footer, controlsRef);

  let colorClass = "tw:border-t tw:border-game-raised tw:bg-game-panel";
  if (inReplay) {
    colorClass =
      "tw:border-0 tw:border-t-2 tw:border-solid tw:border-game-mode tw:bg-game-mode-panel";
  }

  return (
    <footer
      className={`tw:group/strip tw:flex tw:h-[76px] tw:shrink-0 tw:items-center tw:gap-8 tw:px-7 ${colorClass} tw:data-own-row:h-auto tw:data-own-row:flex-wrap tw:data-own-row:gap-y-2.5 tw:data-own-row:py-2.5 tw:narrow-980:h-auto tw:narrow-980:flex-wrap tw:narrow-980:gap-x-5 tw:narrow-980:gap-y-2 tw:narrow-980:px-3 tw:narrow-980:py-3`}
      data-own-row={ownRow ? "" : undefined}
      ref={setFooter}
    >
      {/* Three groups, split by thin lines: the game's progress, the numbers that help to plan,
          and what game this is. */}
      <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:narrow-980:gap-5">
        <Stat
          label={
            <>
              Turn
              <HelpIcon
                icon="fa-info-circle"
                label="About the turns: how many turns and rounds are left at most."
                tooltip={valueTooltip(turnTooltip)}
              />
            </>
          }
        >
          {/* An invisible "10 / 10" holds the space (or the real turn, if it is wider). Then the bar
              does not move when a replay adds " / 21" to the turn, or when the turn reaches 10. */}
          <button
            aria-label={`Turn ${turn}. Go to another turn.`}
            className={`${VALUE_BUTTON_CLASS} tw:inline-grid tw:tabular-nums`}
            onClick={onTurnClick}
            type="button"
          >
            <span
              aria-hidden="true"
              className="tw:invisible tw:col-start-1 tw:row-start-1"
            >
              <OutOf max={reservedTurn} value={reservedTurn} />
            </span>
            <span className="tw:col-start-1 tw:row-start-1" data-turn>
              <span className={VALUE_LINE_CLASS}>
                {lastTurn === undefined ? (
                  turn
                ) : (
                  <OutOf max={lastTurn} value={turn} />
                )}
              </span>
            </span>
          </button>
        </Stat>
        <Stat
          label={
            <>
              {scoreLabel}
              {result !== undefined && (
                <HelpIcon
                  icon="fa-info-circle"
                  label={`How the game ended: ${result.summary}`}
                  tooltip={valueTooltip(result.tooltipHtml)}
                />
              )}
            </>
          }
          size="large"
          truncate={false}
        >
          {/* The score glows red when the last strike ends the game (see "playMotion.ts"). */}
          <span
            className="tw:inline-block"
            data-score
            style={markedStyle(
              LOW_SCORE_PHASE_COLOR,
              lowScorePhase,
              colorblindMode,
            )}
          >
            {/* Like the turn, an invisible "10 / 25" holds the space, so that the bar does not
                move when the score reaches 10. The score starts at the left, under its label. */}
            <span className="tw:inline-grid tw:tabular-nums">
              <span
                aria-hidden="true"
                className="tw:invisible tw:col-start-1 tw:row-start-1"
              >
                {maxScore === undefined ? (
                  reservedScore
                ) : (
                  <OutOf max={maxScore} value={reservedScore} />
                )}
              </span>
              <span className="tw:col-start-1 tw:row-start-1">
                {maxScore === undefined ? (
                  score
                ) : (
                  <OutOf max={maxScore} value={score} />
                )}
              </span>
            </span>
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
          <span data-pace style={{ color: paceColor }}>
            {pace}
          </span>
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
          <span data-efficiency>
            <OutOf
              max={minEfficiency}
              maxStyle={markedStyle(
                HARD_VARIANT_EFFICIENCY_COLOR,
                hardVariant,
                colorblindMode,
              )}
              value={
                <button
                  aria-label={`Future efficiency ${futureEfficiency}. Add a modifier.`}
                  className={VALUE_BUTTON_CLASS}
                  onClick={onEfficiencyClick}
                  ref={tooltipRefHtml(valueTooltip(efficiencyTooltip))}
                  style={markedStyle(
                    MODIFIED_EFFICIENCY_COLOR,
                    efficiencyModified,
                    colorblindMode,
                  )}
                  type="button"
                >
                  <span className={VALUE_LINE_CLASS}>{futureEfficiency}</span>
                </button>
              }
            />
          </span>
        </Stat>
      </div>
      <GroupDivider />
      {/* The variant opens the game's information: its seed, options, and table. Its name gives up
          its room first, so that the replay controls keep theirs. */}
      <div
        className={`tw:flex tw:flex-initial tw:flex-col tw:gap-0.5 ${inReplay ? "tw:min-w-20" : "tw:min-w-0"}`}
      >
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
      {inReplay && (
        <GroupDivider className="tw:group-data-own-row/strip:hidden" />
      )}
      {inReplay && (
        <div
          // When the controls have a row of their own, and on a narrow window, they are on top.
          className="tw:flex tw:shrink-0 tw:grow tw:basis-0 tw:group-data-own-row/strip:order-first tw:group-data-own-row/strip:basis-full tw:narrow-980:order-first tw:narrow-980:basis-full"
          ref={controlsRef}
        >
          {replayControls}
        </div>
      )}
      <div className="tw:ml-auto tw:flex tw:max-w-full tw:shrink-0 tw:flex-wrap tw:justify-end tw:gap-2.5">
        <button className={buttonClass} onClick={onClassicView} type="button">
          Classic UI
        </button>
        {replayToggle !== undefined && <ReplayToggle {...replayToggle} />}
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
