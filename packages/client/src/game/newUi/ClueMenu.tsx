import type { Clue, Variant } from "@hanabi-live/game";
import { newColorClue, newRankClue } from "@hanabi-live/game";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tooltipRef } from "../../tooltipRef.ts";
import { getRankLabel } from "./Card.tsx";
import { KEY_CLASS } from "./surfaces.ts";

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
  readonly onShowActions: () => void;
  readonly onClose: () => void;
}

function isSameClue(a: Clue | undefined, b: Clue): boolean {
  if (a?.type === "color" && b.type === "color") {
    return a.value.name === b.value.name;
  }

  return a?.type === "rank" && b.type === "rank" && a.value === b.value;
}

/** The space between the menu and the hand, in CSS pixels. */
const MENU_GAP = 8;

/**
 * A clue is a key. A clue that the rules do not allow is an empty slot instead: it has no fill and
 * no lip, only a thin outline. The difference is in the shape, not in the color, so that a faded
 * color does not look like another color.
 */
const choiceClass = `tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:text-lg tw:font-extrabold tw:disabled:cursor-default tw:disabled:inset-ring-2 ${KEY_CLASS}`;

/**
 * The clues that the viewer can give a player. Clicking the player's name opens it on their hand.
 * It opens below the hand, so that the cards that the chosen clue would touch stay in view. When
 * there is no room below, it opens above. A clue that the rules do not allow, such as one that
 * touches no cards, is an empty slot. Clicking outside of it or pressing Escape closes it.
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
  onShowActions,
  onClose,
}: ClueMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);

  useLayoutEffect(() => {
    const menu = ref.current!;
    const hand = menu.parentElement!;
    const room = menu.closest("main") ?? document.documentElement;
    const handRect = hand.getBoundingClientRect();
    const roomRect = room.getBoundingClientRect();
    const { height } = menu.getBoundingClientRect();
    const fitsBelow = handRect.bottom + height <= roomRect.bottom;
    const fitsAbove = handRect.top - height >= roomRect.top;
    setAbove(!fitsBelow && fitsAbove);
  }, [name]);

  // On a narrow window, the page scrolls, so it scrolls to show all of the menu.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [name]);

  // The menu pops in, so that it reads as coming from the name. It only decorates.
  useLayoutEffect(() => {
    if (reducedMotion) {
      return undefined;
    }
    const animation = ref.current!.animate(
      [
        {
          opacity: 0,
          transform: "scale(0.96)",
        },
        {
          opacity: 1,
          transform: "scale(1)",
        },
      ],
      {
        duration: 120,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [name, reducedMotion]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    // A click on a name chooses that player instead, so it does not close the menu.
    function onPointerDown(event: PointerEvent) {
      const { target } = event;
      const menu = ref.current;
      if (
        target instanceof Node
        && menu !== null
        && !menu.contains(target)
        && !(target instanceof Element && target.closest("[data-name-chip]"))
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      aria-label={`Give ${name} a clue`}
      className={`tw:absolute tw:left-0 tw:z-30 tw:flex tw:w-max tw:max-w-full tw:flex-col tw:gap-2 tw:rounded-game-panel tw:bg-game-panel tw:p-3 tw:shadow-[0_8px_24px_rgb(0_0_0/45%)] tw:ring-1 tw:ring-game-line tw:outline-none ${
        above
          ? "tw:bottom-full tw:origin-bottom-left"
          : "tw:top-full tw:origin-top-left"
      }`}
      ref={ref}
      role="dialog"
      style={above ? { marginBottom: MENU_GAP } : { marginTop: MENU_GAP }}
      tabIndex={-1}
    >
      <div className="tw:flex tw:items-center tw:gap-2">
        <span className="tw:min-w-0 tw:flex-1 tw:truncate tw:pl-0.5 tw:text-[14px] tw:font-semibold tw:text-game-muted">
          Clue {name}
        </span>
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
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        {variant.clueColors.map((color) => {
          const colorClue = newColorClue(color);
          const pressed = isSameClue(clue, colorClue);
          return (
            <button
              aria-label={color.name}
              aria-pressed={pressed}
              className={`${choiceClass} tw:bg-(--clue-color) tw:disabled:bg-transparent tw:disabled:inset-ring-(--clue-color) ${pressed ? "tw:ring-3 tw:ring-game-text" : ""}`}
              disabled={!isAllowed(colorClue)}
              key={color.name}
              onClick={() => {
                onChooseClue(pressed ? undefined : colorClue);
              }}
              ref={tooltipRef(color.name)}
              style={
                {
                  "--clue-color": colorblindMode
                    ? color.fillColorblind
                    : color.fill,
                } as React.CSSProperties
              }
              type="button"
            />
          );
        })}
      </div>
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        {variant.clueRanks.map((rank) => {
          const rankClue = newRankClue(rank);
          const pressed = isSameClue(clue, rankClue);
          return (
            <button
              aria-pressed={pressed}
              className={`${choiceClass} tw:bg-game-text tw:text-card-ink tw:disabled:bg-transparent tw:disabled:text-game-muted/60 tw:disabled:inset-ring-game-line/60 ${pressed ? "tw:ring-3 tw:ring-clue" : ""}`}
              disabled={!isAllowed(rankClue)}
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
      </div>
      <button
        className={`tw:mt-1 tw:min-h-11 tw:cursor-pointer tw:rounded-game-control tw:border-0 tw:bg-clue tw:px-6 tw:text-[17px] tw:font-bold tw:text-card-ink tw:hover:brightness-110 tw:disabled:cursor-default tw:disabled:bg-transparent tw:disabled:font-semibold tw:disabled:text-game-muted tw:disabled:inset-ring-1 tw:disabled:inset-ring-game-line/50 tw:disabled:hover:brightness-100 ${KEY_CLASS}`}
        disabled={!canGive}
        onClick={onGive}
        type="button"
      >
        {clue === undefined ? "Pick a color or number" : "Give clue"}
      </button>
    </div>
  );
}
