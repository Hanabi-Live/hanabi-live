import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ZoneState } from "./SharedCards.tsx";
import { measure } from "./screenScale.ts";
import { DROP_ZONE_CLASS } from "./surfaces.ts";

/** How long the boxes take to fade in when the player picks up a card. */
const FADE_IN_MILLISECONDS = 100;

/** The space between each box and the hands, in CSS pixels. A card dropped there goes back. */
const HANDS_MARGIN = 16;

/** At max clues, the discard box has the dashed border of the discard pile. */
const REFUSING_CLASS = `${DROP_ZONE_CLASS} tw:outline-2 tw:-outline-offset-2 tw:outline-clue/60 tw:outline-dashed`;

/** The look of each box. The box under the held card has a ring in the color of clues. */
const zoneClasses: Record<ZoneState, string> = {
  idle: "",
  available: DROP_ZONE_CLASS,
  hovered: `${DROP_ZONE_CLASS} tw:inset-ring-3 tw:inset-ring-clue`,
  unavailable: REFUSING_CLASS,
  blocked: REFUSING_CLASS,
};

/** Where a box is in the screen's columns, in CSS pixels. */
interface ZoneBox {
  readonly left: number;
  readonly width: number;
}

interface ZoneBoxes {
  readonly play: ZoneBox;
  readonly discard: ZoneBox;
}

/**
 * The two dark boxes that show while the player drags a card: everything to the left of the hands
 * plays the card, and everything to the right discards it. A player who aims for the play stacks or
 * the discard pile and misses still gets the move that they meant. Each box is the area where a
 * drop counts (see "useCardDrag.ts"), so the player sees exactly where the card can go. The space
 * between a box and the hands, and the hands, put the card back.
 *
 * The boxes are behind the columns, from the top of the screen to the bar at the bottom. They need
 * a positioned parent that holds the hands, and they come before the columns, which are positioned
 * too.
 */
export function DropZones({
  handsElement,
  playState,
  discardState,
  reducedMotion,
  playZoneRef,
  discardZoneRef,
}: {
  readonly handsElement: HTMLElement | null;
  readonly playState: ZoneState;
  readonly discardState: ZoneState;
  readonly reducedMotion: boolean;
  readonly playZoneRef: RefObject<HTMLElement | null>;
  readonly discardZoneRef: RefObject<HTMLElement | null>;
}): React.JSX.Element | undefined {
  const dragging = playState !== "idle";
  const [boxes, setBoxes] = useState<ZoneBoxes>();
  useLayoutEffect(() => {
    if (!dragging) {
      setBoxes(undefined);
      return;
    }
    setBoxes(measureBoxes(handsElement));
  }, [dragging, handsElement]);

  if (!dragging || boxes === undefined) {
    return undefined;
  }

  return (
    <>
      <ZoneBoxElement
        box={boxes.play}
        className={`tw:rounded-r-game-panel ${zoneClasses[playState]}`}
        reducedMotion={reducedMotion}
        zoneRef={playZoneRef}
      />
      <ZoneBoxElement
        box={boxes.discard}
        className={`tw:rounded-l-game-panel ${zoneClasses[discardState]}`}
        reducedMotion={reducedMotion}
        zoneRef={discardZoneRef}
      />
    </>
  );
}

/**
 * Splits the parent of the hands at the boxes of the hands, not at the space for the clue rail
 * beside them.
 */
function measureBoxes(handsElement: HTMLElement | null): ZoneBoxes | undefined {
  const parent = handsElement?.offsetParent;
  if (
    handsElement === null
    || parent === null
    || parent === undefined
    || !(parent instanceof HTMLElement)
  ) {
    return undefined;
  }

  const hands = [...handsElement.querySelectorAll("[data-hand]")].map((hand) =>
    measure(hand),
  );
  if (hands.length === 0) {
    return undefined;
  }
  const parentLeft = measure(parent).left;
  const handsLeft = Math.min(...hands.map((hand) => hand.left)) - parentLeft;
  const handsRight = Math.max(...hands.map((hand) => hand.right)) - parentLeft;
  const discardLeft = handsRight + HANDS_MARGIN;
  return {
    play: {
      left: 0,
      width: Math.max(handsLeft - HANDS_MARGIN, 0),
    },
    discard: {
      left: discardLeft,
      width: Math.max(parent.clientWidth - discardLeft, 0),
    },
  };
}

function ZoneBoxElement({
  box,
  className,
  reducedMotion,
  zoneRef,
}: {
  readonly box: ZoneBox;
  readonly className: string;
  readonly reducedMotion: boolean;
  readonly zoneRef: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    zoneRef.current = ref.current;
    if (!reducedMotion) {
      ref.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_IN_MILLISECONDS,
        easing: "ease-out",
      });
    }
    return () => {
      zoneRef.current = null;
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`tw:pointer-events-none tw:absolute tw:inset-y-0 ${className}`}
      ref={ref}
      style={box}
    />
  );
}
