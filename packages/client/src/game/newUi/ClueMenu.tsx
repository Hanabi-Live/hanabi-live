import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { ColorSymbolView, getRankClueLabel } from "./Card.tsx";
import { getColorSymbol } from "./clueMarkers.ts";
import { onEscapeKey } from "./escapeKey.ts";
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
   * it. Otherwise, it opens to the right of the hand, so that it does not cover the other hands.
   */
  readonly below: boolean;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  return a?.type === "color" && b.type === "color"
    ? a.value.name === b.value.name
    : a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

/**
 * A hand that has its clue menu open. The menu is a drawer that opens out of the hand, so the hand
 * has the menu's color, and one outline goes around both. The hand has no outline and no round
 * corners on the side where the menu opens.
 */
export const CLUE_DRAWER_HAND_CLASS =
  "tw:bg-game-panel tw:rounded-b-none tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line)] tw:has-[>[data-clue-drawer=right]]:rounded-r-none tw:has-[>[data-clue-drawer=right]]:rounded-l-game-panel tw:has-[>[data-clue-drawer=right]]:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line)]";

/** The radius of the drawer's corners, in CSS pixels (`tw:rounded-game-panel`). */
const DRAWER_RADIUS = 8;

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
  "tw:left-full tw:w-max tw:rounded-r-game-panel tw:[box-shadow:inset_0_0_0_1px_var(--game-screen-line),12px_16px_20px_-10px_rgb(0_0_0/55%)]";

/** The width and height of a clue choice, in CSS pixels (`tw:size-11`). */
const CHOICE_SIZE = 44;

const choiceSizeClass = "tw:size-11 tw:rounded-game-control";

const choiceClass = `tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:text-lg tw:font-extrabold ${choiceSizeClass} ${KEY_CLASS}`;

/**
 * The clues that the viewer can give a player. Clicking the player's name opens it out of their
 * hand, as a drawer (see `CLUE_DRAWER_HAND_CLASS`). It opens to the right of the hand, so that it
 * does not cover the other hands. It starts at the top of the hand, and moves up only as far as it
 * must to fit beside the hands. In the phone layout, or when the window is too narrow, it opens
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
  const colorClues = variant.clueColors.map((color) => newColorClue(color));
  const rankClues = variant.clueRanks.map((rank) => newRankClue(rank));
  // Where the drawer is for the player whose menu this is, in this layout: whether it is below the
  // hand, the distance from the top of the hand to the top of the drawer, and the heights of both.
  // It is undefined until it is measured.
  const [placement, setPlacement] = useState<{
    readonly name: string;
    readonly phoneLayout: boolean;
    readonly below: boolean;
    readonly top: number;
    readonly height: number;
    readonly handHeight: number;
  }>();
  const measured =
    placement?.name === name && placement.phoneLayout === below
      ? placement
      : undefined;
  const opensBelow = below || measured?.below === true;

  // It measures the drawer to the right of the hand. When the window is too narrow for that, the
  // drawer opens below the hand instead.
  useLayoutEffect(() => {
    const menu = ref.current!;
    const hand = menu.parentElement!;
    // It stays beside the hands, so that it does not cover the bar below the table.
    const room = hand.parentElement!;
    const handRect = hand.getBoundingClientRect();
    const roomRect = room.getBoundingClientRect();
    const { height, width } = menu.getBoundingClientRect();
    const fitsRight =
      handRect.right + width <= document.documentElement.clientWidth;
    setPlacement({
      name,
      phoneLayout: below,
      below: below || !fitsRight,
      top: Math.max(
        roomRect.top - handRect.top,
        Math.min(0, roomRect.bottom - handRect.top - height),
      ),
      height,
      handHeight: handRect.height,
    });
  }, [name, below]);

  // The drawer slides out from behind the edge of the hand, and the part that is still behind the
  // hand is cut off. The sliding only decorates.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (measured === undefined || reducedMotion || menu === null) {
      return undefined;
    }
    const { height, width } = menu.getBoundingClientRect();
    const animation = menu.animate(
      [
        measured.below
          ? {
              transform: `translateY(${-height}px)`,
              clipPath: `inset(${height}px 0 0 0)`,
            }
          : {
              transform: `translateX(${-width}px)`,
              clipPath: `inset(0 0 0 ${width}px)`,
            },
        {
          transform: "none",
          clipPath: "inset(0 0 0 0)",
        },
      ],
      {
        duration: 200,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [measured, reducedMotion]);

  // On a narrow window, the page scrolls, so it scrolls to show all of the menu. It waits until the
  // drawer is in its place, and until the drawer has slid out, because the drawer is not in its
  // place while it slides, and the page would not scroll far enough.
  useEffect(() => {
    const menu = ref.current;
    if (measured === undefined || openedItself || menu === null) {
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
  }, [measured, openedItself]);

  useEffect(() => {
    if (!openedItself) {
      ref.current?.focus({ preventScroll: true });
    }
    const stopEscape = onEscapeKey(onClose);

    // A click on a name chooses that player instead, so it does not close the menu.
    function onPointerDown(event: PointerEvent) {
      const { target } = event;
      const menu = ref.current;
      if (
        menu !== null
        && target instanceof Node
        && !menu.contains(target)
        && !(target instanceof Element && target.closest("[data-name-chip]"))
      ) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      stopEscape();
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, openedItself]);

  // The corners where the drawer joins the hand are square. A corner of the drawer that reaches
  // past the hand is round.
  const drawerTop = measured?.top ?? 0;
  const rightStyle: React.CSSProperties = {
    top: drawerTop,
    borderTopLeftRadius: drawerTop <= -DRAWER_RADIUS ? DRAWER_RADIUS : 0,
    borderBottomLeftRadius:
      measured !== undefined
      && drawerTop + measured.height >= measured.handHeight + DRAWER_RADIUS
        ? DRAWER_RADIUS
        : 0,
  };

  return (
    <div
      aria-label={`Give ${name} a clue`}
      className={`tw:absolute tw:z-30 tw:flex tw:flex-col tw:gap-2 tw:bg-game-panel tw:p-3 tw:outline-none ${
        opensBelow ? BELOW_CLASS : RIGHT_CLASS
      }`}
      data-clue-drawer={opensBelow ? "below" : "right"}
      ref={ref}
      role="dialog"
      style={opensBelow ? undefined : rightStyle}
      tabIndex={-1}
    >
      {!opensBelow && measured !== undefined && (
        // It covers the outline where the drawer joins the hand, but not the ends of the hand's own
        // outline.
        <span
          aria-hidden="true"
          className="tw:absolute tw:left-0 tw:w-px tw:bg-game-panel"
          style={{
            top: 1 - measured.top,
            height: measured.handHeight - 2,
          }}
        />
      )}
      <div className="tw:flex tw:items-center tw:gap-2">
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:pl-0.5 tw:text-[14px] tw:font-semibold tw:text-game-muted">
          Clue {name}
        </span>
        {/* The classic screen's flashlight. The brain beside a name already shows a hand as its player sees it now. */}
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
        className={`tw:-mx-2 tw:flex tw:gap-6 tw:overflow-x-clip tw:px-2 ${opensBelow ? "tw:flex-wrap" : "tw:flex-col tw:gap-4"}`}
      >
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
          <ClueRow>
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
          <ClueRow>
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
            className={`tw:min-h-11 tw:flex-1 tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-4 tw:text-[17px] tw:leading-tight tw:text-balance tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
            disabled={!canGive}
            onClick={onGive}
            type="button"
          >
            {clue === undefined ? "Pick a color or number" : "Give clue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A row of clues. */
function ClueRow({
  children,
}: {
  readonly children: readonly React.JSX.Element[];
}): React.JSX.Element {
  return <div className="tw:flex tw:flex-wrap tw:gap-2">{children}</div>;
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
