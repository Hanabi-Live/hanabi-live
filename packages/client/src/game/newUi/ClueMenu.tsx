import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { ColorSymbolView, getRankClueLabel } from "./Card.tsx";
import { getColorSymbol } from "./clueMarkers.ts";
import { ClueTokenIcon } from "./ClueTokenIcon.tsx";
import { onEscapeKey } from "./escapeKey.ts";
import { FADE_LAYER_PARENT_CLASS, FadeLayer } from "./FadeLayer.tsx";
import {
  fadeOutCopy,
  getOpacityTransition,
  SLIDE,
  SLIDE_BACK,
  useFade,
} from "./motion.ts";
import { measure } from "./screenScale.ts";
import { HOVER_CLASS, RAISED_BUTTON_CLASS, WELL_CLASS } from "./surfaces.ts";

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
   * Whether the drawer opens below the hand: in the phone layout, where the page scrolls to show
   * it, and below the lowest hand of a 2-player game when the table has room for it there (see
   * `clueDrawerFitsBelow`). Otherwise, it opens to the right of the hand, so that it does not cover
   * the other hands.
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
  "tw:inset-x-0 tw:top-full tw:rounded-b-game-panel tw:pt-[4px] tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line),0_16px_20px_-10px_rgb(0_0_0/55%)]";

/** The space above the content of the menu below the hand, in CSS pixels (`BELOW_CLASS`). */
const BELOW_TOP_PADDING = 4;

/**
 * The height of the menu's title row, in CSS pixels: its buttons (`tw:size-[28px]` in `ClueMenu`),
 * which are taller than its text.
 */
const TITLE_HEIGHT = 28;

/**
 * The space between the clues and the button to give the clue below the hand, in CSS pixels
 * (`tw:gap-[24px]` in `ClueMenu`).
 */
const BELOW_BUTTON_GAP = 24;

/**
 * The width of the button to give the clue, at its narrowest, in CSS pixels (`tw:min-w-[140px]`).
 */
const GIVE_BUTTON_MIN_WIDTH = 140;

/**
 * Returns whether the drawer fits below a hand in the wide layout, where the hands do not leave
 * room for it there. It does when the hand is the lowest, the table has room below it down to
 * `bottom`, and the hand is wide enough for the button to go beside the clues. Then the drawer is
 * `BELOW_HEIGHT` tall. The rectangle is in the screen's CSS pixels (see `measure`).
 */
export function clueDrawerFitsBelow(
  hand: DOMRect,
  bottom: number,
  variant: Variant,
): boolean {
  return (
    hand.width
      >= getClueDrawerWidth(variant) + BELOW_BUTTON_GAP + GIVE_BUTTON_MIN_WIDTH
    && hand.bottom + BELOW_HEIGHT <= bottom
  );
}

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
 * The height of the drawer below the hand, in CSS pixels, when the button to give the clue is
 * beside the clues: its title row, and its rows of colors and ranks, with its spaces.
 */
const BELOW_HEIGHT =
  BELOW_TOP_PADDING
  + TITLE_HEIGHT
  + SPACING.NORMAL.title
  + 2 * CHOICE_SIZE
  + CHOICE_GAP
  + SPACING.NORMAL.padding;

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

const choiceClass = `tw:relative tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:text-lg tw:font-extrabold ${choiceSizeClass} ${RAISED_BUTTON_CLASS}`;

/**
 * The clues that the viewer can give a player. The player's clue button (see `ClueButton`) opens it
 * out of their hand, as a drawer (see `ClueHandLayer`). It opens to the right of the hand, so that
 * it does not cover the other hands. The hands always leave room for it there (see
 * `getClueDrawerWidth`). Its top lines up with the top of the hand. When there is not enough room
 * below, its bottom lines up with the bottom of the hand instead. It opens below the hand, as wide
 * as the hand, in the phone layout, and below the lowest hand when the table has room for it there,
 * such as in a 2-player game. Then it covers nothing. A clue that the rules do not allow, such as
 * one that touches no cards, leaves an empty well in its place, so that every clue keeps its
 * position. Clicking outside of it or pressing Escape closes it.
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
    readonly below: boolean;
    readonly alignBottom: boolean;
    readonly compact: boolean;
    readonly height: number;
    readonly handHeight: number;
  }>();
  const measured =
    placement?.name === name && placement.below === below
      ? placement
      : undefined;
  const side: DrawerSide = below ? "below" : "right";
  const measuredSide = measured === undefined ? undefined : side;
  const drawerWidth = getClueDrawerWidth(variant);
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
        below,
        alignBottom: handRect.top + drawerHeight > roomRect.bottom,
        compact,
        height: compact ? handRect.height : drawerHeight,
        handHeight: handRect.height,
      };
      setPlacement((previous) =>
        previous !== undefined
        && previous.name === next.name
        && previous.below === next.below
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
  // `fadeOutCopy`), and its content fades out (see `CONTENT_FADE_OUT`), while the hand loses the
  // drawer's color (see `ClueHandLayer`). This runs before the cleanup below, which stops the
  // drawer's slide out and its content's fade in.
  const closingSideRef = useRef<DrawerSide>(undefined);
  useLayoutEffect(() => {
    closingSideRef.current = reducedMotion ? undefined : measuredSide;
  }, [measuredSide, reducedMotion]);
  useLayoutEffect(() => {
    const menu = ref.current;
    const content = contentRef.current;
    return () => {
      const closingSide = closingSideRef.current;
      if (menu === null || closingSide === undefined) {
        return;
      }
      // A menu that has slid out has no cut, which cannot be animated, so it starts from the cut
      // that it ended its slide out with.
      const style = getComputedStyle(menu);
      const clipPath =
        style.clipPath === "none"
          ? getShownDrawer(closingSide).clipPath
          : style.clipPath;
      const { transform } = style;
      const contentIndex = [...menu.children].findIndex(
        (child) => child === content,
      );
      const contentOpacity =
        content === null ? 1 : Number(getComputedStyle(content).opacity);
      const copy = fadeOutCopy(
        menu,
        [
          {
            transform,
            clipPath,
          },
          getHiddenDrawer(menu, closingSide),
        ],
        SLIDE_BACK,
      );
      // A drawer that closes while it opens fades out from where its fade in was.
      copy?.children[contentIndex]?.animate(
        [{ opacity: contentOpacity }, ...CONTENT_FADE_OUT.slice(1)],
        {
          duration: SLIDE_BACK.duration,
          easing: "linear",
          fill: "forwards",
        },
      );
    };
  }, []);

  // The drawer slides out from behind the edge of the hand, and the part that is still behind the
  // hand is cut off. Its content fades in (see `CONTENT_FADE_IN`). The sliding only decorates.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (measuredSide === undefined || reducedMotion || menu === null) {
      return undefined;
    }
    const animation = menu.animate(
      [getHiddenDrawer(menu, measuredSide), getShownDrawer(measuredSide)],
      SLIDE,
    );
    const contentAnimation = contentRef.current?.animate([...CONTENT_FADE_IN], {
      duration: SLIDE.duration,
      easing: "linear",
    });
    return () => {
      animation.cancel();
      contentAnimation?.cancel();
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
    width: drawerWidth,
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
          {/* The classic screen's flashlight. The menu of a player's name already shows their hand as they see it now. */}
          <button
            aria-label={`Show ${name}'s view of their hand after the clue`}
            aria-pressed={cluePreview}
            className={`tw:flex tw:size-[28px] tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-[13px] ${FADE_LAYER_PARENT_CLASS} ${
              cluePreview
                ? "tw:text-card-ink"
                : "tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            }`}
            data-clue-preview
            onClick={onToggleCluePreview}
            ref={tooltipRef(
              `Show ${name}'s hand as they would see it after the clue that you pick`,
            )}
            type="button"
          >
            <FadeLayer
              className="tw:bg-game-text"
              reducedMotion={reducedMotion}
              shown={cluePreview}
            />
            {/* The image is a white shape, so it masks the text color to follow the button's state. */}
            <span
              aria-hidden="true"
              className="tw:size-4 tw:shrink-0 tw:bg-current tw:mask-[url(/public/img/flashlight.png)] tw:mask-contain tw:mask-center tw:mask-no-repeat"
            />
          </button>
          <button
            aria-label={`Show ${name}'s actions`}
            className="tw:flex tw:size-[28px] tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-[13px] tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            onClick={onShowActions}
            ref={tooltipRef(`Show ${name}'s actions`)}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-list" />
          </button>
        </div>
        {/* The button to give the clue sits to the right of the clues, in the room that they leave.
          When there is not enough room, or when the drawer is to the right of the hand, it goes
          below them. A wide gap and a line keep a click on a
          clue from landing on the button. When the button goes below the clues, the line is at the
          left of the row, where the row clips it. The row reaches 8px into the padding, so that it
          does not clip the rings and shadows of the buttons. */}
        <div
          className={`tw:-mx-2 tw:flex tw:overflow-x-clip tw:px-2 ${opensRight ? `tw:flex-col ${spacing.buttonClassName}` : "tw:flex-wrap tw:gap-[24px]"}`}
        >
          <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-[8px]">
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
                    className={choiceClass}
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
                    <ChoiceRing
                      className="tw:ring-game-text"
                      pressed={pressed}
                      reducedMotion={reducedMotion}
                    />
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
                    className={`${choiceClass} tw:bg-game-text tw:text-card-ink`}
                    key={rank}
                    onClick={() => {
                      onChooseClue(pressed ? undefined : rankClue);
                    }}
                    type="button"
                  >
                    <ChoiceRing
                      className="tw:ring-clue"
                      pressed={pressed}
                      reducedMotion={reducedMotion}
                    />
                    {getRankClueLabel(variant, rank)}
                  </button>
                );
              })}
            </ClueRow>
          </div>
          <div className="tw:relative tw:flex tw:min-w-[140px] tw:flex-1 tw:before:absolute tw:before:inset-y-0 tw:before:-left-3 tw:before:w-px tw:before:bg-game-line">
            <button
              className={`tw:flex tw:min-h-11 tw:flex-1 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-transparent tw:px-4 tw:text-[17px] tw:leading-tight tw:text-balance tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${FADE_LAYER_PARENT_CLASS} ${RAISED_BUTTON_CLASS}`}
              disabled={!canGive}
              onClick={onGive}
              type="button"
            >
              {/* The color of clues fades in when the player can give the clue. */}
              <FadeLayer
                className="tw:bg-clue"
                reducedMotion={reducedMotion}
                shown={canGive}
              />
              {/* The token shows what the button does and what it spends, as on the name of a
                  player who can take a clue. A prompt to pick a clue is not an action, so it has
                  none. The new label fades in. */}
              <span
                className={`tw:flex tw:items-center tw:justify-center tw:gap-2 ${reducedMotion ? "" : "tw:starting:opacity-0"}`}
                key={clue === undefined ? "pick" : "give"}
                style={{
                  transition: reducedMotion
                    ? undefined
                    : getOpacityTransition(true),
                }}
              >
                {clue !== undefined && <ClueTokenIcon className="tw:size-5" />}
                <span>
                  {clue === undefined ? "Pick a color or number" : "Give clue"}
                </span>
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
 * The place of a clue that the rules do not allow: an empty well, with no button in it. A button
 * stands on a lip, so the well sits where a pressed button would, to look centered between the
 * buttons.
 */
function EmptySlot(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={`tw:translate-y-[2px] ${choiceSizeClass} ${WELL_CLASS}`}
    />
  );
}

/**
 * How the content of the clue menu fades in as the menu slides out (`SLIDE`). It stays hidden while
 * the menu starts to move, so that its text does not slide past the hand's edge, and it is fully
 * shown when the menu stops.
 */
const CONTENT_FADE_IN = [
  { opacity: 0 },
  {
    opacity: 0,
    offset: 0.25,
  },
  { opacity: 1 },
] as const;

/** `CONTENT_FADE_IN` played backward, as the menu slides back (`SLIDE_BACK`). */
const CONTENT_FADE_OUT = [
  { opacity: 1 },
  {
    opacity: 0,
    offset: 0.75,
  },
  { opacity: 0 },
] as const;

/**
 * How far the clue menu shows inside the hand's edge while it slides out of the hand, in CSS
 * pixels. Its cut is inside the hand, on the hand's own dark edge, not on the edge itself. When the
 * game screen is scaled, the edge falls between two pixels, and a cut there leaves a line of
 * half-clear pixels, through which the table shows.
 */
const JOINT_OVERLAP = 1;

/** How the clue menu looks before it slides out of the hand, behind the hand's edge. */
function getHiddenDrawer(menu: HTMLElement, side: DrawerSide): Keyframe {
  const { height, width } = measure(menu);
  return side === "right"
    ? {
        transform: `translateX(${-width}px)`,
        clipPath: `inset(0 0 0 ${width - JOINT_OVERLAP}px)`,
      }
    : {
        transform: `translateY(${-height}px)`,
        clipPath: `inset(${height - JOINT_OVERLAP}px 0 0 0)`,
      };
}

/** How the clue menu looks when it has slid out of the hand (see `JOINT_OVERLAP`). */
function getShownDrawer(side: DrawerSide): Keyframe & { clipPath: string } {
  return {
    transform: "none",
    clipPath:
      side === "right"
        ? `inset(0 0 0 ${-JOINT_OVERLAP}px)`
        : `inset(${-JOINT_OVERLAP}px 0 0 0)`,
  };
}

/**
 * The ring around the clue that the player chose in the menu. It is a layer of its own, so that it
 * fades in and out as the player changes the clue, as fast as a tooltip opens and closes.
 */
function ChoiceRing({
  pressed,
  className,
  reducedMotion,
}: {
  readonly pressed: boolean;

  /** The color of the ring, such as `tw:ring-clue`. */
  readonly className: string;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:ring-3 ${className}`}
      style={{
        opacity: pressed ? 1 : 0,
        transition: reducedMotion ? undefined : getOpacityTransition(pressed),
      }}
    />
  );
}

/**
 * A layer behind the cards of a hand that can show its clue menu. While the menu shows, the layer
 * gives the hand its color, and one outline goes around both. The layer has no outline and no round
 * corners on the side where the menu joins it: its right, or its bottom when the menu opens below
 * the hand. The menu is a drawer that opens out of the hand.
 *
 * The layer fades in and out with its opacity, as the menu slides. It fades out at an even pace, so
 * that it starts to change at once. Do not animate the hand's background color instead:
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
  // Whether the layer shows, or still fades out.
  const [visible, setVisible] = useState(shown);
  if (shown && !visible) {
    setVisible(true);
  } else if (!shown && visible && reducedMotion) {
    setVisible(false);
  }

  return (
    <>
      {/* While the layer shows or fades, a line in the panel's color covers the hand's own outline
          where the menu joins the hand. It does not fade. Otherwise, the outline would show as a
          light line next to the solid menu, until the layer covers it. */}
      {visible && (
        <span
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-y-px tw:right-0 tw:w-px tw:bg-game-panel tw:[:has(>[data-clue-drawer=below])>&]:inset-x-px tw:[:has(>[data-clue-drawer=below])>&]:top-auto tw:[:has(>[data-clue-drawer=below])>&]:bottom-0 tw:[:has(>[data-clue-drawer=below])>&]:h-px tw:[:has(>[data-clue-drawer=below])>&]:w-auto"
        />
      )}
      <div
        aria-hidden="true"
        className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-l-game-panel tw:bg-game-panel tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line)] tw:[:has(>[data-clue-drawer=below])>&]:rounded-tr-game-panel tw:[:has(>[data-clue-drawer=below])>&]:rounded-bl-none tw:[:has(>[data-clue-drawer=below])>&]:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line)]"
        onTransitionEnd={(event) => {
          if (!shown && event.propertyName === "opacity") {
            setVisible(false);
          }
        }}
        style={{
          opacity: shown ? 1 : 0,
          transition: reducedMotion
            ? undefined
            : `opacity ${SLIDE.duration}ms ${shown ? SLIDE.easing : "linear"}`,
        }}
      />
    </>
  );
}

/** The width and height of a clue button, in CSS pixels. */
const CLUE_BUTTON_SIZE = {
  WIDE: 56,
  PHONE: 40,
} as const;

/** The space between a player's name and their clue button in the name column, in CSS pixels. */
const CLUE_BUTTON_NAME_GAP = 8;

/**
 * The height that the clue button takes in the name column, below the name, in the phone layout
 * with the names beside the cards. Every hand keeps it, so that the names line up and do not move
 * when the buttons show.
 */
export const CLUE_BUTTON_COLUMN_HEIGHT =
  CLUE_BUTTON_SIZE.PHONE + CLUE_BUTTON_NAME_GAP;

/**
 * The width that the clue button takes in the name column, to the right of the name, when the cards
 * are too short for it below the name. Every hand keeps it, so that the names line up and do not
 * move when the buttons show.
 */
export const CLUE_BUTTON_COLUMN_WIDTH =
  CLUE_BUTTON_SIZE.PHONE + CLUE_BUTTON_NAME_GAP;

/**
 * Where a clue button sits: to the right of the hand, below the middle of the hand when its menu
 * opens below it, in the name column below the name or to the right of it, or at the right end of
 * the name's row above the cards, as tall as the name.
 */
export type ClueButtonPlacement =
  "right" | "belowHand" | "belowName" | "besideName" | "nameRow";

const CLUE_BUTTON_PLACEMENT_CLASS = {
  right:
    "tw:absolute tw:z-20 tw:inset-y-0 tw:left-full tw:flex tw:items-center tw:pl-2.5",
  belowHand:
    "tw:absolute tw:z-20 tw:inset-x-0 tw:top-full tw:flex tw:justify-center tw:pt-2.5",
  belowName: "tw:absolute tw:z-20 tw:inset-0 tw:flex tw:items-end",
  besideName:
    "tw:absolute tw:z-20 tw:inset-y-0 tw:right-0 tw:flex tw:items-center",
  nameRow: "tw:absolute tw:z-20 tw:inset-0",
} as const satisfies Record<ClueButtonPlacement, string>;

/**
 * The button that opens the clue menu of a player. It shows beside their hand while the viewer can
 * clue them, in the room to the right of the hand that the hands leave for the menu (see
 * `getClueDrawerWidth`). When the menu opens below the hand instead (see `clueDrawerFitsBelow`), it
 * sits below the middle of the hand, where the menu comes out. In the phone layout, there is no
 * room to the right of the hand. With the name beside the cards, it sits in the name column, below
 * the name, or to the right of the name when the cards are too short for it below. With the name
 * above the cards, it sits at the right end of the name's row, as tall as the name. It is dim, so
 * that the buttons of all the hands do not compete with the cards, and bright while the pointer is
 * over it. It fades in when it appears, such as when the viewer's turn starts, and fades out when
 * it goes, such as when its menu opens.
 */
export function ClueButton({
  name,
  placement,
  reducedMotion,
  onOpen,
}: {
  readonly name: string;
  readonly placement: ClueButtonPlacement;
  readonly reducedMotion: boolean;
  readonly onOpen: () => void;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFade(ref, reducedMotion);
  // In the name's row, the button fills the room that the row keeps for it (see "Hands.tsx").
  const wide = placement === "right" || placement === "belowHand";
  let size: number | string = CLUE_BUTTON_SIZE.PHONE;
  if (wide) {
    size = CLUE_BUTTON_SIZE.WIDE;
  } else if (placement === "nameRow") {
    size = "100%";
  }
  let iconClass = "tw:size-7";
  if (wide) {
    iconClass = "tw:size-10";
  } else if (placement === "nameRow") {
    iconClass = "tw:size-[75%]";
  }

  return (
    <div
      className={CLUE_BUTTON_PLACEMENT_CLASS[placement]}
      data-clue-button
      ref={ref}
    >
      {/* The dimming is on a layer of its own, because the button's press sets its own transition. */}
      <div
        className={`tw:opacity-60 tw:transition-opacity tw:hover:opacity-100 ${placement === "nameRow" ? "tw:size-full" : ""} ${HOVER_CLASS}`}
      >
        <button
          aria-label={`Give ${name} a clue`}
          className={`tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-clue tw:text-card-ink ${RAISED_BUTTON_CLASS}`}
          onClick={onOpen}
          ref={tooltipRef(`Give ${name} a clue`)}
          style={{
            width: size,
            height: size,
          }}
          type="button"
        >
          <ClueTokenIcon className={iconClass} />
        </button>
      </div>
    </div>
  );
}
