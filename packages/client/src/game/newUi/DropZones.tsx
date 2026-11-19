import type { CardOrder } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ZoneState } from "./SharedCards.tsx";
import { getOpacityTransition } from "./motion.ts";
import { measure } from "./screenScale.ts";
import { DROP_ZONE_CLASS, WELL_SHADOW_CLASS } from "./surfaces.ts";

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

const ZONE_BOX_CLASS = "tw:pointer-events-none tw:absolute";

/** The column beside the discard box, which must be in front of it. */
export const DISCARD_COLUMN_CLASS = "tw:z-2";

/** The space between each box and the hands, in CSS pixels. A card dropped there goes back. */
const HANDS_MARGIN = 16;

/**
 * The ring of the box under the held card, in the color of clues. It is a layer of its own, so that
 * it fades in and out as the card moves between the boxes. The shadow of the box's top edge falls
 * on it. At max clues, only the discard pile itself has the dashed border.
 */
function ZoneLayers({
  state,
  reducedMotion,
}: {
  readonly state: ZoneState;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const shown = state === "hovered";
  return (
    <>
      <span
        className="tw:absolute tw:inset-0 tw:rounded-[inherit] tw:inset-ring-3 tw:inset-ring-clue"
        style={{
          opacity: shown ? 1 : 0,
          transition: reducedMotion ? undefined : getOpacityTransition(shown),
        }}
      />
      <span
        className={`tw:absolute tw:inset-0 tw:rounded-[inherit] ${WELL_SHADOW_CLASS}`}
      />
    </>
  );
}

/** Where a box is in the area, in CSS pixels. */
interface ZoneBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface ZoneBoxes {
  readonly play: ZoneBox;
  readonly discard: ZoneBox;
}

/**
 * The two dark boxes that show while the player drags a card: everything to the left of the hands
 * plays the card, and everything to the right discards it, including the chat. In the phone layout,
 * where the columns stack, everything above the hand of the card plays it, and everything below
 * discards it. A player who aims for the play stacks or the discard pile and misses still gets the
 * move that they meant. Each box is the area where a drop counts (see "useCardDrag.ts"), so the
 * player sees exactly where the card can go. The space between a box and the hands, and the hands,
 * put the card back. The boxes fade in and out, except with "Reduced motion".
 *
 * The boxes are behind the columns, from the top of the screen to the bar at the bottom. They need
 * a positioned parent that holds the columns and the chat, and they come before the columns, which
 * are positioned too. The discard box is in front of the chat, and the column beside it must be in
 * front of the discard box (see "DISCARD_COLUMN_CLASS"). When the chat covers the table, the
 * discard box is in front of it too.
 */
export function DropZones({
  handsElement,
  heldCard,
  phoneLayout,
  playState,
  discardState,
  reducedMotion,
  playZoneRef,
  discardZoneRef,
  chatCoversTable,
}: {
  readonly handsElement: HTMLElement | null;
  /** The card that the player drags. */
  readonly heldCard: CardOrder | undefined;
  /** Whether the screen has the phone layout, where the columns stack. */
  readonly phoneLayout: boolean;
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
    if (!dragging) {
      if (reducedMotion) {
        setBoxes(undefined);
      }
      return undefined;
    }

    // The screen can change size during a drag, such as when a phone turns.
    function update() {
      setBoxes(
        measureBoxes(areaRef.current, handsElement, heldCard, phoneLayout),
      );
    }
    update();
    const observer = new ResizeObserver(update);
    if (areaRef.current !== null) {
      observer.observe(areaRef.current);
    }
    if (handsElement !== null) {
      observer.observe(handsElement);
    }
    return () => {
      observer.disconnect();
    };
  }, [dragging, handsElement, heldCard, phoneLayout, reducedMotion]);

  if (boxes === undefined) {
    return <div className={ZONE_AREA_CLASS} ref={areaRef} />;
  }

  // In the phone layout, the discard box is behind the other hands and the discard pile, as the
  // play box is behind the play stacks.
  let discardLayerClass = phoneLayout ? "" : "tw:z-1";
  if (chatCoversTable) {
    discardLayerClass = "tw:z-30";
  }
  const discardBoxClass = `${discardLayerClass} ${phoneLayout ? "tw:rounded-t-game-panel" : "tw:rounded-l-game-panel"}`;

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
        className={`${ZONE_BOX_CLASS} ${phoneLayout ? "tw:rounded-b-game-panel" : "tw:rounded-r-game-panel"} ${DROP_ZONE_CLASS} ${fadeClass}`}
        onTransitionEnd={(event) => {
          if (!dragging && event.target === event.currentTarget) {
            setBoxes(undefined);
          }
        }}
        ref={zoneRef(playZoneRef)}
        style={{
          ...boxes.play,
          ...fadeStyle,
        }}
      >
        <ZoneLayers reducedMotion={reducedMotion} state={playState} />
      </div>
      <div
        aria-hidden="true"
        className={`${ZONE_BOX_CLASS} ${discardBoxClass} ${DROP_ZONE_CLASS} ${fadeClass}`}
        ref={zoneRef(discardZoneRef)}
        style={{
          ...boxes.discard,
          ...fadeStyle,
        }}
      >
        <ZoneLayers reducedMotion={reducedMotion} state={discardState} />
      </div>
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

/**
 * Splits the area at the boxes of the hands, not at the space for the clue rail beside them. In the
 * phone layout, it splits the area above and below the hand of the held card instead. The last card
 * of the deck is in no hand, so the area splits at the first hand.
 */
function measureBoxes(
  area: HTMLElement | null,
  handsElement: HTMLElement | null,
  heldCard: CardOrder | undefined,
  phoneLayout: boolean,
): ZoneBoxes | undefined {
  if (area === null || handsElement === null) {
    return undefined;
  }

  const handElements = [...handsElement.querySelectorAll("[data-hand]")];
  if (handElements.length === 0) {
    return undefined;
  }
  const areaRect = measure(area);
  const width = area.clientWidth;
  const height = area.clientHeight;

  if (phoneLayout) {
    const heldHand = handElements.find((hand) =>
      [...hand.querySelectorAll<HTMLElement>("[data-card-order]")].some(
        (card) => card.dataset["cardOrder"] === String(heldCard),
      ),
    );
    const hand = measure(heldHand ?? handElements[0]!);
    const discardTop = hand.bottom - areaRect.top + HANDS_MARGIN;
    return {
      play: {
        left: 0,
        top: 0,
        width,
        height: Math.max(hand.top - areaRect.top - HANDS_MARGIN, 0),
      },
      discard: {
        left: 0,
        top: discardTop,
        width,
        height: Math.max(height - discardTop, 0),
      },
    };
  }

  const hands = handElements.map((hand) => measure(hand));
  const handsLeft = Math.min(...hands.map((hand) => hand.left)) - areaRect.left;
  const handsRight =
    Math.max(...hands.map((hand) => hand.right)) - areaRect.left;
  const discardLeft = handsRight + HANDS_MARGIN;
  return {
    play: {
      left: 0,
      top: 0,
      width: Math.max(handsLeft - HANDS_MARGIN, 0),
      height,
    },
    discard: {
      left: discardLeft,
      top: 0,
      width: Math.max(width - discardLeft, 0),
      height,
    },
  };
}
