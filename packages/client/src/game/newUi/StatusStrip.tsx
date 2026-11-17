import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { tooltipRefHtml } from "../../tooltipRef.ts";
import type { EfficiencyStats } from "../efficiency.ts";
import {
  formatEfficiency,
  LOW_SCORE_PHASE_CARDS_PER_SUIT,
} from "../efficiency.ts";
import {
  HARD_VARIANT_EFFICIENCY_COLOR,
  LOW_SCORE_PHASE_COLOR,
  MODIFIED_EFFICIENCY_COLOR,
} from "../ui/constants.ts";
import { useElementSize } from "./hooks.ts";
import { BOTTOM_BAR_BUTTON_COLOR_CLASS, KEY_CLASS } from "./surfaces.ts";

/** What the efficiency numbers mean, for screen readers. */
const EFFICIENCY_HELP_LABEL =
  "About efficiency: the first number is the efficiency that the team needs from now on in order to win, and the second number is the efficiency needed over the whole game, for this variant and number of players.";

/** Explains pace, in the words of the classic screen's tooltip. */
const PACE_HELP = `
  <p class="small-tooltip-text tw:m-0 tw:max-w-[19em] tw:phone:max-w-[15em]">
    Pace is a measure of how many discards can happen while still having a
    chance to get the maximum score.
  </p>
`;

/** The plain text of `PACE_HELP`, for screen readers. */
const PACE_HELP_LABEL =
  "About pace: pace is a measure of how many discards can happen while still having a chance to get the maximum score.";

/** The plain text of `LOW_SCORE_PHASE_HELP`, for screen readers. */
const LOW_SCORE_PHASE_HELP_LABEL = `About the score's color: it is the Low Score Phase of the H-Group's conventions. It lasts until the score reaches ${LOW_SCORE_PHASE_CARDS_PER_SUIT} cards for each suit.`;

/** Explains why the score has another color in the H-Group's "Low Score Phase". */
const LOW_SCORE_PHASE_HELP = `
  <p class="small-tooltip-text tw:m-0 tw:max-w-[19em] tw:phone:max-w-[15em]">
    It is the <strong>Low Score Phase</strong> of the H-Group's conventions. It
    lasts until the score reaches ${LOW_SCORE_PHASE_CARDS_PER_SUIT} cards for
    each suit.
  </p>
`;

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

  readonly pace: string;

  /** The color of the pace, by how risky it would be to discard, as on the classic screen. */
  readonly paceColor: string | undefined;
  readonly futureEfficiency: string;

  /** Whether the player's own modifier changes the future efficiency, so it is in another color. */
  readonly efficiencyModified: boolean;

  /** The numbers that the efficiency's tooltip breaks the efficiency into. */
  readonly efficiencyStats: EfficiencyStats;

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

  /**
   * The button that opens and collapses the chat. The bar shows it only in the phone layout, where
   * the chat's rail is hidden, so that the table gets its width.
   */
  readonly chatButton: React.ReactNode;
  readonly onClassicView: () => void;
  readonly onLobby: () => void;
  /** Whether the game screen uses the phone layout (see "GameScreen.tsx"). */
  readonly phoneLayout: boolean;
  /**
   * Whether the bar is a panel at the bottom of the right column instead of a bar along the bottom
   * of the screen (see "GameScreen.tsx").
   */
  readonly panel: boolean;
  /** Holds the bar's element, so that the game screen can measure it. */
  readonly footerRef: RefObject<HTMLElement | null>;
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
    "tw:text-[28px] tw:leading-[30px] tw:font-bold tw:text-game-text tw:phone:text-[20px] tw:phone:leading-[24px]",
  normal:
    "tw:text-[22px] tw:leading-[30px] tw:font-bold tw:text-game-text tw:phone:text-[17px] tw:phone:leading-[24px]",
  small:
    "tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:text-game-text/85 tw:phone:leading-[24px]",
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
      className={`tw:h-10 tw:w-px tw:shrink-0 tw:self-center tw:bg-game-line tw:phone:hidden ${className}`}
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

/** Puts the tooltip of a value in the smaller text of the screen's other tooltips. */
function valueTooltip(html: string): string {
  return `<div class="small-tooltip-text">${html}</div>`;
}

/**
 * The HTML of the efficiency's tooltip. It is laid out like the game's information: a title, then
 * short rows, with no blank lines. The first group names the two numbers on the screen, so that it
 * also explains them. The other groups break the first number down, as on the classic screen. All
 * of the rows are in one grid, so that the values of every group line up.
 */
function getEfficiencyTooltip(
  stats: EfficiencyStats,
  futureEfficiency: string,
  minEfficiency: string,
): string {
  const groups: ReadonlyArray<
    ReadonlyArray<readonly [label: string, value: number | string]>
  > = [
    [
      ["Needed from now on to win", futureEfficiency],
      ["Needed over the whole game", minEfficiency],
    ],
    [
      ["Cards gotten", stats.cardsGotten],
      ["Cards noted as gotten", stats.cardsGottenByNotes ?? "-"],
      ["Cards gotten modifier", stats.modifier ?? "-"],
      ["Potential clues lost", stats.potentialCluesLost],
      ["Current efficiency", formatEfficiency(stats.currentEfficiency)],
    ],
    [
      ["Cards left to get", stats.cardsNotGotten],
      ["Clues left to give", stats.cluesStillUsableNotRounded ?? "-"],
      ["Spare clues", stats.spareClues ?? "-"],
    ],
  ];

  // The first row of each group has a gap above it.
  const cells = groups
    .flatMap((rows) =>
      rows.map(([label, value], i) => {
        const gap = i === 0 ? ' class="tw:mt-2"' : "";
        return `<span${gap}>${label}:</span><strong${gap}>${value}</strong>`;
      }),
    )
    .join("");

  return `
    <div class="tw:leading-[1.2]">
      <strong>Efficiency:</strong>
      <div class="tw:grid tw:grid-cols-[auto_auto] tw:justify-start tw:gap-x-4 tw:gap-y-[0.15em]">${cells}</div>
      <div class="tw:mt-2">Click the first number to add a modifier.</div>
    </div>
  `;
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
const BUTTON_SHAPE_CLASS = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:px-4 tw:text-[15px] tw:phone:h-9 tw:phone:px-3 tw:phone:text-sm tw:narrow-530:px-2 tw:disabled:cursor-default tw:disabled:opacity-50 ${KEY_CLASS}`;

const buttonClass = `${BUTTON_SHAPE_CLASS} ${BOTTOM_BAR_BUTTON_COLOR_CLASS} tw:text-game-text`;

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
          {/* On a narrow window, the button says only "Back", which is easy to read and lets all
              of the buttons fit in one row on a phone. */}
          <span className="tw:phone:hidden">Back to the game</span>
          <span className="tw:hidden tw:phone:inline">Back</span>
          {/* The name does not widen the button. A long one is cut off. */}
          {currentName !== undefined && (
            <span
              className={`tw:w-0 tw:min-w-full tw:truncate tw:text-center tw:text-xs tw:phone:hidden ${ourTurn ? "tw:font-bold" : "tw:font-medium tw:opacity-70"}`}
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

/** The height of the bar along the bottom of the screen. */
const BAR_HEIGHT = 76;

/**
 * The height of the bar along the bottom of the screen when the replay controls have a row of their
 * own: the controls (`tw:h-11`), the padding above them (`tw:pt-2.5`), and the row under them,
 * which keeps the bar's height.
 */
export const REPLAY_BAR_HEIGHT = 44 + 10 + BAR_HEIGHT;

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
 *
 * Once the controls have a row of their own, they keep it until the bar's width changes or the
 * replay ends. Otherwise, the bar would change its height when the controls change, such as when a
 * hypothetical starts or ends, and the screen above it would jump.
 */
function useOwnRow(
  footer: HTMLElement | null,
  controls: RefObject<HTMLDivElement | null>,
): boolean {
  // Measures again when the bar's width changes.
  useElementSize(footer);
  const [ownRow, setOwnRow] = useState(false);

  /** The width of the bar when the controls got a row of their own. */
  const ownRowWidth = useRef<number | undefined>(undefined);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const group = controls.current;
    if (footer === null || group === null) {
      ownRowWidth.current = undefined;
      setOwnRow(false);
      return;
    }
    const hadOwnRow = footer.hasAttribute(OWN_ROW_ATTRIBUTE);
    // The bar keeps its height while it tries the one-row layout. Otherwise, the screen above it
    // would get taller for the measurement. Firefox then keeps the chat's scroll limit from that
    // taller layout, so that the chat can no longer scroll down to its last lines.
    footer.style.height = getComputedStyle(footer).height;
    footer.removeAttribute(OWN_ROW_ATTRIBUTE);
    const overflows =
      footer.scrollWidth > footer.clientWidth
      || group.scrollWidth > group.clientWidth;
    if (hadOwnRow) {
      footer.setAttribute(OWN_ROW_ATTRIBUTE, "");
    }
    footer.style.removeProperty("height");
    if (overflows) {
      ownRowWidth.current = footer.clientWidth;
    } else if (ownRowWidth.current !== footer.clientWidth) {
      ownRowWidth.current = undefined;
    }
    setOwnRow(ownRowWidth.current !== undefined);
  });
  return ownRow;
}

/**
 * The attribute that gives the bar's buttons their short labels, such as a door icon for "Lobby".
 * The labels depend on it (as "data-short-labels"), so that the bar can try the long labels without
 * drawing them.
 */
const SHORT_LABELS_ATTRIBUTE = "data-short-labels";

/**
 * Whether the bar's buttons need short labels, because their row has no room for the long ones.
 * Which buttons show depends on the game, so the row is measured instead of using a breakpoint.
 * After each render and resize, the row takes away the attribute of the short labels, checks
 * whether its buttons wrap onto a second line, and puts the attribute back. All of it happens
 * before the browser draws the bar.
 *
 * When the replay controls have a row of their own on a wide window (`besideVariant`), the buttons
 * share the next row with the variant, and they also need short labels when they would go to a row
 * under it.
 */
function useShortLabels(
  footer: HTMLElement | null,
  row: RefObject<HTMLDivElement | null>,
  variant: RefObject<HTMLDivElement | null>,
  besideVariant: boolean,
): boolean {
  // Measures again when the bar's width changes.
  useElementSize(footer);
  const [shortLabels, setShortLabels] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const element = row.current;
    if (element === null) {
      return;
    }
    const hadShortLabels = element.hasAttribute(SHORT_LABELS_ATTRIBUTE);
    element.removeAttribute(SHORT_LABELS_ATTRIBUTE);
    // A hidden child, such as the chat button on a wide screen, has no place in the row.
    const tops = [...element.children]
      .filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child.offsetParent !== null,
      )
      .map((child) => child.offsetTop);
    const variantElement = variant.current;
    const wraps =
      tops.some((top) => top !== tops[0])
      || (besideVariant
        && variantElement !== null
        && element.getBoundingClientRect().top
          >= variantElement.getBoundingClientRect().bottom);
    if (hadShortLabels) {
      element.setAttribute(SHORT_LABELS_ATTRIBUTE, "");
    }
    setShortLabels(wraps);
  });
  return shortLabels;
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
  pace,
  paceColor,
  futureEfficiency,
  efficiencyModified,
  efficiencyStats,
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
  chatButton,
  onClassicView,
  onLobby,
  phoneLayout,
  panel,
  footerRef,
}: StatusStripProps): React.JSX.Element {
  const reservedTurn = Math.max(lastTurn ?? turn, FIRST_TWO_DIGIT_NUMBER);
  const reservedScore = Math.max(score, FIRST_TWO_DIGIT_NUMBER);
  const [footer, setFooterState] = useState<HTMLElement | null>(null);
  const setFooter = useCallback(
    (element: HTMLElement | null) => {
      setFooterState(element);
      footerRef.current = element;
    },
    [footerRef],
  );
  const inReplay = replayControls !== undefined;
  const controlsRef = useRef<HTMLDivElement>(null);
  const ownRow = useOwnRow(footer, controlsRef);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const variantRef = useRef<HTMLDivElement>(null);
  const shortLabels = useShortLabels(
    footer,
    buttonsRef,
    variantRef,
    ownRow && !phoneLayout,
  );

  // The line along the top is a shadow, not a border, so that its width does not move the bar's
  // contents when a replay makes it thicker.
  let colorClass =
    "tw:bg-game-panel tw:[box-shadow:inset_0_1px_0_var(--game-screen-raised)]";
  if (inReplay) {
    colorClass =
      "tw:bg-game-mode-panel tw:[box-shadow:inset_0_2px_0_var(--game-screen-mode)]";
  }

  // The panel has a line all around it instead.
  const panelColorClass = inReplay
    ? "tw:bg-game-mode-panel tw:[box-shadow:inset_0_0_0_2px_var(--game-screen-mode)]"
    : "tw:bg-game-panel tw:[box-shadow:inset_0_0_0_1px_var(--game-screen-raised)]";

  // Three groups: the game's progress, the numbers that help to plan, and what game this is.
  const progress = (
    <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:phone:gap-5 tw:narrow-530:gap-4">
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
            {lowScorePhase && (
              <HelpIcon
                label={LOW_SCORE_PHASE_HELP_LABEL}
                tooltip={LOW_SCORE_PHASE_HELP}
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
  );
  const planning = (
    <div className="tw:flex tw:shrink-0 tw:items-end tw:gap-6 tw:phone:gap-5 tw:narrow-530:gap-4">
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
              icon="fa-info-circle"
              label={EFFICIENCY_HELP_LABEL}
              tooltip={valueTooltip(
                getEfficiencyTooltip(
                  efficiencyStats,
                  futureEfficiency,
                  minEfficiency,
                ),
              )}
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
  );
  // The variant opens the game's information: its seed, options, and table. Its name gives up its
  // room first, so that the replay controls keep theirs. On a narrow window, it fills the rest of
  // the row. The buttons go to a second row when the name would get less than its minimum width. On
  // a phone, that minimum is zero, so that the name stays in the row of the numbers, and the bar
  // takes only two rows. When the replay controls have a row of their own on a wide window, the
  // name shares the next row with the buttons. Then it starts from no width, and its minimum is the
  // width of its label, so that the name gets shorter before the buttons get short labels, and the
  // buttons get short labels before they go to a row of their own.
  const variant = (
    <div
      className={`tw:flex tw:flex-initial tw:flex-col tw:gap-0.5 ${inReplay ? "tw:min-w-20" : "tw:min-w-0"} tw:not-phone:group-data-own-row/strip:min-w-min tw:not-phone:group-data-own-row/strip:flex-1 tw:phone:min-w-28 tw:phone:flex-1 tw:narrow-530:min-w-0`}
      ref={variantRef}
    >
      <span className={`${STAT_LABEL_CLASS} tw:whitespace-nowrap`}>
        Variant
        <HelpIcon
          icon="fa-info-circle"
          label={"Show the game's information: its table, options, and seed"}
          tooltip={valueTooltip(gameInfoTooltip)}
        />
      </span>
      <span
        // When the variant shares a row with the buttons, the name takes no width of its own, so
        // that only the label sets the variant's minimum width.
        className="tw:block tw:max-w-full tw:truncate tw:not-phone:group-data-own-row/strip:w-0 tw:not-phone:group-data-own-row/strip:min-w-full tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:text-game-muted tw:phone:leading-[24px]"
      >
        {variantName}
      </span>
    </div>
  );
  // In the panel, the buttons wrap, and each grows to fill its row. A menu's button or the replay
  // toggle is in a box of its own, with its menu or its ring.
  const buttons = (
    <div
      className={
        panel
          ? "tw:group/buttons tw:flex tw:flex-wrap tw:gap-2 tw:*:grow tw:*:justify-center tw:[&>*>button]:w-full tw:[&>*>button]:justify-center"
          : "tw:group/buttons tw:ml-auto tw:flex tw:max-w-full tw:shrink-0 tw:flex-wrap tw:content-center tw:items-center tw:justify-end tw:gap-2.5 tw:not-phone:group-data-own-row/strip:min-h-(--strip-height) tw:phone:gap-2"
      }
      // The panel has room for the buttons in more than one row, so they keep their long labels.
      data-short-labels={shortLabels && !panel ? "" : undefined}
      ref={buttonsRef}
    >
      {!panel && (
        <div className="tw:mr-auto tw:hidden tw:phone:flex">{chatButton}</div>
      )}
      <button className={buttonClass} onClick={onClassicView} type="button">
        {/* One box, so that the button's gap does not split the words. */}
        <span>
          Classic
          <span className="tw:group-data-short-labels/buttons:hidden"> UI</span>
        </span>
      </button>
      {replayToggle !== undefined && <ReplayToggle {...replayToggle} />}
      {viewAsMenu}
      {tableMenu}
      {/* "Lobby" sits in the bottom-right corner of the screen, which is easy to find. */}
      <button
        aria-label="Lobby"
        className={buttonClass}
        onClick={onLobby}
        type="button"
      >
        <i
          aria-hidden="true"
          className="fas fa-door-open tw:hidden tw:group-data-short-labels/buttons:inline"
        />
        <span className="tw:group-data-short-labels/buttons:hidden">Lobby</span>
      </button>
    </div>
  );

  // The panel at the bottom of the right column gives the hands the whole height of the screen. The
  // panel is as narrow as a phone, so it takes the styles of the phone layout: the smaller text and
  // buttons, and the replay controls that wrap.
  if (panel) {
    return (
      <footer
        className={`tw:group/strip tw:flex tw:shrink-0 tw:flex-col tw:gap-3 tw:rounded-game-panel tw:p-3.5 tw:text-game-screen-compact ${panelColorClass}`}
        data-panel=""
        data-phone-layout=""
        ref={setFooter}
      >
        {/* The four numbers share a row when it has room for them. */}
        <div className="tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-3">
          {progress}
          {planning}
        </div>
        <div>{variant}</div>
        {inReplay && (
          <div className="tw:flex" ref={controlsRef}>
            {replayControls}
          </div>
        )}
        {buttons}
      </footer>
    );
  }

  // When the replay controls have a row of their own, the row under them keeps the height of the
  // bar, so that the numbers and the buttons stay where they were.
  return (
    <footer
      className={`tw:group/strip tw:flex tw:h-(--strip-height) tw:shrink-0 tw:items-center tw:gap-8 tw:px-7 tw:text-game-screen-compact ${colorClass} tw:not-phone:data-own-row:h-auto tw:not-phone:data-own-row:flex-wrap tw:not-phone:data-own-row:gap-y-0 tw:not-phone:data-own-row:pt-2.5 tw:phone:h-auto tw:phone:flex-wrap tw:phone:gap-x-5 tw:phone:gap-y-2 tw:narrow-530:gap-x-4 tw:phone:px-3 tw:phone:py-3`}
      data-own-row={ownRow ? "" : undefined}
      ref={setFooter}
      style={{ "--strip-height": `${BAR_HEIGHT}px` } as React.CSSProperties}
    >
      {progress}
      <GroupDivider />
      {planning}
      <GroupDivider />
      {variant}
      {inReplay && (
        <GroupDivider className="tw:group-data-own-row/strip:hidden" />
      )}
      {inReplay && (
        <div
          // When the controls have a row of their own, and on a narrow window, they are on top.
          className="tw:flex tw:shrink-0 tw:grow tw:basis-0 tw:group-data-own-row/strip:order-first tw:group-data-own-row/strip:basis-full tw:phone:order-first tw:phone:basis-full"
          ref={controlsRef}
        >
          {replayControls}
        </div>
      )}
      {/* When the buttons have no room in one line, they have short labels. */}
      {buttons}
    </footer>
  );
}
