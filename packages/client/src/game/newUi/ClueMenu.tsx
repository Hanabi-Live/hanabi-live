import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { ColorSymbolView, getRankClueLabel } from "./Card.tsx";
import { ClueTokenIcon } from "./ClueTokenIcon.tsx";
import { getColorSymbol } from "./clueMarkers.ts";
import { onEscapeKey } from "./escapeKey.ts";
import { fadeOutCopy, SLIDE } from "./motion.ts";
import { measure } from "./screenScale.ts";
import { KEY_CLASS, WELL_CLASS } from "./surfaces.ts";

interface ClueMenuProps {
  readonly name: string;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly reducedMotion: boolean;

  /** The chosen clue, if any. Clicking the chosen clue again clears the choice. */
  readonly clue: Clue | undefined;
  readonly onChooseClue: (clue: Clue | undefined) => void;

  /** Whether the rules allow a clue to this player. A clue that touches no cards may not be. */
  readonly isAllowed: (clue: Clue) => boolean;
  readonly canGive: boolean;
  readonly onGive: () => void;

  /** Whether the player's hand shows what they would know after the chosen clue. */
  readonly cluePreview: boolean;
  readonly onToggleCluePreview: () => void;

  readonly onShowActions: () => void;
  readonly onClose: () => void;

  /**
   * Whether the menu opened by itself at the start of the turn, as in a 2-player game. Then it does
   * not take the focus or scroll the page, so that it does not interrupt the viewer.
   */
  readonly openedItself: boolean;

  /**
   * Whether the drawer opens below the hand, as in the phone layout, where the page scrolls to show
   * it. Otherwise, it opens to the right of the hand when it fits, so that it does not cover the
   * other hands.
   */
  readonly below: boolean;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  return a?.type === "color" && b.type === "color"
    ? a.value.name === b.value.name
    : a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

/** Where the drawer opens, from the hand. */
type DrawerSide = "right" | "below";

/** The radius of the drawer's corners, in CSS pixels (`tw:rounded-game-panel`). */
const DRAWER_RADIUS = 8;

/**
 * The spaces in the drawer to the right of the hand, in CSS pixels: around its content, below its
 * title, and above the button to give the clue. The classes are in pixels, not in Tailwind's
 * spacing, which grows with the font of the game screen. When the drawer is only a little taller
 * than the hand, it uses the compact spaces, so that it is as tall as the hand. A small step
 * between them would look like a mistake.
 */
const SPACING = {
  NORMAL: {
    padding: 12,
    title: 8,
    button: 16,
    className: "tw:p-[12px]",
    titleClassName: "tw:gap-[8px]",
    buttonClassName: "tw:gap-[16px]",
  },
  COMPACT: {
    padding: 8,
    title: 4,
    button: 8,
    className: "tw:px-[12px] tw:py-[8px]",
    titleClassName: "tw:gap-[4px]",
    buttonClassName: "tw:gap-[8px]",
  },
} as const;

function getSpaces(spacing: (typeof SPACING)[keyof typeof SPACING]): number {
  return 2 * spacing.padding + spacing.title + spacing.button;
}

/** How much shorter the compact spaces make the drawer, in CSS pixels. */
const COMPACT_SAVING = getSpaces(SPACING.NORMAL) - getSpaces(SPACING.COMPACT);

/**
 * The menu below the hand. It has no outline on its top, where it joins the hand, and its shadow
 * falls down.
 */
const BELOW_CLASS =
  "tw:inset-x-0 tw:top-full tw:rounded-b-game-panel tw:pt-1 tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line),0_16px_20px_-10px_rgb(0_0_0/55%)]";

/**
 * The menu to the right of the hand. It has an outline on every side, and a line in the panel's
 * color covers the outline where it joins the hand (see `ClueMenu`). Its shadow falls down and to
 * the right, away from the hand.
 */
const RIGHT_CLASS =
  "tw:left-full tw:rounded-r-game-panel tw:[box-shadow:inset_0_0_0_1px_var(--game-screen-line),12px_16px_20px_-10px_rgb(0_0_0/55%)]";

const DRAWER_CLASS = {
  right: RIGHT_CLASS,
  below: BELOW_CLASS,
} as const satisfies Record<DrawerSide, string>;

/**
 * The width and height of a clue choice, in CSS pixels (`choiceSizeClass`). It is in pixels, not in
 * Tailwind's spacing, which grows with the font of the game screen and of the choice.
 */
const CHOICE_SIZE = 44;

/** The space between the clue choices in a row, in CSS pixels (`tw:gap-[8px]` in `ClueRow`). */
const CHOICE_GAP = 8;

/**
 * The fewest choices that the drawer to the right of the hand is as wide as, so that a variant with
 * few clues still has room for the player's name above them.
 */
const DRAWER_MIN_CHOICES = 4;

/**
 * Returns the width of the drawer to the right of the hand, in CSS pixels: its row of the most
 * clues, and its padding on each side. The hands leave this room to their right, so that the drawer
 * always fits there (see "getWideLayoutRoom"). A long name is cut off.
 */
export function getClueDrawerWidth(variant: Variant): number {
  const choices = Math.max(
    variant.clueColors.length,
    variant.clueRanks.length,
    DRAWER_MIN_CHOICES,
  );
  return (
    choices * CHOICE_SIZE
    + (choices - 1) * CHOICE_GAP
    + 2 * SPACING.NORMAL.padding
  );
}

// A choice is never wider than its column (see `ClueRow`).
const choiceSizeClass =
  "tw:h-[44px] tw:w-[44px] tw:max-w-full tw:rounded-game-control";

const choiceClass = `tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:text-lg tw:font-extrabold ${choiceSizeClass} ${KEY_CLASS}`;

/**
 * The clues that the viewer can give a player. The key in the player's clue tab (see `ClueTab`)
 * opens it out of their hand, as a drawer (see `ClueHandLayer`). It opens to the right of the hand,
 * so that it does not cover the other hands. The hands always leave room for it there (see
 * `getClueDrawerWidth`). Its top lines up with the top of the hand. When there is not enough room
 * below, its bottom lines up with the bottom of the hand instead. In the phone layout, it opens
 * below the hand, as wide as the hand. A clue that the rules do not allow, such as one that touches
 * no cards, leaves an empty well in its place, so that every clue keeps its position. Clicking
 * outside of it or pressing Escape closes it.
 */
export function ClueMenu({
  name,
  variant,
  colorblindMode,
  reducedMotion,
  clue,
  onChooseClue,
  isAllowed,
  canGive,
  onGive,
  cluePreview,
  onToggleCluePreview,
  onShowActions,
  onClose,
  openedItself,
  below,
}: ClueMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const colorClues = variant.clueColors.map((color) => newColorClue(color));
  const rankClues = variant.clueRanks.map((rank) => newRankClue(rank));
  const columns = Math.max(colorClues.length, rankClues.length);
  // Where the drawer is for the player whose menu this is, in this layout: whether its bottom lines
  // up with the bottom of the hand instead of its top with the top, and the heights of both. It is
  // undefined until it is measured.
  const [placement, setPlacement] = useState<{
    readonly name: string;
    readonly phoneLayout: boolean;
    readonly alignBottom: boolean;
    readonly compact: boolean;
    readonly height: number;
    readonly handHeight: number;
  }>();
  const measured =
    placement?.name === name && placement.phoneLayout === below
      ? placement
      : undefined;
  const side: DrawerSide = below ? "below" : "right";
  const measuredSide = measured === undefined ? undefined : side;
  const opensRight = side === "right";

  // It measures the drawer and the hand. It measures again when the window, the hand, or the drawer
  // changes size, such as when the cards grow after the menu opens.
  useLayoutEffect(() => {
    const menu = ref.current!;
    const content = contentRef.current!;
    const hand = menu.parentElement!;
    // It stays beside the hands, so that it does not cover the bar below the table.
    const room = hand.parentElement!;

    function place() {
      // The heights are in the screen's CSS pixels, which become styles.
      const handRect = measure(hand);
      const roomRect = measure(room);
      // The height of the drawer with the normal spaces. The content has the spaces that it has
      // now, so they are swapped for the normal ones.
      const spacing =
        menu.dataset["compact"] === undefined
          ? SPACING.NORMAL
          : SPACING.COMPACT;
      const height =
        measure(content).height
        - spacing.title
        - spacing.button
        + getSpaces(SPACING.NORMAL);
      // The drawer is at least as tall as the hand, so that the hand's side is not left without an
      // outline. When it is taller by less than the compact spaces save, it uses them and is as
      // tall as the hand.
      const compact =
        height > handRect.height && height - COMPACT_SAVING <= handRect.height;
      const drawerHeight = Math.max(height, handRect.height);
      const next = {
        name,
        phoneLayout: below,
        alignBottom: handRect.top + drawerHeight > roomRect.bottom,
        compact,
        height: compact ? handRect.height : drawerHeight,
        handHeight: handRect.height,
      };
      setPlacement((previous) =>
        previous !== undefined
        && previous.name === next.name
        && previous.phoneLayout === next.phoneLayout
        && previous.alignBottom === next.alignBottom
        && previous.compact === next.compact
        && previous.height === next.height
        && previous.handHeight === next.handHeight
          ? previous
          : next,
      );
    }

    place();
    const observer = new ResizeObserver(place);
    observer.observe(hand);
    observer.observe(content);
    observer.observe(menu);
    observer.observe(document.documentElement);
    return () => {
      observer.disconnect();
    };
  }, [name, below]);

  // When the drawer closes, a copy of it slides back behind the hand from where it is (see
  // `fadeOutCopy`), while the hand loses the drawer's color (see `ClueHandLayer`). This runs before
  // the cleanup below, which stops the drawer's slide out.
  const closingSideRef = useRef<DrawerSide>(undefined);
  useLayoutEffect(() => {
    closingSideRef.current = reducedMotion ? undefined : measuredSide;
  }, [measuredSide, reducedMotion]);
  useLayoutEffect(() => {
    const menu = ref.current;
    return () => {
      const closingSide = closingSideRef.current;
      if (menu === null || closingSide === undefined) {
        return;
      }
      const { clipPath, transform } = getComputedStyle(menu);
      fadeOutCopy(
        menu,
        [
          {
            transform,
            clipPath,
          },
          getHiddenDrawer(menu, closingSide),
        ],
        SLIDE,
      );
    };
  }, []);

  // The drawer slides out from behind the edge of the hand, and the part that is still behind the
  // hand is cut off. The sliding only decorates.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (measuredSide === undefined || reducedMotion || menu === null) {
      return undefined;
    }
    const animation = menu.animate(
      [
        getHiddenDrawer(menu, measuredSide),
        {
          transform: "none",
          clipPath: "inset(0 0 0 0)",
        },
      ],
      SLIDE,
    );
    return () => {
      animation.cancel();
    };
    // It slides only when the drawer opens, not when it is measured again.
  }, [name, measuredSide, reducedMotion]);

  // On a narrow window, the page scrolls, so it scrolls to show all of the menu. It waits until the
  // drawer is in its place, and until the drawer has slid out, because the drawer is not in its
  // place while it slides, and the page would not scroll far enough.
  useEffect(() => {
    const menu = ref.current;
    if (measuredSide === undefined || openedItself || menu === null) {
      return undefined;
    }

    function scroll() {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
    const [unfolding] = menu.getAnimations();
    if (unfolding === undefined) {
      scroll();
      return undefined;
    }
    unfolding.addEventListener("finish", scroll);
    return () => {
      unfolding.removeEventListener("finish", scroll);
    };
  }, [name, measuredSide, openedItself]);

  useEffect(() => {
    if (!openedItself) {
      ref.current?.focus({ preventScroll: true });
    }
    const stopEscape = onEscapeKey(onClose);

    function onPointerDown(event: PointerEvent) {
      const { target } = event;
      const menu = ref.current;
      if (menu !== null && target instanceof Node && !menu.contains(target)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      stopEscape();
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, openedItself]);

  // An edge of the drawer lines up with an edge of the hand through CSS, so that rounding does not
  // leave a step between them. The corners where the drawer joins the hand are square. A corner of
  // the drawer that reaches past the hand is round.
  const alignBottom = measured?.alignBottom === true;
  const compact = opensRight && measured?.compact === true;
  const spacing = compact ? SPACING.COMPACT : SPACING.NORMAL;
  const reachesPast =
    measured !== undefined && measured.height > measured.handHeight;
  const rightStyle: React.CSSProperties = {
    ...(alignBottom ? { bottom: 0 } : { top: 0 }),
    width: getClueDrawerWidth(variant),
    minHeight: measured?.height,
    borderTopLeftRadius: alignBottom && reachesPast ? DRAWER_RADIUS : 0,
    borderBottomLeftRadius: !alignBottom && reachesPast ? DRAWER_RADIUS : 0,
  };

  return (
    <div
      aria-label={`Give ${name} a clue`}
      className={`tw:absolute tw:z-30 tw:bg-game-panel tw:outline-none ${spacing.className} ${DRAWER_CLASS[side]}`}
      data-clue-drawer={side}
      data-compact={compact ? true : undefined}
      ref={ref}
      role="dialog"
      style={opensRight ? rightStyle : undefined}
      tabIndex={-1}
    >
      {opensRight && measured !== undefined && (
        // It covers the outline where the drawer joins the hand, but not the ends of the hand's own
        // outline. It reaches 1px to each side of the outline, because a zoomed screen does not
        // draw the outline and this line on the same pixels.
        <span
          aria-hidden="true"
          className="tw:absolute tw:-left-px tw:w-[3px] tw:bg-game-panel"
          style={{
            ...(alignBottom ? { bottom: 1 } : { top: 1 }),
            height: measured.handHeight - 2,
          }}
        />
      )}
      <div
        className={`tw:flex tw:flex-col ${spacing.titleClassName}`}
        ref={contentRef}
      >
        <div className="tw:flex tw:items-center tw:gap-2">
          <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:pl-0.5 tw:text-[14px] tw:font-semibold tw:text-game-muted">
            Clue {name}
          </span>
          {/* The classic screen's flashlight. A card's menu already shows a hand as its player sees it now. */}
          <button
            aria-label={`Show ${name}'s view of their hand after the clue`}
            aria-pressed={cluePreview}
            className={`tw:flex tw:size-7 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:text-[13px] ${
              cluePreview
                ? "tw:bg-game-text tw:text-card-ink"
                : "tw:bg-transparent tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            }`}
            data-clue-preview
            onClick={onToggleCluePreview}
            ref={tooltipRef(
              `Show ${name}'s hand as they would see it after the clue that you pick`,
            )}
            type="button"
          >
            {/* The image is a white shape, so it masks the text color to follow the button's state. */}
            <span
              aria-hidden="true"
              className="tw:size-4 tw:shrink-0 tw:bg-current tw:mask-[url(/public/img/flashlight.png)] tw:mask-contain tw:mask-center tw:mask-no-repeat"
            />
          </button>
          <button
            aria-label={`Show ${name}'s actions`}
            className="tw:flex tw:size-7 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-[13px] tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            onClick={onShowActions}
            ref={tooltipRef(`Show ${name}'s actions`)}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-history" />
          </button>
        </div>
        {/* The button to give the clue sits to the right of the clues, in the room that they leave.
          When there is not enough room, or when the drawer is to the right of the hand, it goes
          below them. A wide gap and a line keep a click on a
          clue from landing on the button. When the button goes below the clues, the line is at the
          left of the row, where the row clips it. The row reaches 8px into the padding, so that it
          does not clip the rings and shadows of the buttons. */}
        <div
          className={`tw:-mx-2 tw:flex tw:overflow-x-clip tw:px-2 ${opensRight ? `tw:flex-col ${spacing.buttonClassName}` : "tw:flex-wrap tw:gap-6"}`}
        >
          <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
            <ClueRow columns={columns} wraps={!opensRight}>
              {colorClues.map((colorClue) => {
                const color = colorClue.value;
                if (!isAllowed(colorClue)) {
                  return <EmptySlot key={color.name} />;
                }
                const pressed = isSameClue(clue, colorClue);
                const symbol = getColorSymbol(variant, color, colorblindMode);
                return (
                  <button
                    aria-label={color.name}
                    aria-pressed={pressed}
                    className={`${choiceClass} ${pressed ? "tw:ring-3 tw:ring-game-text" : ""}`}
                    key={color.name}
                    onClick={() => {
                      onChooseClue(pressed ? undefined : colorClue);
                    }}
                    style={{
                      background: colorblindMode
                        ? color.fillColorblind
                        : color.fill,
                    }}
                    type="button"
                  >
                    {symbol !== undefined && (
                      <ColorSymbolView size={CHOICE_SIZE} symbol={symbol} />
                    )}
                  </button>
                );
              })}
            </ClueRow>
            <ClueRow columns={columns} wraps={!opensRight}>
              {rankClues.map((rankClue) => {
                const rank = rankClue.value;
                if (!isAllowed(rankClue)) {
                  return <EmptySlot key={rank} />;
                }
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
                    {getRankClueLabel(variant, rank)}
                  </button>
                );
              })}
            </ClueRow>
          </div>
          <div className="tw:relative tw:flex tw:min-w-[140px] tw:flex-1 tw:before:absolute tw:before:inset-y-0 tw:before:-left-3 tw:before:w-px tw:before:bg-game-line">
            <button
              className={`tw:flex tw:min-h-11 tw:flex-1 tw:cursor-pointer tw:items-center tw:justify-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-4 tw:text-[17px] tw:leading-tight tw:text-balance tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
              disabled={!canGive}
              onClick={onGive}
              type="button"
            >
              {/* The token shows what the button does and what it spends, as on the name of a
                  player who can take a clue. A prompt to pick a clue is not an action, so it has
                  none. */}
              {clue !== undefined && <ClueTokenIcon className="tw:size-5" />}
              <span>
                {clue === undefined ? "Pick a color or number" : "Give clue"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A row of clues. Below the hand, it wraps when the hand is narrow. The drawer to the right of the
 * hand is as wide as its longest row (see `getClueDrawerWidth`), so there it does not wrap. There,
 * both rows have the same equal columns, so that the choices line up. When the drawer is narrower
 * than it should be, every column narrows by the same amount.
 */
function ClueRow({
  children,
  columns,
  wraps,
}: {
  readonly children: readonly React.JSX.Element[];
  readonly columns: number;
  readonly wraps: boolean;
}): React.JSX.Element {
  return wraps ? (
    <div className="tw:flex tw:flex-wrap tw:gap-[8px]">{children}</div>
  ) : (
    <div
      className="tw:grid tw:gap-[8px]"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, ${CHOICE_SIZE}px))`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The place of a clue that the rules do not allow: an empty well, with no button in it. A key
 * stands on a lip, so the well sits where a pressed key would, to look centered between the keys.
 */
function EmptySlot(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`tw:translate-y-[2px] ${choiceSizeClass} ${WELL_CLASS}`}
    />
  );
}

/** How the clue menu looks before it slides out of the hand, behind the hand's edge. */
function getHiddenDrawer(menu: HTMLElement, side: DrawerSide): Keyframe {
  const { height, width } = measure(menu);
  return side === "right"
    ? {
        transform: `translateX(${-width}px)`,
        clipPath: `inset(0 0 0 ${width}px)`,
      }
    : {
        transform: `translateY(${-height}px)`,
        clipPath: `inset(${height}px 0 0 0)`,
      };
}

/**
 * Plays a slide of the clue tab and of its hand forward when `open` turns on, and backward when it
 * turns off, from where the slide is. The slide holds its look at either end. When it ends after it
 * played backward, it calls `onClosed`. The tab and its hand use the same slide, so that they fade
 * together in both directions. The slides only decorate.
 */
function useTabSlide(
  ref: React.RefObject<HTMLElement | null>,
  getKeyframes: (element: HTMLElement) => readonly Keyframe[],
  open: boolean,
  reducedMotion: boolean,
  layoutKey: unknown,
  onClosed?: () => void,
) {
  const animationRef = useRef<Animation>(undefined);
  const openRef = useRef(open);
  openRef.current = open;
  const keyframesRef = useRef(getKeyframes);
  keyframesRef.current = getKeyframes;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // A slide that starts closed waits at its start.
  useLayoutEffect(() => {
    const element = ref.current;
    if (reducedMotion || element === null) {
      return undefined;
    }
    const animation = element.animate([...keyframesRef.current(element)], {
      ...SLIDE,
      fill: "both",
    });
    if (!openRef.current) {
      animation.pause();
    }
    animationRef.current = animation;
    return () => {
      animationRef.current = undefined;
      animation.cancel();
    };
  }, [ref, reducedMotion, layoutKey]);

  const startedRef = useRef(false);
  useLayoutEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      return undefined;
    }
    const animation = animationRef.current;
    if (animation === undefined) {
      if (!open) {
        onClosedRef.current?.();
      }
      return undefined;
    }
    animation.playbackRate = open ? 1 : -1;
    animation.play();
    if (open) {
      return undefined;
    }
    function finish() {
      onClosedRef.current?.();
    }
    animation.addEventListener("finish", finish);
    return () => {
      animation.removeEventListener("finish", finish);
    };
  }, [open]);
}

function getLayerKeyframes(): readonly Keyframe[] {
  return [{ opacity: 0 }, { opacity: 1 }];
}

/**
 * A layer behind the cards of a hand that can show its clue tab or its clue menu. While the tab or
 * the menu shows, the layer gives the hand their color, and one outline goes around both. The layer
 * has no outline and no round corners on the side where they join it: its right, or its bottom when
 * the menu opens below the hand. The menu is a drawer that opens out of the hand.
 *
 * The layer fades in and out with its opacity, as the tab and the menu slide. Do not animate the
 * hand's background color instead:
 * Chrome 157 runs such an animation on the compositor, and then sometimes crashes the tab when the
 * hand's style changes.
 */
export function ClueHandLayer({
  shown,
  reducedMotion,
}: {
  readonly shown: boolean;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useTabSlide(ref, getLayerKeyframes, shown, reducedMotion, undefined);
  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-l-game-panel tw:bg-game-panel tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line)] tw:[:has(>[data-clue-drawer=below])>&]:rounded-tr-game-panel tw:[:has(>[data-clue-drawer=below])>&]:rounded-bl-none tw:[:has(>[data-clue-drawer=below])>&]:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line)]"
      ref={ref}
      style={{ opacity: shown ? 1 : 0 }}
    />
  );
}

/**
 * The tab to the right of the hand, as tall as the hand, with its key halfway down. It has an
 * outline on its top, right, and bottom, which go on from the hand's outline. The space to the
 * right of the key is as wide as the space to its left, which is the hand's padding (16px) and the
 * tab's (10px).
 */
const TAB_RIGHT_CLASS =
  "tw:inset-y-0 tw:left-full tw:flex tw:items-center tw:rounded-r-game-panel tw:bg-game-panel tw:pr-[26px] tw:pl-2.5 tw:[box-shadow:inset_0_1px_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line),12px_16px_20px_-10px_rgb(0_0_0/55%)]";

/**
 * A small drawer with one key, which opens the clue menu of a player. It slides out of the right of
 * their hand while the pointer is over the hand, on the viewer's turn when the team has a clue, and
 * slides back when the pointer leaves. On a touch screen, a tap on the hand shows it. Like the
 * menu, it opens to the right of the hand, where the hands always leave room (see
 * `getClueDrawerWidth`). In the phone layout, there is no room there, so it sits in the hand's top
 * right corner, beside the player's name.
 */
export function ClueTab({
  name,
  below,
  top,
  reducedMotion,
  open,
  onOpen,
  onClosed,
}: {
  readonly name: string;
  readonly below: boolean;

  /** In the phone layout, the distance from the top of the hand to the top of the name. */
  readonly top: number;
  readonly reducedMotion: boolean;

  /** Whether the tab is open. When it is not, it slides back, and then `onClosed` removes it. */
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClosed: () => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // It slides out from behind the edge of the hand, as the menu does. In the phone layout, it
  // slides in a little from the right. It fades in with the color of the hand (see
  // `ClueHandLayer`). When it closes, it slides back, and then it is removed.
  useTabSlide(
    ref,
    (tab) => {
      const { width } = measure(tab);
      return [
        below
          ? {
              transform: `translateX(${width / 2}px)`,
              opacity: 0,
            }
          : {
              transform: `translateX(${-width}px)`,
              clipPath: `inset(0 0 0 ${width}px)`,
              opacity: 0,
            },
        {
          transform: "none",
          clipPath: "inset(0 0 0 0)",
          opacity: 1,
        },
      ];
    },
    open,
    reducedMotion,
    below,
    onClosed,
  );

  return (
    <div
      className={`tw:absolute tw:z-20 ${below ? "tw:right-3" : TAB_RIGHT_CLASS}`}
      data-clue-tab
      ref={ref}
      style={below ? { top } : undefined}
    >
      <button
        aria-label={`Give ${name} a clue`}
        className={`tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-clue tw:text-card-ink tw:hover:brightness-110 ${below ? "tw:size-10" : "tw:size-14"} ${KEY_CLASS}`}
        onClick={onOpen}
        ref={tooltipRef(`Give ${name} a clue`)}
        type="button"
      >
        <ClueTokenIcon className={below ? "tw:size-7" : "tw:size-10"} />
      </button>
    </div>
  );
}
