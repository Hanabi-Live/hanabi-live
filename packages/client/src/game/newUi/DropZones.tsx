import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ZoneState } from "./SharedCards.tsx";
import { measure } from "./screenScale.ts";
import { DROP_ZONE_CLASS } from "./surfaces.ts";

/**
 * How long the boxes take to fade in when the player picks up a card, and to fade out when the drag
 * ends.
 */
export const DROP_ZONE_FADE_MILLISECONDS = 200;

/**
 * The area that the boxes split. It is not a stacking context, so that each box is in front of or
 * behind the other parts of the screen on its own.
 */
const ZONE_AREA_CLASS = "tw:pointer-events-none tw:absolute tw:inset-0";

const ZONE_BOX_CLASS = "tw:pointer-events-none tw:absolute tw:inset-y-0";

/** The column beside the discard box, which must be in front of it. */
export const DISCARD_COLUMN_CLASS = "tw:z-2";

/** The space between each box and the hands, in CSS pixels. A card dropped there goes back. */
const HANDS_MARGIN = 16;

/** The look of each box. The box under the held card has a ring in the color of clues. */
const zoneClasses: Record<ZoneState, string> = {
  idle: "",
  available: DROP_ZONE_CLASS,
  hovered: `${DROP_ZONE_CLASS} tw:inset-ring-3 tw:inset-ring-clue`,
  // At max clues, only the discard pile itself has the dashed border.
  unavailable: DROP_ZONE_CLASS,
  blocked: DROP_ZONE_CLASS,
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
 * plays the card, and everything to the right discards it, including the chat. A player who aims
 * for the play stacks or the discard pile and misses still gets the move that they meant. Each box
 * is the area where a drop counts (see "useCardDrag.ts"), so the player sees exactly where the card
 * can go. The space between a box and the hands, and the hands, put the card back. The boxes fade
 * in and out, except with "Reduced motion".
 *
 * The boxes are behind the columns, from the top of the screen to the bar at the bottom. They need
 * a positioned parent that holds the columns and the chat, and they come before the columns, which
 * are positioned too. The discard box is in front of the chat, and the column beside it must be in
 * front of the discard box (see "DISCARD_COLUMN_CLASS"). When the chat covers the table, the
 * discard box is in front of it too.
 */
export function DropZones({
  handsElement,
  playState,
  discardState,
  reducedMotion,
  playZoneRef,
  discardZoneRef,
  chatCoversTable,
}: {
  readonly handsElement: HTMLElement | null;
  readonly playState: ZoneState;
  readonly discardState: ZoneState;
  readonly reducedMotion: boolean;
  readonly playZoneRef: RefObject<HTMLElement | null>;
  readonly discardZoneRef: RefObject<HTMLElement | null>;
  /** Whether the open chat covers the table. */
  readonly chatCoversTable: boolean;
}): React.JSX.Element {
  const dragging = playState !== "idle";

  // The boxes stay while they fade out after the drag ends.
  const [boxes, setBoxes] = useState<ZoneBoxes>();
  const areaRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (dragging) {
      setBoxes(measureBoxes(areaRef.current, handsElement));
    } else if (reducedMotion) {
      setBoxes(undefined);
    }
  }, [dragging, handsElement, reducedMotion]);

  if (boxes === undefined) {
    return <div className={ZONE_AREA_CLASS} ref={areaRef} />;
  }

  // While the boxes fade out, neither has a ring.
  const fadeClass = reducedMotion
    ? ""
    : `tw:transition-opacity tw:ease-out tw:starting:opacity-0 ${dragging ? "" : "tw:opacity-0"}`;
  const fadeStyle = {
    transitionDuration: `${DROP_ZONE_FADE_MILLISECONDS}ms`,
  };

  return (
    <div className={ZONE_AREA_CLASS} ref={areaRef}>
      <div
        aria-hidden="true"
        className={`${ZONE_BOX_CLASS} tw:rounded-r-game-panel ${dragging ? zoneClasses[playState] : DROP_ZONE_CLASS} ${fadeClass}`}
        onTransitionEnd={() => {
          if (!dragging) {
            setBoxes(undefined);
          }
        }}
        ref={zoneRef(playZoneRef)}
        style={{
          ...boxes.play,
          ...fadeStyle,
        }}
      />
      <div
        aria-hidden="true"
        className={`${ZONE_BOX_CLASS} ${chatCoversTable ? "tw:z-30" : "tw:z-1"} tw:rounded-l-game-panel ${dragging ? zoneClasses[discardState] : DROP_ZONE_CLASS} ${fadeClass}`}
        ref={zoneRef(discardZoneRef)}
        style={{
          ...boxes.discard,
          ...fadeStyle,
        }}
      />
    </div>
  );
}

/** Returns a callback ref that gives a box to the drag, which drops the card where it is. */
function zoneRef(
  ref: RefObject<HTMLElement | null>,
): (element: HTMLElement | null) => () => void {
  return (element) => {
    ref.current = element;
    return () => {
      ref.current = null;
    };
  };
}

/** Splits the area at the boxes of the hands, not at the space for the clue rail beside them. */
function measureBoxes(
  area: HTMLElement | null,
  handsElement: HTMLElement | null,
): ZoneBoxes | undefined {
  if (area === null || handsElement === null) {
    return undefined;
  }

  const hands = [...handsElement.querySelectorAll("[data-hand]")].map((hand) =>
    measure(hand),
  );
  if (hands.length === 0) {
    return undefined;
  }
  const areaLeft = measure(area).left;
  const handsLeft = Math.min(...hands.map((hand) => hand.left)) - areaLeft;
  const handsRight = Math.max(...hands.map((hand) => hand.right)) - areaLeft;
  const discardLeft = handsRight + HANDS_MARGIN;
  return {
    play: {
      left: 0,
      width: Math.max(handsLeft - HANDS_MARGIN, 0),
    },
    discard: {
      left: discardLeft,
      width: Math.max(area.clientWidth - discardLeft, 0),
    },
  };
}
