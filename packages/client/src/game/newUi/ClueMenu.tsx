import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { getRankLabel } from "./Card.tsx";
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
  "tw:bg-game-panel tw:rounded-b-none tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line)] tw:has-[>[data-clue-drawer=above]]:rounded-t-none tw:has-[>[data-clue-drawer=above]]:rounded-b-game-panel tw:has-[>[data-clue-drawer=above]]:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line)]";

/**
 * The menu below the hand. It has no outline on its top, where it joins the hand, and its shadow
 * falls down.
 */
const BELOW_CLASS =
  "tw:top-full tw:origin-top tw:rounded-b-game-panel tw:pt-1 tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_-1px_0_var(--game-screen-line),0_16px_20px_-10px_rgb(0_0_0/55%)]";

/** The menu above the hand, the other way around. */
const ABOVE_CLASS =
  "tw:bottom-full tw:origin-bottom tw:rounded-t-game-panel tw:pb-1 tw:[box-shadow:inset_1px_0_0_var(--game-screen-line),inset_-1px_0_0_var(--game-screen-line),inset_0_1px_0_var(--game-screen-line),0_-16px_20px_-10px_rgb(0_0_0/55%)]";

const choiceSizeClass = "tw:size-11 tw:rounded-game-control";

const choiceClass = `tw:flex tw:cursor-pointer tw:items-center tw:justify-center tw:border-0 tw:text-lg tw:font-extrabold ${choiceSizeClass} ${KEY_CLASS}`;

/**
 * The clues that the viewer can give a player. Clicking the player's name opens it out of their
 * hand, as a drawer as wide as the hand (see `CLUE_DRAWER_HAND_CLASS`). It opens below the hand, so
 * that the cards that the chosen clue would touch stay in view. When there is no room below, it
 * opens above. A clue that the rules do not allow, such as one that touches no cards, leaves an
 * empty well in its place, so that every clue keeps its position. Clicking outside of it or
 * pressing Escape closes it.
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
}: ClueMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const colorClues = variant.clueColors.map((color) => newColorClue(color));
  const rankClues = variant.clueRanks.map((rank) => newRankClue(rank));
  const [above, setAbove] = useState(false);

  // The drawer opens below the hand, or above it when only that fits. It unfolds out of the hand,
  // from the edge that touches it. The unfolding only decorates.
  useLayoutEffect(() => {
    const menu = ref.current!;
    const hand = menu.parentElement!;
    const room = menu.closest("main") ?? document.documentElement;
    const handRect = hand.getBoundingClientRect();
    const roomRect = room.getBoundingClientRect();
    const { height } = menu.getBoundingClientRect();
    const fitsBelow = handRect.bottom + height <= roomRect.bottom;
    const fitsAbove = handRect.top - height >= roomRect.top;
    const opensAbove = !fitsBelow && fitsAbove;
    setAbove(opensAbove);

    if (reducedMotion) {
      return undefined;
    }
    const transformOrigin = opensAbove ? "bottom" : "top";
    const animation = menu.animate(
      [
        {
          opacity: 0,
          transform: "scaleY(0.6)",
          transformOrigin,
        },
        {
          opacity: 1,
          transform: "scaleY(1)",
          transformOrigin,
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
  }, [name, reducedMotion]);

  // On a narrow window, the page scrolls, so it scrolls to show all of the menu.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [name]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
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
  }, [onClose]);

  return (
    <div
      aria-label={`Give ${name} a clue`}
      className={`tw:absolute tw:inset-x-0 tw:z-30 tw:flex tw:flex-col tw:gap-2 tw:bg-game-panel tw:p-3 tw:outline-none ${
        above ? ABOVE_CLASS : BELOW_CLASS
      }`}
      data-clue-drawer={above ? "above" : "below"}
      ref={ref}
      role="dialog"
      tabIndex={-1}
    >
      <div className="tw:flex tw:items-center tw:gap-2">
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:pl-0.5 tw:text-[14px] tw:font-semibold tw:text-game-muted">
          Clue {name}
        </span>
        {/* Like the eye beside a name, which shows a hand as its player sees it now. */}
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
          <i aria-hidden="true" className="fas fa-eye" />
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
          When there is not enough room, it goes below them. */}
      <div className="tw:flex tw:flex-wrap tw:gap-3">
        <div className="tw:flex tw:min-w-0 tw:flex-col tw:gap-2">
          <ClueRow>
            {colorClues.map((colorClue) => {
              const color = colorClue.value;
              if (!isAllowed(colorClue)) {
                return <EmptySlot key={color.name} />;
              }
              const pressed = isSameClue(clue, colorClue);
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
                />
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
                  {getRankLabel(rank)}
                </button>
              );
            })}
          </ClueRow>
        </div>
        <button
          className={`tw:min-h-11 tw:min-w-[140px] tw:flex-1 tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-4 tw:text-[17px] tw:leading-tight tw:text-balance tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
          disabled={!canGive}
          onClick={onGive}
          type="button"
        >
          {clue === undefined ? "Pick a color or number" : "Give clue"}
        </button>
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
