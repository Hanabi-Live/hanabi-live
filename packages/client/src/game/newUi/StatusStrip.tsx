import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
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
import type { LogTab } from "./ClueLog.tsx";
import { ACTION_LOG_TAB, CLUE_LOG_TAB, getClueLogHeight } from "./ClueLog.tsx";
import { FadeInLabel } from "./FadeLayer.tsx";
import { FitText } from "./FitText.tsx";
import { useElementSize } from "./hooks.ts";
import {
  getVisibilityTransition,
  SLIDE,
  SLIDE_BACK,
  useFade,
} from "./motion.ts";
import type { ScreenMode } from "./screenMode.ts";
import {
  BOTTOM_BAR_BUTTON_COLOR_CLASS,
  RAISED_BUTTON_CLASS,
} from "./surfaces.ts";
import { getTabPanelStyle, Tabs } from "./Tabs.tsx";

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
   * The button that opens and collapses the chat. The bar shows it only in the phone layout, and
   * the panel always shows it. Then the chat's rail is hidden, so that the table gets its width.
   */
  readonly chatButton: React.ReactNode;
  readonly onLobby: () => void;
  /** Whether the game screen uses the phone layout (see "GameScreen.tsx"). */
  readonly phoneLayout: boolean;
  readonly reducedMotion: boolean;
  /** The screen's mode, whose colors the bar takes (see "screenMode.ts"). */
  readonly mode: ScreenMode | undefined;
  /**
   * Whether the bar is a panel at the bottom of the right column instead of a bar along the bottom
   * of the screen (see "GameScreen.tsx").
   */
  readonly panel: boolean;
  /** Receives the bar's element, so that the game screen can measure it. */
  readonly onFooter: (element: HTMLElement | null) => void;

  /**
   * The clue log, which is above the panel. When the column is short, the two share one box with
   * tabs instead (see `usePanelTabs`). Then the panel's tabs choose the log, and the log hides its
   * own tabs.
   */
  readonly clueLog: React.ReactNode;
  /** The log that shows. */
  readonly logTab: LogTab;
  readonly onLogTab: (tab: LogTab) => void;
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
  ref,
}: {
  readonly className?: string;
  readonly ref?: React.Ref<HTMLSpanElement>;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:h-10 tw:w-px tw:shrink-0 tw:self-center tw:bg-game-line tw:phone:hidden ${className}`}
      ref={ref}
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
  fades = false,
  reserve = false,
}: {
  readonly value: React.ReactNode;
  readonly max: number | string;
  readonly maxStyle?: React.CSSProperties;

  /**
   * Whether the maximum fades in when it appears and out when it goes, such as the last turn when a
   * replay starts and ends.
   */
  readonly fades?: boolean;

  /**
   * Whether this is an invisible copy that holds the space of the value. The animations and the
   * arrows do not find its maximum.
   */
  readonly reserve?: boolean;
}): React.JSX.Element {
  const maxRef = useRef<HTMLSpanElement>(null);
  useFade(maxRef, !fades);
  return (
    <>
      {value}{" "}
      {/* The maximum score pops when it drops (see "scoreMotion.ts"). A transform needs a box. */}
      <span
        className="tw:inline-block tw:font-medium tw:text-game-muted"
        data-out-of-max={reserve ? undefined : ""}
        ref={maxRef}
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
const BUTTON_SHAPE_CLASS = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:px-4 tw:text-[15px] tw:phone:h-9 tw:phone:px-3 tw:phone:text-sm tw:narrow-530:px-2 tw:disabled:cursor-default tw:disabled:opacity-50 ${RAISED_BUTTON_CLASS}`;

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

  // In the replay, the button is lit, in the color of our turn when it is our turn. Each color is a
  // layer that fades in and out over the button, and one label fades into the other. Only opacities
  // animate, never a color (see `useModeFade`).
  function getFadeStyle(shown: boolean): React.CSSProperties {
    return {
      opacity: shown ? 1 : 0,
      transition: reducedMotion ? undefined : getVisibilityTransition(shown),
    };
  }

  return (
    <div className="tw:relative tw:shrink-0">
      <span
        aria-hidden="true"
        className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-game-control tw:opacity-0 tw:ring-2 tw:ring-game-turn"
        ref={ringRef}
      />
      <button
        className={`${buttonClass} tw:group/replay tw:relative tw:isolate tw:grid tw:leading-tight`}
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] tw:bg-game-text tw:inset-shadow-[0_1px_0_rgb(255_255_255/18%)] tw:group-hover/replay:bg-white"
          style={getFadeStyle(inReplay)}
        />
        <span
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] tw:bg-game-turn tw:inset-shadow-[0_1px_0_rgb(255_255_255/18%)] tw:group-hover/replay:brightness-110"
          style={getFadeStyle(inReplay && ourTurn)}
        />
        <span
          className={`tw:flex tw:items-center tw:justify-center tw:gap-2 tw:[grid-area:1/1] ${inReplay ? "tw:invisible" : ""}`}
          style={getFadeStyle(!inReplay)}
        >
          <i aria-hidden="true" className="fas fa-undo" />
          Replay
        </span>
        <span
          className={`tw:flex tw:items-center tw:justify-center tw:gap-2 tw:font-bold tw:text-card-ink tw:[grid-area:1/1] ${inReplay ? "" : "tw:invisible"}`}
          style={getFadeStyle(inReplay)}
        >
          {/* The arrow sits beside both lines, as on the lobby's "Return" buttons. */}
          <i aria-hidden="true" className="fas fa-arrow-left" />
          <span className="tw:flex tw:flex-col tw:items-center">
            {/* On a narrow window, the button says only "Back", which is easy to read and lets
                all of the buttons fit in one row on a phone. */}
            <span className="tw:phone:hidden">Back to the game</span>
            <span className="tw:hidden tw:phone:inline">Back</span>
            {/* The name does not widen the button. A long one is cut off. */}
            {currentName !== undefined && (
              <span
                className={`tw:w-0 tw:min-w-full tw:truncate tw:text-center tw:text-xs tw:phone:hidden ${ourTurn ? "tw:font-bold" : "tw:font-medium tw:opacity-70"}`}
                data-live-turn
              >
                <FadeInLabel
                  label={ourTurn ? "Your turn" : `${currentName}'s turn`}
                  reducedMotion={reducedMotion}
                />
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * In the panel, the replay controls slide out of the top of the panel when a replay starts, as the
 * clue menu slides out of the hand (see "ClueMenu.tsx"), and the panel's top edge rises with them.
 * The clue log's bottom edge rises with the panel's edge. With tabs, the panel's edge stays, and
 * the controls slide down from behind the variant instead. When the replay ends, the controls slide
 * back the same way (see "useClosingControls"). Only the drawing moves: the panel takes its new
 * size at once, so that nothing else moves, and the game screen measures the panel's real size. The
 * sliding only decorates.
 */
function useReplayDrawer(
  footer: HTMLElement | null,
  controls: RefObject<HTMLDivElement | null>,
  open: boolean,
  closing: boolean,
  onClosed: () => void,
  edgeRises: boolean,
  mode: ScreenMode | undefined,
  reducedMotion: boolean,
) {
  const wasOpen = useRef(open);
  const wasClosing = useRef(closing);
  const wasMode = useRef(mode);
  useLayoutEffect(() => {
    const opened = open && !wasOpen.current;
    const closed = closing && !wasClosing.current;
    const modeChanged = mode !== wasMode.current;
    wasOpen.current = open;
    wasClosing.current = closing;
    wasMode.current = mode;
    const group = controls.current;

    // When a hypothetical starts or ends, the controls of the other mode fade in where the others
    // were, as in the bar along the bottom (see "useBarControlsFade").
    if (open && !opened && modeChanged && !reducedMotion && group !== null) {
      const animation = group.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: OPEN_DURATION_IN_MILLISECONDS,
        easing: "ease-out",
      });
      return () => {
        animation.cancel();
      };
    }

    if (
      reducedMotion
      || footer === null
      || group === null
      || (!opened && !closed)
    ) {
      if (closed) {
        onClosed();
      }
      return undefined;
    }

    // Without tabs, the controls slide up from behind the numbers below them. With tabs, they slide
    // down from behind the variant above them. They move by their height and the gap beside them.
    const beside = edgeRises
      ? group.nextElementSibling
      : group.previousElementSibling;
    if (!(beside instanceof HTMLElement)) {
      if (closed) {
        onClosed();
      }
      return undefined;
    }
    const rise = edgeRises
      ? beside.offsetTop - group.offsetTop
      : group.offsetTop
        + group.offsetHeight
        - beside.offsetTop
        - beside.offsetHeight;
    const shift = edgeRises ? rise : -rise;
    const radius = getComputedStyle(footer).borderTopLeftRadius;

    // When the replay ends, the controls are still drawn, and they slide back. They stay hidden
    // until they are gone.
    function slide(
      element: Element,
      hidden: Keyframe,
      shown: Keyframe,
    ): Animation {
      return element.animate(
        opened ? [hidden, shown] : [shown, hidden],
        opened
          ? SLIDE
          : {
              ...SLIDE_BACK,
              fill: "forwards",
            },
      );
    }

    // With tabs, the panel fills its place, so its edge stays where it is. Without them, the clue
    // log above the panel reaches down to the panel's edge, which moves the log's bottom edge with
    // it. The panel is drawn over the log, so the log shows only above the edge.
    const clueLog = footer.previousElementSibling;
    const animations = [
      ...(edgeRises
        ? [
            slide(
              footer,
              { clipPath: `inset(${rise}px 0 0 0 round ${radius})` },
              { clipPath: `inset(0 0 0 0 round ${radius})` },
            ),
          ]
        : []),
      ...(edgeRises && clueLog !== null
        ? [
            slide(
              clueLog,
              { marginBottom: `${-rise}px` },
              { marginBottom: "0px" },
            ),
          ]
        : []),
      slide(
        group,
        {
          transform: `translateY(${shift}px)`,
          clipPath: edgeRises
            ? `inset(0 0 ${rise}px 0)`
            : `inset(${rise}px 0 0 0)`,
        },
        {
          transform: "none",
          clipPath: "inset(0 0 0 0)",
        },
      ),
    ];
    if (closed) {
      // A canceled animation means that the controls are already gone, or open again.
      Promise.all(animations.map(async (animation) => await animation.finished))
        .then(onClosed)
        .catch(() => undefined);
    }
    return () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [
    open,
    closing,
    onClosed,
    edgeRises,
    mode,
    reducedMotion,
    footer,
    controls,
  ]);
}

/** How far the replay controls in the bar along the bottom rise as they fade in, in CSS pixels. */
const BAR_CONTROLS_RISE = 6;

/**
 * In the bar along the bottom, the replay controls fade in and rise a little when a replay starts,
 * as fast as a tooltip opens, and the divider before them fades in with them. Their place in the
 * bar is empty without them, so nothing has to make room, as in the panel (see "useReplayDrawer").
 * When the replay ends, they fade out and sink back, as fast as a tooltip closes (see
 * "useClosingControls"). When a hypothetical starts or ends, the controls of the other mode fade in
 * where the others were. Only the drawing moves, and the fades only decorate.
 */
function useBarControlsFade(
  controls: RefObject<HTMLDivElement | null>,
  divider: RefObject<HTMLSpanElement | null>,
  open: boolean,
  closing: boolean,
  onClosed: () => void,
  mode: ScreenMode | undefined,
  reducedMotion: boolean,
) {
  const last = useRef({
    open,
    mode,
  });

  useLayoutEffect(() => {
    const previous = last.current;
    last.current = {
      open,
      mode,
    };
    const group = controls.current;
    if (group === null) {
      return undefined;
    }
    if (reducedMotion) {
      if (closing) {
        onClosed();
      }
      return undefined;
    }
    const elements = [group, divider.current].filter(
      (element): element is HTMLElement => element !== null,
    );

    const hidden = {
      opacity: 0,
      transform: `translateY(${BAR_CONTROLS_RISE}px)`,
    };
    const shown = {
      opacity: 1,
      transform: "none",
    };
    let animations: Animation[] = [];
    if (closing) {
      animations = elements.map((element) =>
        element.animate([shown, hidden], {
          duration: CLOSE_DURATION_IN_MILLISECONDS,
          easing: "ease-in",
          fill: "forwards",
        }),
      );
      // A canceled animation means that the controls are already gone, or open again.
      Promise.all(animations.map(async (animation) => await animation.finished))
        .then(onClosed)
        .catch(() => undefined);
    } else if (open && !previous.open) {
      animations = elements.map((element) =>
        element.animate([hidden, shown], {
          duration: OPEN_DURATION_IN_MILLISECONDS,
          easing: "ease-out",
        }),
      );
    } else if (open && previous.mode !== mode) {
      animations = [
        group.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: OPEN_DURATION_IN_MILLISECONDS,
          easing: "ease-out",
        }),
      ];
    }
    return () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [controls, divider, open, closing, onClosed, mode, reducedMotion]);
}

/**
 * When a replay ends, the panel keeps its controls until they slide back into it (see
 * "useReplayDrawer"). It returns the controls that are sliding back, and the function that removes
 * them.
 */
function useClosingControls(
  replayControls: React.ReactNode,
  slides: boolean,
): readonly [React.ReactNode, () => void] {
  // The controls that showed last. Each render makes new controls, so only whether there are
  // controls is compared.
  const last = useRef(replayControls);
  const [closing, setClosing] = useState<React.ReactNode>(undefined);
  // It runs while rendering, so the controls stay on the page as they start to slide back. A new
  // copy would start over, such as an element that fades in.
  const shown = replayControls !== undefined;
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    setClosing(shown || !slides ? undefined : last.current);
  } else if (!slides && closing !== undefined) {
    setClosing(undefined);
  }
  if (shown) {
    last.current = replayControls;
  }
  const close = useCallback(() => {
    setClosing(undefined);
  }, []);
  return [closing, close] as const;
}

/** The ID of the panel's tab when it shares one box with the logs. */
const STATUS_TAB = "status-panel-tab";

/**
 * The attribute of the panel when the column is too short for it, even with tabs (see
 * "GameScreen.tsx").
 */
export const PANEL_SHORT_ATTRIBUTE = "data-panel-short";

/** The rows of clues that the clue log keeps above the panel, before the two share tabs. */
const STACKED_CLUE_LOG_ROWS = 4;

/**
 * The height of the tallest replay controls in the panel: those of the leader of a shared replay,
 * in three rows. It is what they need, measured.
 */
const PANEL_REPLAY_CONTROLS_HEIGHT = 144;

/** Reads a length in pixels from a computed style, such as "12px". */
function getPixels(value: string): number {
  const pixels = Number(value.replace(/px$/u, ""));
  return Number.isNaN(pixels) ? 0 : pixels;
}

/**
 * In the panel, the replay controls keep the largest height that they have had, so that the panel
 * keeps its size when a hypothetical starts or ends. The controls of each mode wrap onto rows of
 * other heights, or onto fewer rows. The height starts again when the controls go away, or when the
 * panel gets another width, which wraps them again.
 */
function useSteadyControlsHeight(
  footer: HTMLElement | null,
  controls: RefObject<HTMLDivElement | null>,
  panel: boolean,
) {
  const tallest = useRef(0);
  const width = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const group = controls.current;
    if (!panel || footer === null || group === null) {
      tallest.current = 0;
      width.current = undefined;
      return;
    }
    if (footer.clientWidth !== width.current) {
      width.current = footer.clientWidth;
      tallest.current = 0;
    }
    group.style.minHeight = "";
    tallest.current = Math.max(tallest.current, group.offsetHeight);
    group.style.minHeight = `${tallest.current}px`;
  });
}

/**
 * Whether the panel and the clue log share one box with tabs. That happens when the panel below the
 * clue log would leave the log fewer than `STACKED_CLUE_LOG_ROWS` rows. A tall column keeps both in
 * view, and only a short one needs tabs. The panel counts the replay controls with at least
 * `PANEL_REPLAY_CONTROLS_HEIGHT`, even when it does not show them. So the answer stays the same
 * when a replay starts or the game ends, and only the size of the column changes it. The panel has
 * the same width and contents with tabs and without them, and the two take the same part of the
 * column.
 *
 * When even its tab is too short for the panel, the panel has `PANEL_SHORT_ATTRIBUTE`, so that the
 * game screen can move the bar back along the bottom.
 */
function usePanelTabs(
  footer: HTMLElement | null,
  panel: boolean,
  status: RefObject<HTMLDivElement | null>,
  controls: RefObject<HTMLDivElement | null>,
): boolean {
  const [tabs, setTabs] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- It measures the layout after every render, and sets the state only when it changes.
  useLayoutEffect(() => {
    const content = status.current;
    // The panel with tabs is another element than the panel without them, so the one that was drawn
    // last might be gone.
    if (!panel || content === null || footer?.isConnected !== true) {
      return;
    }

    // The panel's height without tabs: its contents and the gaps between them, which fills its tab
    // when it has tabs. Its part of the column starts at the clue log above it without tabs, and at
    // the panel with them. The panel and the log share the column's offset parent.
    const group = controls.current;
    const parts = [...content.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== group,
    );
    const contentHeight =
      parts.reduce((sum, part) => sum + part.offsetHeight, 0)
      + Math.max(group?.offsetHeight ?? 0, PANEL_REPLAY_CONTROLS_HEIGHT)
      + parts.length * getPixels(getComputedStyle(content).rowGap);
    const tabbed = Object.hasOwn(footer.dataset, "tabbed");
    // With tabs, the contents fill their tab.
    footer.toggleAttribute(
      PANEL_SHORT_ATTRIBUTE,
      tabbed && content.clientHeight < contentHeight,
    );
    const footerStyle = getComputedStyle(footer);
    const panelHeight =
      contentHeight
      + getPixels(footerStyle.paddingTop)
      + getPixels(footerStyle.paddingBottom);
    const clueLog = tabbed ? null : footer.previousElementSibling;
    const top = clueLog instanceof HTMLElement ? clueLog : footer;
    const room = footer.offsetTop + footer.offsetHeight - top.offsetTop;
    const gap =
      footer.parentElement === null
        ? 0
        : getPixels(getComputedStyle(footer.parentElement).rowGap);
    setTabs(room - panelHeight - gap < getClueLogHeight(STACKED_CLUE_LOG_ROWS));
  });
  return panel && tabs;
}

/** The height of the bar along the bottom of the screen. */
export const BAR_HEIGHT = 76;

/**
 * The largest width of the variant's name in the bar along the bottom of the screen, in CSS pixels.
 * A longer name gets smaller text, so that the bar has room for one row (see `BAR_ONE_ROW_WIDTH` in
 * "GameScreen.tsx").
 */
const VARIANT_NAME_MAX_WIDTH = 160;

/**
 * The height of the bar along the bottom of the screen when the replay controls have a row of their
 * own: the controls (55px, since `tw:h-11` is in "em" at their 20px text), the padding above them
 * (9px, from `tw:pt-2.5` at the bar's text), and the row under them, which keeps the bar's height.
 */
export const REPLAY_BAR_HEIGHT = 55 + 9 + BAR_HEIGHT;

/**
 * The attribute that gives the replay controls a row of their own. The bar's styles for that layout
 * depend on it (as "data-own-row"), so that the bar can try the one-row layout without drawing it.
 */
const OWN_ROW_ATTRIBUTE = "data-own-row";

/**
 * How far the bar's contents reach past the start of its right padding, in CSS pixels. Contents
 * that fill the padding do not overflow the bar, but they leave the last button flush with the edge
 * of the screen, with less room on its right than the bar has on its left.
 */
function getPaddingOverlap(footer: HTMLElement): number {
  const box = footer.getBoundingClientRect();
  if (footer.offsetWidth === 0) {
    return 0;
  }
  // The rectangles are in the window's pixels, which the zoomed screen makes larger.
  const scale = box.width / footer.offsetWidth;
  const style = getComputedStyle(footer);
  const contentRight =
    box.right
    - (Number(style.paddingRight.replace("px", ""))
      + Number(style.borderRightWidth.replace("px", "")))
      * scale;
  const reach = Math.max(
    box.left,
    ...[...footer.children]
      .filter((child) => !child.hasAttribute(MODE_FADE_ATTRIBUTE))
      .map((child) => child.getBoundingClientRect().right),
  );
  return Math.max(
    footer.scrollWidth - footer.clientWidth,
    (reach - contentRight) / scale,
  );
}

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
    // Less than a pixel is a rounding error of the measurement.
    const overlap = Math.max(
      getPaddingOverlap(footer),
      group.scrollWidth - group.clientWidth,
    );
    const overflows = overlap >= 1;
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

/** The attribute of the layer that fades out the colors of the mode before (see `useModeFade`). */
const MODE_FADE_ATTRIBUTE = "data-mode-fade";

/** How deep a mode is: the game, a replay of it, or a hypothetical in the replay. */
function getModeDepth(mode: ScreenMode | undefined): number {
  switch (mode) {
    case undefined: {
      return 0;
    }

    case "inGameReplay":
    case "finishedReplay": {
      return 1;
    }

    case "hypothetical": {
      return 2;
    }
  }
}

/**
 * When the screen's mode changes, the bar's colors fade into those of the new mode: a layer with
 * the colors from before covers the bar's background, under its contents, and fades out. Going into
 * a replay or a hypothetical fades as fast as a tooltip opens, and coming back as fast as one
 * closes.
 *
 * Only the layer's opacity animates, never a background color. Chrome 157 runs an animation of a
 * background color on the compositor, and then sometimes crashes the tab when the element's style
 * changes (see "playMotion.ts"). While the layer fades, the bar is its own stacking context, so
 * that the layer can be under the bar's contents but over its background.
 */
function useModeFade(
  footer: HTMLElement | null,
  mode: ScreenMode | undefined,
  reducedMotion: boolean,
) {
  const last = useRef<{
    readonly footer: HTMLElement;
    readonly mode: ScreenMode | undefined;
    readonly backgroundColor: string;
    readonly boxShadow: string;
  }>(undefined);

  useLayoutEffect(() => {
    if (footer === null) {
      return undefined;
    }
    const previous = last.current;
    const style = getComputedStyle(footer);
    last.current = {
      footer,
      mode,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
    // When the bar moves into the panel or back, it is a new element with other colors.
    if (
      reducedMotion
      || previous === undefined
      || previous.footer !== footer
      || previous.mode === mode
    ) {
      return undefined;
    }

    const layer = document.createElement("div");
    layer.setAttribute(MODE_FADE_ATTRIBUTE, "");
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, {
      position: "absolute",
      inset: "0",
      zIndex: "-1",
      borderRadius: "inherit",
      pointerEvents: "none",
      backgroundColor: previous.backgroundColor,
      boxShadow: previous.boxShadow,
    });
    footer.style.isolation = "isolate";
    footer.append(layer);
    const opening = getModeDepth(mode) > getModeDepth(previous.mode);
    const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: opening
        ? OPEN_DURATION_IN_MILLISECONDS
        : CLOSE_DURATION_IN_MILLISECONDS,
      easing: opening ? "ease-out" : "ease-in",
      fill: "forwards",
    });
    function remove() {
      layer.remove();
      footer?.style.removeProperty("isolation");
    }
    fade.addEventListener("finish", remove);
    fade.addEventListener("cancel", remove);
    return () => {
      fade.cancel();
    };
  }, [footer, mode, reducedMotion]);
}

/** The tooltip of the "Lobby" button in the bar, which shows only its icon. */
const LOBBY_TOOLTIP = "Return to the lobby.";

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
  onLobby,
  phoneLayout,
  reducedMotion,
  mode,
  panel,
  onFooter,
  clueLog,
  logTab,
  onLogTab,
}: StatusStripProps): React.JSX.Element {
  const reservedTurn = Math.max(lastTurn ?? turn, FIRST_TWO_DIGIT_NUMBER);
  const reservedScore = Math.max(score, FIRST_TWO_DIGIT_NUMBER);
  const [footer, setFooterState] = useState<HTMLElement | null>(null);
  const setFooter = useCallback(
    (element: HTMLElement | null) => {
      setFooterState(element);
      onFooter(element);
    },
    [onFooter],
  );
  const inReplay = replayControls !== undefined;
  useModeFade(footer, mode, reducedMotion);
  const [closingControls, closeControls] = useClosingControls(
    replayControls,
    !reducedMotion,
  );
  const controlsRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLSpanElement>(null);
  const ownRow = useOwnRow(footer, controlsRef);
  const statusRef = useRef<HTMLDivElement>(null);
  // The panel measures its height after the controls take theirs.
  useSteadyControlsHeight(footer, controlsRef, panel);
  const tabbed = usePanelTabs(footer, panel, statusRef, controlsRef);
  const [logsShown, setLogsShown] = useState(false);
  const tab = logsShown ? logTab : STATUS_TAB;
  useReplayDrawer(
    footer,
    controlsRef,
    inReplay && panel,
    panel && closingControls !== undefined,
    closeControls,
    !tabbed,
    mode,
    reducedMotion,
  );
  useBarControlsFade(
    controlsRef,
    dividerRef,
    inReplay && !panel,
    !panel && closingControls !== undefined,
    closeControls,
    mode,
    reducedMotion,
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
            <OutOf max={reservedTurn} reserve value={reservedTurn} />
          </span>
          <span className="tw:col-start-1 tw:row-start-1" data-turn>
            <span className={VALUE_LINE_CLASS}>
              {lastTurn === undefined ? (
                turn
              ) : (
                <OutOf fades={!reducedMotion} max={lastTurn} value={turn} />
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
                <OutOf max={maxScore} reserve value={reservedScore} />
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
  // room first, so that the replay controls keep theirs. In the phone layout, it fills the rest of
  // the row, and its name takes no width of its own. Its minimum is the width of its label at every
  // width, so that the buttons go to a row of their own only when the label has no room, and a
  // narrower window never takes a row away. When the replay controls have a row of their own on a
  // wide window, the name shares the next row with the buttons, with the same minimum.
  const gameInfoButton = (
    <HelpIcon
      icon="fa-info-circle"
      label={"Show the game's information: its table, options, and seed"}
      tooltip={valueTooltip(gameInfoTooltip)}
    />
  );
  const variant = (
    <div
      className={`tw:flex tw:flex-initial tw:flex-col tw:gap-0.5 ${inReplay ? "tw:min-w-20" : "tw:min-w-0"} tw:not-phone:group-data-own-row/strip:min-w-min tw:not-phone:group-data-own-row/strip:flex-1 tw:phone:min-w-min tw:phone:flex-1`}
    >
      <span className={`${STAT_LABEL_CLASS} tw:whitespace-nowrap`}>
        Variant
        {gameInfoButton}
      </span>
      {phoneLayout ? (
        <span className="tw:block tw:w-0 tw:min-w-full tw:truncate tw:text-[17px] tw:leading-[24px] tw:font-semibold tw:text-game-muted">
          {variantName}
        </span>
      ) : (
        // A long name gets smaller text instead of a wider bar. When the variant shares a row with
        // the buttons, the name takes no width of its own, so that only the label sets the
        // variant's minimum width.
        <span
          className="tw:flex tw:min-w-0 tw:group-data-own-row/strip:w-0 tw:group-data-own-row/strip:min-w-full tw:text-[17px] tw:leading-[30px] tw:font-semibold tw:text-game-muted"
          style={{ maxWidth: VARIANT_NAME_MAX_WIDTH }}
        >
          <FitText text={variantName} />
        </span>
      )}
    </div>
  );
  // In the panel, the buttons wrap, and each grows to fill its row. A menu's button or the replay
  // toggle is in a box of its own, with its menu or its ring.
  const buttons = (
    <div
      className={
        panel
          ? `tw:flex tw:flex-wrap tw:gap-2 tw:*:grow tw:*:justify-center tw:[&>*>button]:w-full tw:[&>*>button]:justify-center ${tabbed ? "tw:mt-auto" : ""}`
          : "tw:ml-auto tw:flex tw:max-w-full tw:shrink-0 tw:flex-wrap tw:content-center tw:items-center tw:justify-end tw:gap-2.5 tw:not-phone:group-data-own-row/strip:min-h-(--strip-height) tw:phone:gap-2"
      }
    >
      {!panel && (
        <div className="tw:mr-auto tw:hidden tw:phone:flex">{chatButton}</div>
      )}
      {replayToggle !== undefined && <ReplayToggle {...replayToggle} />}
      {viewAsMenu}
      {tableMenu}
      {/* "Lobby" sits in the bottom-right corner of the screen, which is easy to find. The bar has
          room only for its icon, so the bar gives it a tooltip. The panel has room for its label. */}
      <button
        aria-label="Lobby"
        className={buttonClass}
        onClick={onLobby}
        ref={panel ? undefined : tooltipRef(LOBBY_TOOLTIP)}
        type="button"
      >
        <i aria-hidden="true" className="fas fa-door-open" />
        {panel && <span>Lobby</span>}
      </button>
    </div>
  );

  // The panel at the bottom of the right column gives the hands the whole height of the screen. The
  // panel is as narrow as a phone, so it takes the styles of the phone layout: the smaller text and
  // buttons, and the replay controls that wrap.
  if (panel) {
    const shownControls = replayControls ?? closingControls;
    const controls = shownControls !== undefined && (
      <div
        // The controls stay at the top when they are shorter than their largest height.
        className="tw:flex tw:items-start"
        // The controls of a replay that has ended only slide away.
        inert={!inReplay}
        ref={controlsRef}
      >
        {shownControls}
      </div>
    );
    // When a replay starts, its controls go where the rest of the panel stays where it was. Without
    // tabs, they are at the top, and the panel grows up into the clue log's space. With tabs, the
    // panel fills its tab, with the numbers at the top and the buttons at the bottom, and the
    // controls go between them. The gaps between the three groups are larger than the gaps in them,
    // so that each group reads as one.
    const status = (
      <div
        className={`tw:flex tw:flex-col tw:gap-5 ${tabbed ? "tw:h-full" : ""}`}
        data-panel-status
        ref={statusRef}
      >
        {!tabbed && controls}
        {/* The four numbers spread across one row when it has room for them, or two rows of two.
            The variant's name is under them. It says what it is, so it needs no label. The chat
            button is in the corner of the room that the numbers leave: after the first row of two,
            or after the name, since the chat's rail is hidden (see "ChatPanel.tsx"). With tabs, it
            is beside them instead, so that the clue log's tab shows it too. */}
        <div className="tw:grid tw:grid-cols-[auto_auto_1fr] tw:items-start tw:gap-x-6 tw:gap-y-2.5 tw:@min-[18rem]/panel:grid-cols-[repeat(4,auto)] tw:@min-[18rem]/panel:justify-between tw:@min-[18rem]/panel:gap-x-4 tw:[&>div:not([data-chat],[data-variant])]:contents">
          {progress}
          {planning}
          {!tabbed && (
            <div
              className="tw:col-start-3 tw:row-start-1 tw:justify-self-end tw:@min-[18rem]/panel:col-start-4 tw:@min-[18rem]/panel:row-start-2 tw:@min-[18rem]/panel:self-center"
              data-chat
            >
              {chatButton}
            </div>
          )}
          <div
            // In one row of numbers, the name shares its row with the chat button, and it leaves
            // room for the button (`size-9`) and a gap.
            className={`tw:col-span-full tw:flex tw:min-w-0 tw:items-center tw:self-center tw:text-[17px] tw:leading-[24px] tw:font-semibold tw:text-game-muted ${tabbed ? "" : "tw:@min-[18rem]/panel:row-start-2 tw:@min-[18rem]/panel:pr-12"}`}
            data-variant
          >
            <span className="tw:truncate">{variantName}</span>
            {gameInfoButton}
          </div>
        </div>
        {tabbed && controls}
        {buttons}
      </div>
    );

    if (!tabbed) {
      return (
        <>
          {clueLog}
          <footer
            className={`tw:group/strip tw:@container/panel tw:relative tw:flex tw:shrink-0 tw:flex-col tw:rounded-game-panel tw:p-3.5 tw:text-game-screen-compact ${panelColorClass}`}
            data-panel=""
            data-phone-layout=""
            ref={setFooter}
          >
            {status}
          </footer>
        </>
      );
    }

    // The panel and the logs share the rest of the column, one tab at a time.
    return (
      <footer
        className={`tw:group/strip tw:@container/panel tw:relative tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-3 tw:rounded-game-panel tw:p-3.5 tw:text-game-screen-compact ${panelColorClass}`}
        data-panel=""
        data-phone-layout=""
        data-tabbed=""
        ref={setFooter}
      >
        <div className="tw:flex tw:items-center tw:gap-3">
          <Tabs
            label="Status and logs"
            onTab={(id) => {
              setLogsShown(id !== STATUS_TAB);
              if (id !== STATUS_TAB) {
                onLogTab(id);
              }
            }}
            reducedMotion={reducedMotion}
            tab={tab}
            tabs={[
              [STATUS_TAB, "Status"],
              [CLUE_LOG_TAB, "Clues"],
              [ACTION_LOG_TAB, "Actions"],
            ]}
          />
          <div className="tw:ml-auto">{chatButton}</div>
        </div>
        <div className="tw:grid tw:min-h-0 tw:flex-1 tw:grid-cols-[minmax(0,1fr)] tw:grid-rows-[minmax(0,1fr)]">
          <div
            className={`tw:col-start-1 tw:row-start-1 ${tab === STATUS_TAB ? "" : "tw:invisible"}`}
            id={STATUS_TAB}
            role="tabpanel"
            style={getTabPanelStyle(tab === STATUS_TAB, reducedMotion)}
          >
            {status}
          </div>
          {/* The logs' own views are the tabs' views. */}
          <div
            className={`tw:col-start-1 tw:row-start-1 tw:grid tw:min-h-0 tw:grid-cols-[minmax(0,1fr)] tw:grid-rows-[minmax(0,1fr)] ${logsShown ? "" : "tw:invisible"}`}
            style={getTabPanelStyle(logsShown, reducedMotion)}
          >
            {clueLog}
          </div>
        </div>
      </footer>
    );
  }

  // When the replay controls have a row of their own, the row under them keeps the height of the
  // bar, so that the numbers and the buttons stay where they were.
  const barControls = replayControls ?? closingControls;
  return (
    <footer
      className={`tw:group/strip tw:relative tw:flex tw:h-(--strip-height) tw:shrink-0 tw:items-center tw:gap-7 tw:px-7 tw:text-game-screen-compact ${colorClass} tw:not-phone:data-own-row:h-auto tw:not-phone:data-own-row:flex-wrap tw:not-phone:data-own-row:gap-y-0 tw:not-phone:data-own-row:pt-2.5 tw:phone:h-auto tw:phone:flex-wrap tw:phone:gap-x-5 tw:phone:gap-y-2 tw:narrow-530:gap-x-4 tw:phone:px-3 tw:phone:py-3`}
      data-own-row={ownRow ? "" : undefined}
      ref={setFooter}
      style={{ "--strip-height": `${BAR_HEIGHT}px` } as React.CSSProperties}
    >
      {progress}
      <GroupDivider />
      {planning}
      <GroupDivider />
      {variant}
      {barControls !== undefined && (
        <GroupDivider
          className="tw:group-data-own-row/strip:hidden"
          ref={dividerRef}
        />
      )}
      {barControls !== undefined && (
        <div
          // When the controls have a row of their own, and on a narrow window, they are on top.
          className="tw:flex tw:shrink-0 tw:grow tw:basis-0 tw:group-data-own-row/strip:order-first tw:group-data-own-row/strip:basis-full tw:phone:order-first tw:phone:basis-full"
          // The controls of a replay that has ended only fade away.
          inert={!inReplay}
          ref={controlsRef}
        >
          {barControls}
        </div>
      )}
      {buttons}
    </footer>
  );
}
