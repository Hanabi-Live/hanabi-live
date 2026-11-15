import type {
  ClueRank,
  Color,
  Rank,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import {
  EVEN_RANK_CLUE,
  START_CARD_RANK,
  StackDirection,
  getColorForPrismCard,
  getSuitAbbreviationForVariant,
  hasReversedSuits,
} from "@hanabi-live/game";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { START_CARD_RANK_LABEL } from "../../constants.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { getDeceptiveRank, getRankLabelFill } from "../rankLabelColors.ts";
import {
  ARROW_COLOR,
  CARD_FACE_SHADOW_BLUR,
  CARD_H,
  CARD_IMAGE_SHADOW_COLOR,
  CARD_W,
} from "../ui/constants.ts";
import { RANK_PATHS } from "../ui/drawStylizedRank.ts";
import { Pip } from "./Pip.tsx";
import { getScreenScale } from "./screenScale.ts";
import type {
  CardPipsView,
  NoteBorder,
  NoteMark,
  PossibleCardsView,
  RankPipView,
  SuitPipView,
} from "./tableView.ts";

/** Cards keep the proportions of the classic card images. */
export const CARD_HEIGHT_PER_WIDTH = CARD_H / CARD_W;

/**
 * How round the corners of a card face are, as a fraction of its width. The corners are tight, as
 * on a playing card, so that a card does not look like an app icon.
 */
export const CARD_CORNER_PER_WIDTH = 0.06;

/**
 * How opaque a trash card is. It fades more than on the classic screen (`CARD_FADE`), so that it
 * stands further apart from the cards that still matter.
 */
const TRASH_CARD_OPACITY = 0.4;

/** How far a clued card in a hand sits above the others, as a fraction of the card's width. */
export const CLUED_RAISE_PER_WIDTH = 0.12;

/**
 * The width of the outline around the rank in a card's corner, in the card's own units. Half of it
 * shows, because the fill covers the inner half. It is wider than the outline on a classic card's
 * rank, because New UI cards are smaller, and a thinner outline blurs into the fill.
 */
const RANK_OUTLINE_WIDTH = 8;

/**
 * The spread of the shadow under the rank in a card's corner, in the card's own units. It matches
 * the shadow on a classic card, whose canvas blur is twice the standard deviation of the blur.
 */
const RANK_SHADOW_DEVIATION = CARD_FACE_SHADOW_BLUR / 2;

/**
 * The size of the suit's pip on a card whose rank does not show, as a fraction of the card's width.
 * It is in the middle of the card.
 */
const SUIT_PIP_SIZE_PER_WIDTH = 0.5;

/**
 * A pip on a card's face, in fractions of the card's width from the middle of the space that the
 * pips fill.
 */
interface FacePip {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** Whether the pip is upside down, as on the bottom half of a playing card. */
  readonly turned: boolean;
}

/** The pips on the face of a 2. */
const RANK_2_PIP = {
  y: 0.2,
  size: 0.36,
} as const;

/** The pips at the top, bottom, and sides of a 3, 4, or 5. */
const OUTER_PIP = {
  offset: 0.29,
  sideOffset: 0.3,
  size: 0.28,
} as const;

/** The size of the pip in the middle of a 3 or a 5. */
const CENTER_PIP_SIZE = 0.3;

/**
 * The gap between the rank in the corner and the pips under it, as a fraction of a card's width.
 */
const RANK_PIP_GAP_PER_WIDTH = 0.03;

/** The one large pip in the middle of a 1, or of a card whose rank does not show. */
const SINGLE_PIP = {
  x: 0,
  y: 0,
  size: SUIT_PIP_SIZE_PER_WIDTH,
  turned: false,
} as const satisfies FacePip;

/**
 * The pips on a card of each rank: as many pips as the rank, in the pattern of the classic card
 * images, so that players can tell a rank from the pattern at a glance. Another rank, such as a
 * start card, has one pip. The pips fill the space under the rank in the corner, so the rank does
 * not show again, turned over, in the opposite corner.
 */
const RANK_PIP_LAYOUTS: ReadonlyMap<number, readonly FacePip[]> = (() => {
  const center: FacePip = {
    x: 0,
    y: 0,
    size: CENTER_PIP_SIZE,
    turned: false,
  };
  const top: FacePip = {
    x: 0,
    y: -OUTER_PIP.offset,
    size: OUTER_PIP.size,
    turned: false,
  };
  const bottom: FacePip = {
    ...top,
    y: OUTER_PIP.offset,
    turned: true,
  };
  const left: FacePip = {
    x: -OUTER_PIP.sideOffset,
    y: 0,
    size: OUTER_PIP.size,
    turned: false,
  };
  const right: FacePip = {
    ...left,
    x: OUTER_PIP.sideOffset,
    turned: true,
  };

  return new Map([
    [1, [SINGLE_PIP]],
    [
      2,
      [
        {
          x: 0,
          y: -RANK_2_PIP.y,
          size: RANK_2_PIP.size,
          turned: false,
        },
        {
          x: 0,
          y: RANK_2_PIP.y,
          size: RANK_2_PIP.size,
          turned: true,
        },
      ],
    ],
    [3, [top, center, bottom]],
    [4, [top, left, right, bottom]],
    [5, [top, left, center, right, bottom]],
  ]);
})();

/** The pips on a card's face, from its rank. */
function getFacePips(rank: Rank | undefined): readonly FacePip[] {
  return (
    (rank === undefined ? undefined : RANK_PIP_LAYOUTS.get(rank)) ?? [
      SINGLE_PIP,
    ]
  );
}

/**
 * How far the rank and the badges in the corners of a card are from its edges, as a fraction of its
 * width. It is the same from the side and from the top, so the corners look even.
 */
const CORNER_INSET_PER_WIDTH = 0.09;

/**
 * The box around every rank shape, relative to the origin of its path, in the card's own units. The
 * lowest shape, the 5, sets the bottom.
 */
const RANK_SHAPE_BOX = {
  left: -46,
  top: -113,
  bottom: -21,
} as const;

/** How far the rank's path moves to put its box, with the outline, in the card's corner. */
const RANK_CORNER_OFFSET = {
  x:
    CORNER_INSET_PER_WIDTH * CARD_W
    + RANK_OUTLINE_WIDTH / 2
    - RANK_SHAPE_BOX.left,
  y:
    CORNER_INSET_PER_WIDTH * CARD_W
    + RANK_OUTLINE_WIDTH / 2
    - RANK_SHAPE_BOX.top,
} as const;

/**
 * How far the bottom of the rank in a card's corner is from the card's top edge, as a fraction of
 * its width.
 */
export const RANK_BOTTOM_PER_WIDTH =
  (RANK_CORNER_OFFSET.y + RANK_SHAPE_BOX.bottom + RANK_OUTLINE_WIDTH / 2)
  / CARD_W;

/** The width of the border in the clue color around a clued card (`tw:ring-4`), in CSS pixels. */
export const CLUED_BORDER_WIDTH = 4;

/**
 * The width of the token that marks a card that a clue touched, as a fraction of the card's width.
 */
const CLUE_TOKEN_SIZE_PER_WIDTH = 0.46;

/** How much of the token is above the card's top edge. The rest overlaps the card. */
const CLUE_TOKEN_PART_ABOVE_CARD = 0.8;

/**
 * The size of the dot on a card that an earlier clue touched too, as a fraction of the full token.
 * The dot has no point, so that the pins of the cards that the clue touches for the first time
 * stand out.
 */
const CLUE_DOT_SCALE = 0.8;

/** How much of the dot is above the card's top edge. It sits on the edge. */
const CLUE_DOT_PART_ABOVE_CARD = 0.5;

/**
 * How far a clue token reaches above the place where its card rests in a hand, as a fraction of the
 * card's width. (A touched card is clued, so it is also raised.) A hand whose name sits above its
 * cards leaves this much room between them.
 */
export const CLUE_TOKEN_REACH_PER_WIDTH =
  CLUE_TOKEN_SIZE_PER_WIDTH * CLUE_TOKEN_PART_ABOVE_CARD
  + CLUED_RAISE_PER_WIDTH;

/**
 * The clue that a marker on a card shows: a color, a rank, or the animal of a clue that the viewer
 * may not see (in some variants).
 */
export type ClueMarkerView =
  | {
      readonly type: "color";
      readonly name: string;
      readonly fill: string;
      /** The symbol on the color in colorblind mode. */
      readonly symbol?: ColorSymbol;
    }
  | { readonly type: "rank"; readonly label: string }
  | {
      readonly type: "sound";
      readonly emoji: string;
      /**
       * The badge on the token's edge that says which type of clue the animal stands for: a mark,
       * such as "#" for "some number", or a fill, such as every color for "some color". The clue
       * log's discs are too small to show it.
       */
      readonly badge?: ClueBadgeView;
    };

/** The token of a clue on a card that the clue touched. */
export interface CardClueMarker {
  readonly marker: ClueMarkerView;

  /** Whether an earlier clue touched the card too. Then the token is a dot, without a point. */
  readonly touchedBefore: boolean;

  /**
   * Whether the viewer's note marks the card as chop moved, with the H-Group conventions setting. A
   * token that touches it for the first time has a gray ring, as the classic screen's arrow is
   * gray, so that the viewer sees that the clue may only confirm the chop move.
   */
  readonly chopMoved?: boolean;
}

/**
 * What colorblind mode shows on a clue color, as the classic screen does: the pip of the color's
 * suit, or the color's abbreviation in a dual-color variant, where a color stands for many suits.
 */
export type ColorSymbol =
  | { readonly type: "pip"; readonly suit: Suit; readonly variant: Variant }
  | { readonly type: "text"; readonly text: string };

/** How much of a clue token or button the abbreviation of a color fills. */
const COLOR_SYMBOL_PER_SIZE = 0.6;

/** How much of a clue token or button the pip of a color fills. */
const COLOR_PIP_PER_SIZE = 1.3;

/**
 * The symbol of a color, centered in a box `size` pixels wide. It is white with a dark border, so
 * that it shows on every color.
 */
export function ColorSymbolView({
  symbol,
  size,
}: {
  readonly symbol: ColorSymbol;
  readonly size: number;
}): React.JSX.Element {
  return symbol.type === "pip" ? (
    <Pip
      fill="white"
      shadow
      size={size * COLOR_PIP_PER_SIZE}
      suit={symbol.suit}
      variant={symbol.variant}
    />
  ) : (
    <span
      className="tw:block tw:font-extrabold tw:leading-none tw:text-white tw:[paint-order:stroke] tw:[-webkit-text-stroke:2px_black] tw:[text-box:trim-both_cap_alphabetic]"
      style={{ fontSize: size * COLOR_SYMBOL_PER_SIZE }}
    >
      {symbol.text}
    </span>
  );
}

/** What a badge on the edge of a clue token shows. */
type ClueBadgeView =
  | { readonly type: "mark"; readonly mark: string }
  | { readonly type: "fill"; readonly fill: string };

/** How much of a suit's color tints a card face. The rest is white. */
const FACE_TINT_PERCENT = 32;

/** How much of a suit's color is in the rank and the possible ranks. The rest is black. */
const INK_PERCENT = 72;

interface CardFaceProps {
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly suitIndex: SuitIndex | undefined;
  readonly rank: Rank | undefined;

  /** The width in CSS pixels. The height follows from it. */
  readonly width: number;

  readonly clued?: boolean;
  readonly critical?: boolean;
  readonly trash?: boolean;

  /** The border that a note gives a card that does not show as clued. */
  readonly noteBorder?: NoteBorder;

  /** The large mark that the viewer's note shows over the card. */
  readonly noteMark?: NoteMark;

  readonly trashIcon?: boolean;

  /** Whether the card has a note that the viewer can read. */
  readonly note?: boolean;

  /**
   * The card's notes, as HTML, which its bubble of possible cards shows above the grid. A card with
   * a bubble shows its notes there, instead of in a tooltip.
   */
  readonly noteHtml?: string;

  /** Whether someone else changed the note while we spectate, and we have not read it since. */
  readonly noteUnread?: boolean;

  /** Whether the note decides the suit or the rank that the card shows. */
  readonly identityFromNote?: boolean;

  /** Whether a clued card sits higher than the others, as it does in a hand. */
  readonly raiseClued?: boolean;

  /** Marks a card that the clue being chosen would touch. */
  readonly highlighted?: boolean;

  /** What the holder of the card knows about it, when they cannot see it. */
  readonly pips?: CardPipsView;

  /** Whether a "blank" note makes the card look like the back of a card. */
  readonly blank?: boolean;

  /** Whether the card shows the H-Group's question mark for a double discard. */
  readonly doubleDiscard?: boolean;

  /**
   * The direction of the play stack of the card's suit, for the arrow on the cards of a suit that
   * is played backward or in either direction. A reversed suit goes down when it is left out.
   */
  readonly stackDirection?: StackDirection;

  /** The clue that touched the card on the turn that shows, like the classic screen's arrows. */
  readonly clueMarker?: CardClueMarker;
}

/** The color that stands for a clue on the screen: its own color, or white for a rank. */
export function getClueMarkerColor(marker: ClueMarkerView): string {
  return marker.type === "color" ? marker.fill : "white";
}

/**
 * The size of the animal on a clue token or disc, per the token's width. It is smaller than a
 * number, since an emoji fills its whole box, and it must fit inside the white ring.
 */
export const CLUE_EMOJI_FONT_PER_SIZE = 0.55;

/**
 * The text on a clue token: the clue's number, the animal of a hidden clue, and none for a color.
 */
export function getClueMarkerLabel(marker: ClueMarkerView): string {
  switch (marker.type) {
    case "color": {
      return "";
    }

    case "rank": {
      return marker.label;
    }

    case "sound": {
      return marker.emoji;
    }
  }
}

/** The size of the badge on the edge of a clue token, per the token's width. */
const CLUE_BADGE_SIZE_PER_SIZE = 0.5;

/** A badge on the lower-right edge of a clue token: a light mark on dark ink, or a fill. */
function ClueBadge({
  badge,
  size,
}: {
  readonly badge: ClueBadgeView;
  readonly size: number;
}): React.JSX.Element {
  const badgeSize = size * CLUE_BADGE_SIZE_PER_SIZE;
  return (
    <span
      className="tw:absolute tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:border-2 tw:border-solid tw:border-white tw:bg-card-ink tw:font-black tw:leading-none tw:text-white"
      style={{
        right: -badgeSize * 0.3,
        bottom: -badgeSize * 0.15,
        width: badgeSize,
        height: badgeSize,
        fontSize: badgeSize * 0.75,
        ...(badge.type === "fill" && { background: badge.fill }),
      }}
    >
      {badge.type === "mark" && (
        <span className="tw:block tw:[text-box:trim-both_cap_alphabetic]">
          {badge.mark}
        </span>
      )}
    </span>
  );
}

/**
 * The shape of a clue token, in a box 100 units wide: a disc with a point under it. The sides of
 * the point touch the disc at a tangent, so that the outline runs smoothly from one to the other.
 */
const PIN_RADIUS = 50;
const PIN_TIP_Y = 120;
const PIN_PATH = (() => {
  const cos = PIN_RADIUS / (PIN_TIP_Y - PIN_RADIUS);
  const x = PIN_RADIUS * Math.sqrt(1 - cos * cos);
  const y = PIN_RADIUS + PIN_RADIUS * cos;
  return `M ${PIN_RADIUS} ${PIN_TIP_Y} L ${PIN_RADIUS - x} ${y} A ${PIN_RADIUS} ${PIN_RADIUS} 0 1 1 ${PIN_RADIUS + x} ${y} Z`;
})();

/** The shape of a clue token without a point: only the disc, in the same units. */
const DOT_PATH = `M 0 ${PIN_RADIUS} A ${PIN_RADIUS} ${PIN_RADIUS} 0 1 1 ${2 * PIN_RADIUS} ${PIN_RADIUS} A ${PIN_RADIUS} ${PIN_RADIUS} 0 1 1 0 ${PIN_RADIUS} Z`;

/** The radius of the disc in the clue's color, inside the white ring, in the same units. */
const PIN_DISC_RADIUS = 40;

/** The width of the dark outline around a clue token, in CSS pixels. */
const PIN_OUTLINE_WIDTH = 2;

/**
 * A token that sits on the top edge of a card that a clue touched, with a point toward the card. On
 * a card that an earlier clue touched too, it is a smaller dot without a point. The "data-"
 * attributes let it land on the card when the clue is given (see "cardMotion.ts").
 */
function ClueMarker({
  marker: { marker, touchedBefore, chopMoved = false },
  width,
}: {
  readonly marker: CardClueMarker;
  readonly width: number;
}): React.JSX.Element {
  const fullSize = getClueTokenSize(width);
  const size = touchedBefore ? Math.round(fullSize * CLUE_DOT_SCALE) : fullSize;
  const partAboveCard = touchedBefore
    ? CLUE_DOT_PART_ABOVE_CARD
    : CLUE_TOKEN_PART_ABOVE_CARD;

  return (
    <span
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:left-1/2 tw:z-10"
      data-clue-marker
      style={{
        top: -size * partAboveCard,
        marginLeft: -size / 2,
        width: size,
        height: size,
      }}
    >
      <ClueToken
        marker={marker}
        pointed={!touchedBefore}
        ringColor={
          chopMoved && !touchedBefore ? ARROW_COLOR.CM_TOUCHED : undefined
        }
        size={size}
      />
    </span>
  );
}

/** The width of a clue token for cards of a width, in CSS pixels. */
export function getClueTokenSize(cardWidth: number): number {
  return Math.round(cardWidth * CLUE_TOKEN_SIZE_PER_WIDTH);
}

/**
 * The inside of a clue token, which fills a positioned box `size` pixels square: a disc of the
 * clue's color, or a white disc with the clue's number. A `pointed` token has a point under it.
 */
export function ClueToken({
  marker,
  size,
  pointed = true,
  ringColor,
}: {
  readonly marker: ClueMarkerView;
  readonly size: number;
  readonly pointed?: boolean;
  /** The color of the ring around the clue's color, if not white. */
  readonly ringColor?: string;
}): React.JSX.Element {
  const label = getClueMarkerLabel(marker);
  const pinHeight = pointed ? PIN_TIP_Y : 2 * PIN_RADIUS;

  return (
    <>
      {/* One path for the whole outline, so that the disc and the point share it. The stroke is
          drawn first and is twice as wide, so the fill covers its inner half. */}
      <svg
        className="tw:absolute tw:top-0 tw:left-0 tw:overflow-visible tw:drop-shadow-[0_3px_8px_rgb(0_0_0/60%)]"
        height={(size * pinHeight) / (2 * PIN_RADIUS)}
        viewBox={`0 0 ${2 * PIN_RADIUS} ${pinHeight}`}
        width={size}
      >
        <path
          className="tw:fill-white tw:stroke-card-ink"
          d={pointed ? PIN_PATH : DOT_PATH}
          data-clue-ring={ringColor === undefined ? undefined : "chopMoved"}
          paintOrder="stroke"
          strokeWidth={2 * PIN_OUTLINE_WIDTH}
          style={ringColor === undefined ? undefined : { fill: ringColor }}
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={PIN_RADIUS}
          cy={PIN_RADIUS}
          r={PIN_DISC_RADIUS}
          style={{ fill: getClueMarkerColor(marker) }}
        />
      </svg>
      <span
        className="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:font-extrabold tw:leading-none tw:text-card-ink"
        style={{
          fontSize:
            size * (marker.type === "sound" ? CLUE_EMOJI_FONT_PER_SIZE : 0.66),
        }}
      >
        {label}
        {marker.type === "color" && marker.symbol !== undefined && (
          <ColorSymbolView
            size={(size * PIN_DISC_RADIUS) / PIN_RADIUS}
            symbol={marker.symbol}
          />
        )}
      </span>
      {marker.type === "sound" && marker.badge !== undefined && (
        <ClueBadge badge={marker.badge} size={size} />
      )}
    </>
  );
}

/** What a badge in the bottom-left corner of a card stands for. */
type CardStatusBadge = "critical" | "trash" | "doubleDiscard";

/** What each badge in the corner of a card shows and means, in the site's tooltip style. */
const STATUS_BADGES = {
  critical: {
    label: "Last copy",
    tooltip: "The last copy of this card. Do not discard it.",
    className: "tw:bg-critical tw:text-white",
  },
  trash: {
    label: "Trash",
    tooltip: "Known trash. This card can never be played.",
    className: "tw:bg-game-line tw:text-white",
  },
  doubleDiscard: {
    label: "Double discard",
    tooltip:
      "Double discard: this card could be the other copy of the card that was just discarded.",
    className: "tw:bg-double-discard tw:text-card-ink",
  },
} as const satisfies Record<
  CardStatusBadge,
  { label: string; tooltip: string; className: string }
>;

/** The size of a badge in the corner of a card, per card width. */
const BADGE_SIZE_PER_WIDTH = 0.2;

/** The size of the mark in a badge, such as the exclamation mark, per badge size. */
const BADGE_FONT_PER_SIZE = 0.73;

/** The style of a round badge in a corner of a card. */
function getBadgeStyle(
  width: number,
  corner: "topRight" | "topLeft" | "bottomLeft",
): React.CSSProperties {
  const inset = width * CORNER_INSET_PER_WIDTH;
  return {
    ...{
      topRight: {
        right: inset,
        top: inset,
      },
      topLeft: {
        left: inset,
        top: inset,
      },
      bottomLeft: {
        left: inset,
        bottom: inset,
      },
    }[corner],
    width: width * BADGE_SIZE_PER_WIDTH,
    height: width * BADGE_SIZE_PER_WIDTH,
    fontSize: width * BADGE_SIZE_PER_WIDTH * BADGE_FONT_PER_SIZE,
  };
}

/**
 * The badge in the bottom-left corner of a card, as on the classic screen. A red badge with an
 * exclamation mark shows the last copy of a card that is still needed. A gray badge with a trash
 * can shows a card that is known to be trash. With the H-Group conventions setting, a cyan badge
 * with a question mark shows a card that the next discard could lose (see `CardView`).
 */
function StatusBadge({
  badge,
  width,
}: {
  readonly badge: CardStatusBadge;
  readonly width: number;
}): React.JSX.Element {
  const { label, tooltip, className } = STATUS_BADGES[badge];
  return (
    <span
      aria-label={label}
      className={`tw:absolute tw:flex tw:items-center tw:justify-center tw:rounded-full tw:font-extrabold ${className}`}
      // The badge is on a card that people click, so its tooltip waits like the card's buttons.
      ref={tooltipRef(tooltip)}
      role="img"
      style={{
        ...getBadgeStyle(width, "bottomLeft"),
        boxShadow: "0 0 0 1.5px white",
      }}
    >
      {badge === "critical" && <ExclamationMark />}
      {badge === "trash" && (
        <i aria-hidden="true" className="fas fa-trash-alt" />
      )}
      {badge === "doubleDiscard" && (
        <i aria-hidden="true" className="fas fa-question" />
      )}
    </span>
  );
}

/** The badge that a card shows in its bottom-left corner, if any. */
function getStatusBadge(
  critical: boolean,
  trashIcon: boolean,
  doubleDiscard: boolean,
): CardStatusBadge | undefined {
  if (critical) {
    return "critical";
  }
  if (trashIcon) {
    return "trash";
  }
  return doubleDiscard ? "doubleDiscard" : undefined;
}

/**
 * The exclamation mark in the badge of a critical card, in the badge's box of 100 units. It is
 * drawn rather than typed, so that a wide gap keeps the dot apart from the bar, as on the classic
 * screen. Otherwise, the mark looks like a line on a small card.
 */
const EXCLAMATION_MARK = {
  barTop: 17,
  barBottom: 55,
  barTopHalfWidth: 9,
  barBottomHalfWidth: 6,
  dotY: 77,
  dotRadius: 9,
} as const;

function ExclamationMark(): React.JSX.Element {
  const {
    barTop,
    barBottom,
    barTopHalfWidth,
    barBottomHalfWidth,
    dotY,
    dotRadius,
  } = EXCLAMATION_MARK;
  return (
    <svg aria-hidden="true" className="tw:size-full" viewBox="0 0 100 100">
      {/* A bar that narrows toward the dot. A thin stroke rounds its corners. */}
      <path
        className="tw:fill-white tw:stroke-white"
        d={`M ${50 - barTopHalfWidth} ${barTop} H ${50 + barTopHalfWidth} L ${50 + barBottomHalfWidth} ${barBottom} H ${50 - barBottomHalfWidth} Z`}
        strokeLinejoin="round"
        strokeWidth={4}
      />
      <circle className="tw:fill-white" cx={50} cy={dotY} r={dotRadius} />
    </svg>
  );
}

/** The size of the mark over a card from a note, such as a trash can, per card width. */
const NOTE_MARK_SIZE_PER_WIDTH = 0.7;

/** How opaque the mark over a card is, so that the possibilities under it stay readable. */
const NOTE_MARK_OPACITY = 0.6;

/**
 * The icon and the description of each mark from a note. The trash can is the same icon as the one
 * on the discard pile.
 */
const NOTE_MARK_ICONS = {
  trash: {
    icon: "fa-trash-alt",
    label: "Marked as trash",
  },
  fix: {
    icon: "fa-wrench",
    label: "Marked as needing a fix",
  },
  spook: {
    icon: "fa-ghost",
    label: "Marked as spooked",
  },
  exclamationMark: {
    icon: "fa-exclamation",
    label: "Marked with !",
  },
  questionMark: {
    icon: "fa-question",
    label: "Marked with ?",
  },
} as const satisfies Record<NoteMark, { icon: string; label: string }>;

/**
 * A large mark over a card from a keyword in the viewer's note, such as a trash can for "kt", as on
 * the classic screen. It covers the possibilities, so that the mark is never hidden.
 */
function NoteMarkIcon({
  mark,
  width,
}: {
  readonly mark: NoteMark;
  readonly width: number;
}): React.JSX.Element {
  const { icon, label } = NOTE_MARK_ICONS[mark];
  return (
    <i
      aria-label={label}
      className={`fas ${icon} tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-1/2 tw:text-card-ink`}
      role="img"
      style={{
        fontSize: width * NOTE_MARK_SIZE_PER_WIDTH,
        opacity: NOTE_MARK_OPACITY,
      }}
    />
  );
}

/** The radius of the dot on an unread note, in the note's box of 100 units. */
const NOTE_UNREAD_DOT_RADIUS = 26;

/** How far the sticky note on a card with a note turns, so that it looks stuck on by hand. */
const NOTE_TILT_DEGREES = 8;

/**
 * A sticky note on the top-right corner of a card that has a note, where the classic screen shows
 * its note icon. It is a slip of paper with a folded corner and a few lines of writing. When the
 * note decides what the card shows, a pencil lies across it, as on the classic screen. A dot on its
 * corner shows a spectator a note that changed since they last read it. The card itself shows the
 * note on hover, so the slip has no tooltip of its own.
 */
function NoteBadge({
  width,
  pencil,
  unread,
}: {
  readonly width: number;
  readonly pencil: boolean;
  readonly unread: boolean;
}): React.JSX.Element {
  const size = width * BADGE_SIZE_PER_WIDTH;
  return (
    <svg
      aria-label="Note"
      className="tw:pointer-events-none tw:absolute tw:overflow-visible tw:drop-shadow-[0_1px_2px_rgb(0_0_0/45%)]"
      height={size}
      role="img"
      style={{
        ...getBadgeStyle(width, "topRight"),
        transform: `rotate(${NOTE_TILT_DEGREES}deg)`,
      }}
      viewBox="0 0 100 100"
      width={size}
    >
      {/* The paper, without the corner that is folded under. */}
      <path
        className="tw:fill-card-note tw:stroke-card-ink"
        d="M 6 6 H 94 V 68 L 68 94 H 6 Z"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* The back of the folded corner. */}
      <path
        className="tw:fill-card-note-fold tw:stroke-card-ink"
        d="M 94 68 L 68 68 L 68 94 Z"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* The writing. The last line stops before the fold. */}
      <path
        className="tw:stroke-card-ink/60"
        d="M 22 28 H 78 M 22 46 H 72 M 22 64 H 52"
        strokeLinecap="round"
        strokeWidth={9}
      />
      {pencil && <Pencil />}
      {/* A spectator has not read the note since it changed. The dot has the color of the chat's
          count of unread messages. */}
      {unread && (
        <circle
          className="tw:fill-clue tw:stroke-card-ink"
          cx={94}
          cy={6}
          data-note-unread
          r={NOTE_UNREAD_DOT_RADIUS}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/**
 * The outline of a pencil that lies along the x axis, with its point at the origin: a cone of wood
 * with a graphite tip, a body, and a cap at the end.
 */
const PENCIL = {
  length: 92,
  halfThickness: 9,
  coneEnd: 22,
  tipEnd: 8,
  capStart: 82,
} as const;

/** The width of the pencil's outline, in the note's box of 100 units, inside and outside. */
const PENCIL_OUTLINE_WIDTH = 7;

/** A pencil that lies across the sticky note, in the note's box of 100 units, point down-left. */
function Pencil(): React.JSX.Element {
  const { length, halfThickness, coneEnd, tipEnd, capStart } = PENCIL;
  const tipHalf = (halfThickness * tipEnd) / coneEnd;
  return (
    <g transform={`translate(50 54) rotate(-45) translate(${-length / 2} 0)`}>
      {/* One path for the whole outline, so that it does not break where the parts meet. The stroke
          is drawn first and is twice as wide, so the parts cover its inner half. */}
      <path
        className="tw:fill-card-ink tw:stroke-card-ink"
        d={`M 0 0 L ${coneEnd} ${-halfThickness} H ${length} V ${halfThickness} H ${coneEnd} Z`}
        paintOrder="stroke"
        strokeLinejoin="round"
        // The outline grows with the note, so that it does not cover a small pencil.
        strokeWidth={PENCIL_OUTLINE_WIDTH}
      />
      <path
        className="tw:fill-card-note"
        d={`M ${tipEnd} ${-tipHalf} L ${coneEnd} ${-halfThickness} V ${halfThickness} L ${tipEnd} ${tipHalf} Z`}
      />
      <rect
        className="tw:fill-clue"
        height={2 * halfThickness}
        width={capStart - coneEnd}
        x={coneEnd}
        y={-halfThickness}
      />
    </g>
  );
}

/**
 * The space that the possibilities fill on a card, in fractions of the card's width. They start
 * below the rank in the corner when it shows.
 */
const POSSIBILITIES = {
  inset: 0.07,
  topWithRank: 0.52,
  topWithoutRank: 0.1,
  gap: 0.05,
  /** The most that a suit pip or a rank chip takes, so that two or three are not huge. */
  maxPip: 0.4,
  maxChip: 0.21,
  /**
   * The space between the edge of the card and the rank chips. It is smaller than `inset`, so that
   * the chips take more of the card's width.
   */
  rankInset: 0.035,
  /** The gap between rank chips. */
  chipGap: 0.015,
  /**
   * The most rows of suits. The top of the card stays free for the sticky note of a note, and the
   * suits sit where they do on a card that shows its rank, so that they stay in place when a rank
   * clue arrives.
   */
  maxSuitRows: 2,
} as const;

/** The size of the chip behind a suit's pip, per the pip's cell. */
const SUIT_CHIP_PER_CELL = 0.92;

/** The size of a suit's pip, per its cell. The pip fills most of its chip. */
const SUIT_PIP_PER_CELL = 0.9;

/**
 * The chip behind a suit's pip: a little darker than the face of an unknown card, with a thin dark
 * ring. Light suits, such as yellow and white, stand out on it better than on a white chip.
 */
const SUIT_CHIP_BACKGROUND =
  "color-mix(in srgb, var(--card-face-unknown) 85%, var(--card-ink))";
const SUIT_CHIP_RING = "inset 0 0 0 1px rgb(27 36 43 / 45%)";

/** The height of a rank chip, per its width. */
const RANK_CHIP_HEIGHT_PER_WIDTH = 1.1;

/** The size of the number on a rank chip, per the chip's width. */
const RANK_CHIP_FONT_PER_WIDTH = 0.84;

/**
 * How opaque a suit or a rank is when the holder ruled it out. It stays in its place, crossed out,
 * so that the others do not move when the holder learns more.
 */
const ELIMINATED_PIP_OPACITY = 0.55;

/** The width of the cross over a suit or a rank that the holder ruled out, per its size. */
const ELIMINATED_CROSS_WIDTH = 0.11;

/**
 * The width of the ring in the clue color around a suit or a rank that a clue touched, per the
 * width of a card. It is never thinner than a pixel.
 */
const POSITIVE_RING_PER_WIDTH = 0.022;

/** The ring of a suit or a rank that a clue touched, in the color of a clued card's border. */
function getPositiveRing(width: number): string {
  return `0 0 0 ${Math.max(1, width * POSITIVE_RING_PER_WIDTH)}px var(--clue-border)`;
}

/**
 * A cross over a suit or a rank that the holder ruled out: a dark X with a light edge, so that it
 * shows on the gray chip of a suit and on the dark chip of a rank.
 */
function EliminatedCross(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:size-full tw:overflow-visible"
      viewBox="0 0 100 100"
    >
      <path
        className="tw:fill-none tw:stroke-card-ink"
        d="M 18 18 L 82 82 M 82 18 L 18 82"
        paintOrder="stroke"
        strokeLinecap="round"
        strokeWidth={ELIMINATED_CROSS_WIDTH * 100}
      />
      <path
        className="tw:fill-none tw:stroke-white"
        d="M 18 18 L 82 82 M 82 18 L 18 82"
        strokeLinecap="round"
        strokeWidth={ELIMINATED_CROSS_WIDTH * 100 * 0.45}
      />
    </svg>
  );
}

/** A suit that a card can be: its pip on a gray chip, in a square cell. */
function SuitChip({
  variant,
  pip,
  cell,
  width,
}: {
  readonly variant: Variant;
  readonly pip: SuitPipView;
  readonly cell: number;
  /** The width of the card. */
  readonly width: number;
}): React.JSX.Element | undefined {
  const suit = variant.suits[pip.suitIndex];
  if (suit === undefined) {
    return undefined;
  }

  const chip = cell * SUIT_CHIP_PER_CELL;
  return (
    <span
      className="tw:relative tw:flex tw:shrink-0 tw:items-center tw:justify-center"
      data-pip-eliminated={pip.eliminated ? true : undefined}
      style={{
        width: cell,
        height: cell,
      }}
    >
      <span
        className="tw:flex tw:items-center tw:justify-center tw:rounded-full"
        style={{
          width: chip,
          height: chip,
          background: SUIT_CHIP_BACKGROUND,
          opacity: pip.eliminated ? ELIMINATED_PIP_OPACITY : 1,
          boxShadow: pip.positive
            ? `${SUIT_CHIP_RING}, ${getPositiveRing(width)}`
            : SUIT_CHIP_RING,
        }}
      >
        {/* With the border and the shadow of the pips on a card's face, so that light suits, such
            as yellow and white, stand out on the chip. */}
        <Pip
          shadow
          size={cell * SUIT_PIP_PER_CELL}
          suit={suit}
          variant={variant}
        />
      </span>
      {pip.eliminated && (
        <span
          className="tw:absolute"
          style={{
            width: chip,
            height: chip,
          }}
        >
          <EliminatedCross />
        </span>
      )}
    </span>
  );
}

/** A rank that a card can be: a dark chip with a white number. */
function RankChip({
  pip,
  chipWidth,
  chipHeight = chipWidth * RANK_CHIP_HEIGHT_PER_WIDTH,
  width,
}: {
  readonly pip: RankPipView;
  readonly chipWidth: number;
  readonly chipHeight?: number;
  /** The width of the card. */
  readonly width: number;
}): React.JSX.Element {
  return (
    <span
      className="tw:relative tw:flex tw:shrink-0"
      data-pip-eliminated={pip.eliminated ? true : undefined}
      style={{
        width: chipWidth,
        height: chipHeight,
      }}
    >
      <span
        className="tw:flex tw:size-full tw:items-center tw:justify-center tw:bg-card-ink tw:font-extrabold tw:leading-none tw:text-white"
        style={{
          fontSize: chipWidth * RANK_CHIP_FONT_PER_WIDTH,
          borderRadius: chipWidth * 0.25,
          opacity: pip.eliminated ? ELIMINATED_PIP_OPACITY : 1,
          boxShadow: pip.positive ? getPositiveRing(width) : undefined,
        }}
      >
        {getRankLabel(pip.rank)}
      </span>
      {pip.eliminated && <EliminatedCross />}
    </span>
  );
}

/**
 * What the holder of a card knows about it: the suits and ranks that it can still be. They fill the
 * card, so that they are easy to read at a glance. Each suit is a pip on a gray chip with a dark
 * ring, and each rank is a dark chip with a white number. A suit or a rank that the holder ruled
 * out is crossed out, and one that a clue touched has a ring in the clue color. The card shows the
 * exact cards that it can be in a bubble on hover (see `PossibleCardsBubble`).
 *
 * Each suit and each rank of the variant has a fixed place, so that the others do not move when the
 * holder learns that the card is not one of them. Its place stays empty.
 */
function Possibilities({
  variant,
  width,
  pips,
  rankShown,
  badgeShown,
}: {
  readonly variant: Variant;
  readonly width: number;
  readonly pips: CardPipsView;
  /** Whether the card shows its rank in the corner, so that the possibilities go below it. */
  readonly rankShown: boolean;
  /** Whether a badge or an arrow is in a bottom corner, so that the possibilities go above it. */
  readonly badgeShown: boolean;
}): React.JSX.Element {
  const {
    inset,
    topWithRank,
    topWithoutRank,
    gap,
    maxPip,
    maxChip,
    rankInset,
    chipGap,
    maxSuitRows,
  } = POSSIBILITIES;
  const innerWidth = width * (1 - 2 * inset);
  const top = width * (rankShown ? topWithRank : topWithoutRank);
  const bottom =
    width
    * (badgeShown
      ? CORNER_INSET_PER_WIDTH + BADGE_SIZE_PER_WIDTH + gap
      : inset);

  const { suits, ranks } = pips;
  const suitSlots = variant.suits.map((_suit, i) =>
    suits.find((pip) => pip.suitIndex === i),
  );
  const rankSlots = variant.ranks.map((rank) =>
    ranks.find((pip) => pip.rank === rank),
  );
  const chipSize = Math.min(
    width * maxChip,
    (width * (1 - 2 * rankInset) - (rankSlots.length - 1) * width * chipGap)
      / Math.max(rankSlots.length, 1),
  );

  // The suits take the rest of the card's height, in at most two rows. They go in as many columns
  // as make the pips the largest, such as three columns of two for six suits.
  const rankRowHeight =
    ranks.length > 0 ? chipSize * RANK_CHIP_HEIGHT_PER_WIDTH + width * gap : 0;
  const suitsHeight =
    width * CARD_HEIGHT_PER_WIDTH - top - bottom - rankRowHeight;
  const suitCount = Math.max(suitSlots.length, 1);
  let suitColumns = 1;
  let pipCell = 0;
  for (let columns = 1; columns <= suitCount; columns++) {
    const rows = Math.ceil(suitCount / columns);
    if (rows > maxSuitRows) {
      continue;
    }
    const cell = Math.min(
      innerWidth / columns,
      suitsHeight / rows,
      width * maxPip,
    );
    if (cell <= pipCell) {
      continue;
    }

    pipCell = cell;
    suitColumns = columns;
  }

  return (
    <div
      // The possibilities sit at the bottom, below the suit in the middle of the card when it
      // shows.
      className="tw:absolute tw:flex tw:flex-col tw:items-center tw:justify-end"
      style={{
        left: width * inset,
        right: width * inset,
        top,
        bottom,
        gap: width * gap,
      }}
    >
      {suits.length > 0 && (
        // The rows wrap from the middle, so that a short last row is centered under the others.
        <div
          className="tw:flex tw:flex-wrap tw:justify-center"
          style={{ width: suitColumns * pipCell }}
        >
          {suitSlots.map((pip, i) =>
            pip === undefined ? (
              <span
                className="tw:shrink-0"
                key={i}
                style={{
                  width: pipCell,
                  height: pipCell,
                }}
              />
            ) : (
              <SuitChip
                cell={pipCell}
                key={pip.suitIndex}
                pip={pip}
                variant={variant}
                width={width}
              />
            ),
          )}
        </div>
      )}
      {ranks.length > 0 && (
        // The row is centered, so that it reaches past the suits' inset on both sides.
        <div className="tw:flex" style={{ gap: width * chipGap }}>
          {rankSlots.map((pip, i) =>
            pip === undefined ? (
              <span
                className="tw:shrink-0"
                key={variant.ranks[i]}
                style={{
                  width: chipSize,
                  height: chipSize * RANK_CHIP_HEIGHT_PER_WIDTH,
                }}
              />
            ) : (
              <RankChip
                chipWidth={chipSize}
                key={pip.rank}
                pip={pip}
                width={width}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The sizes in the bubble of possible cards, as fractions of the width of the card that it is for.
 */
const POSSIBLE_CARDS = {
  /** A small card in the bubble. */
  cardWidth: 0.3,
  cardHeight: 0.4,
  /** The rank on a small card. */
  font: 0.27,
  /** The cell of a suit's pip at the start of a row. */
  pip: 0.36,
  /** The space between small cards. */
  gap: 0.05,
  padding: 0.12,
  /** The pointer that points from the bubble at the card. */
  pointerWidth: 0.26,
  pointerHeight: 0.13,
  /**
   * The space between the card and the tip of the pointer. It leaves room for the border of a clued
   * card, which is outside of the card.
   */
  pointerGap: 0.08,
} as const;

/** The outline of the bubble of possible cards and of its pointer, in pixels. */
const POSSIBLE_CARDS_OUTLINE = 1;

/** The color of the outline of the bubble of possible cards and of its pointer. */
const POSSIBLE_CARDS_OUTLINE_COLOR = "rgb(0 0 0 / 45%)";

/**
 * How far the pointer reaches into the bubble, past the bubble's outline, in pixels. It covers the
 * outline where the two shapes meet, so that one outline goes around both. It reaches further than
 * the outline, since the scale of the screen can round the outline to the next pixel.
 */
const POSSIBLE_CARDS_POINTER_OVERLAP = 2;

/**
 * The widest that the notes in the bubble of possible cards are, in the notes' own font size. A
 * longer note wraps onto more lines.
 */
const POSSIBLE_CARDS_NOTE_MAX_WIDTH = "16em";

/** The least space between the bubble of possible cards and the edge of the window, in pixels. */
const POSSIBLE_CARDS_WINDOW_MARGIN = 8;

/** A small card in the bubble of possible cards: a card face of the suit's color with the rank. */
function PossibleCard({
  variant,
  colorblindMode,
  suitIndex,
  rank,
  unit,
}: {
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly suitIndex: SuitIndex;
  readonly rank: Rank;
  /** The width of the card that the bubble is for, in the window's pixels. */
  readonly unit: number;
}): React.JSX.Element {
  const suit = variant.suits[suitIndex];
  const faceColors = getFaceColors(variant, suit, rank, colorblindMode);
  const width = unit * POSSIBLE_CARDS.cardWidth;
  return (
    <span
      className={`tw:flex tw:items-center tw:justify-center tw:font-extrabold tw:leading-none tw:ring-1 tw:ring-black/45 ${faceColors.className}`}
      data-possible-card
      style={{
        width,
        height: unit * POSSIBLE_CARDS.cardHeight,
        background: faceColors.background,
        color: faceColors.ink,
        fontSize: unit * POSSIBLE_CARDS.font,
        borderRadius: width * CARD_CORNER_PER_WIDTH * 2,
      }}
    >
      {getRankLabel(rank)}
    </span>
  );
}

/** An empty place in the bubble of possible cards, for a card that this card cannot be. */
function ImpossibleCard({
  unit,
}: {
  readonly unit: number;
}): React.JSX.Element {
  const width = unit * POSSIBLE_CARDS.cardWidth;
  return (
    <span
      className="tw:box-border tw:border tw:border-dashed tw:border-card-ink/25"
      style={{
        width,
        height: unit * POSSIBLE_CARDS.cardHeight,
        borderRadius: width * CARD_CORNER_PER_WIDTH * 2,
      }}
    />
  );
}

/**
 * Every card that a card can be, in a bubble beside it while the pointer is over it. It is a grid
 * with a row for each suit that the card can be and a column for every rank of the variant, so that
 * each rank is always in the same column. A card that this card cannot be leaves an empty place.
 */
function PossibleCardsBubble({
  variant,
  colorblindMode,
  bubble,
  noteHtml,
  anchor,
}: {
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  readonly bubble: PossibleCardsView;
  /** The card's notes, as HTML. They go above the grid, instead of in a tooltip of their own. */
  readonly noteHtml: string | undefined;
  readonly anchor: HTMLElement;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    readonly left: number;
    readonly top: number;
    /** The side of the card that the bubble is on. */
    readonly side: "below" | "above";
    /** Where the tip of the pointer is, from the left edge of the bubble. */
    readonly pointerX: number;
  }>();

  // The bubble is outside of the zoomed game screen, so it is measured in the window's pixels.
  const anchorRect = anchor.getBoundingClientRect();
  const unit = anchorRect.width;
  const pointerWidth = unit * POSSIBLE_CARDS.pointerWidth;
  const pointerHeight = unit * POSSIBLE_CARDS.pointerHeight;

  // The bubble goes below the card, since the note of the card opens above it. It goes above the
  // card when only that side has room. The pointer points at the middle of the card, even when the
  // edge of the window moves the bubble to one side.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const { height, width } = element.getBoundingClientRect();
    const offset =
      unit * POSSIBLE_CARDS.pointerGap + pointerHeight + POSSIBLE_CARDS_OUTLINE;
    const below = anchorRect.bottom + offset;
    const side =
      below + height + POSSIBLE_CARDS_WINDOW_MARGIN > window.innerHeight
        ? "above"
        : "below";
    const middle = anchorRect.left + anchorRect.width / 2;
    const left = Math.min(
      Math.max(middle - width / 2, POSSIBLE_CARDS_WINDOW_MARGIN),
      window.innerWidth - width - POSSIBLE_CARDS_WINDOW_MARGIN,
    );
    const radius = unit * CARD_CORNER_PER_WIDTH * 2;
    setPosition({
      left,
      top: side === "below" ? below : anchorRect.top - offset - height,
      side,
      pointerX: Math.min(
        Math.max(middle - left, radius + pointerWidth / 2),
        width - radius - pointerWidth / 2,
      ),
    });
  }, [
    anchorRect.bottom,
    anchorRect.left,
    anchorRect.top,
    anchorRect.width,
    pointerHeight,
    pointerWidth,
    unit,
  ]);

  const ranks = variant.ranks.toSorted(
    (a, b) => rankColumnOrder(a) - rankColumnOrder(b),
  );

  // The pointer's shape, pointing up from the top edge of the bubble. It starts above the bubble's
  // outline, and reaches into the bubble to cover the outline.
  const pointerBase = pointerHeight;
  const pointerBottom =
    pointerBase + POSSIBLE_CARDS_OUTLINE + POSSIBLE_CARDS_POINTER_OVERLAP;
  const pointerTip = POSSIBLE_CARDS_OUTLINE / 2;

  return (
    // The shadow is on the wrapper, so that it follows the outline of the bubble and its pointer.
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:fixed tw:z-50 tw:drop-shadow-[0_4px_7px_rgb(0_0_0/45%)]"
      ref={ref}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position === undefined ? "hidden" : undefined,
      }}
    >
      <div
        className="tw:flex tw:flex-col tw:items-center tw:bg-card-unknown"
        data-possible-cards
        style={{
          gap: unit * POSSIBLE_CARDS.padding,
          padding: unit * POSSIBLE_CARDS.padding,
          borderRadius: unit * CARD_CORNER_PER_WIDTH * 2,
          boxShadow: `0 0 0 ${POSSIBLE_CARDS_OUTLINE}px ${POSSIBLE_CARDS_OUTLINE_COLOR}`,
        }}
      >
        {noteHtml !== undefined && (
          // The notes look like a note tooltip: dark text on white, like a sheet of paper. The HTML
          // escapes what players wrote.
          <div
            className="tw:self-stretch tw:bg-white tw:text-[1.5em] tw:text-card-ink tw:ring-1 tw:ring-black/25"
            dangerouslySetInnerHTML={{ __html: noteHtml }}
            data-possible-cards-note
            style={
              {
                maxWidth: POSSIBLE_CARDS_NOTE_MAX_WIDTH,
                padding: "0.65em 0.85em",
                borderRadius: unit * CARD_CORNER_PER_WIDTH,
                "--surface": "white",
                "--note-title-line": "rgb(0 0 0 / 35%)",
              } as React.CSSProperties
            }
          />
        )}
        <div
          className="tw:grid tw:items-center tw:justify-items-center"
          style={{
            gridTemplateColumns: `repeat(${ranks.length + 1}, auto)`,
            gap: unit * POSSIBLE_CARDS.gap,
          }}
        >
          {bubble.suits.map((suit) => [
            <SuitChip
              cell={unit * POSSIBLE_CARDS.pip}
              key={`${suit.suitIndex}-pip`}
              pip={suit}
              variant={variant}
              width={unit / getScreenScale()}
            />,
            ...ranks.map((rank) =>
              suit.ranks.includes(rank) ? (
                <PossibleCard
                  colorblindMode={colorblindMode}
                  key={`${suit.suitIndex}-${rank}`}
                  rank={rank}
                  suitIndex={suit.suitIndex}
                  unit={unit}
                  variant={variant}
                />
              ) : (
                <ImpossibleCard key={`${suit.suitIndex}-${rank}`} unit={unit} />
              ),
            ),
          ])}
        </div>
      </div>
      {position !== undefined && (
        <svg
          className="tw:absolute tw:overflow-visible"
          height={pointerBottom}
          style={{
            left: position.pointerX - pointerWidth / 2,
            ...(position.side === "below"
              ? {
                  top: -pointerBase - POSSIBLE_CARDS_OUTLINE,
                }
              : {
                  bottom: -pointerBase - POSSIBLE_CARDS_OUTLINE,
                  transform: "scaleY(-1)",
                }),
          }}
          width={pointerWidth}
        >
          <path
            className="tw:fill-card-unknown"
            d={`M 0 ${pointerBase} L ${pointerWidth / 2} ${pointerTip} L ${pointerWidth} ${pointerBase} V ${pointerBottom} H 0 Z`}
          />
          <path
            d={`M 0 ${pointerBase + POSSIBLE_CARDS_OUTLINE / 2} L ${pointerWidth / 2} ${pointerTip} L ${pointerWidth} ${pointerBase + POSSIBLE_CARDS_OUTLINE / 2}`}
            fill="none"
            stroke={POSSIBLE_CARDS_OUTLINE_COLOR}
            strokeLinejoin="round"
            strokeWidth={POSSIBLE_CARDS_OUTLINE}
          />
        </svg>
      )}
    </div>
  );
}

/**
 * The mark on a card whose separate suit and rank pips cannot show the cards that it can be. It
 * shows that the bubble on hover has more to tell: a small speech bubble with three dots.
 */
function PossibleCardsMark({
  width,
}: {
  readonly width: number;
}): React.JSX.Element {
  const size = width * BADGE_SIZE_PER_WIDTH;
  return (
    <svg
      aria-label="Not every combination of these suits and ranks is possible"
      className="tw:pointer-events-none tw:absolute tw:overflow-visible tw:drop-shadow-[0_1px_2px_rgb(0_0_0/45%)]"
      data-possible-cards-mark
      height={size}
      role="img"
      style={getBadgeStyle(width, "topLeft")}
      viewBox="0 0 100 100"
      width={size}
    >
      <path
        className="tw:fill-white tw:stroke-card-ink"
        d="M 18 8 H 82 Q 96 8 96 22 V 62 Q 96 76 82 76 H 40 L 18 96 V 76 Q 4 76 4 62 V 22 Q 4 8 18 8 Z"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <g className="tw:fill-card-ink">
        <circle cx={30} cy={42} r={8} />
        <circle cx={50} cy={42} r={8} />
        <circle cx={70} cy={42} r={8} />
      </g>
    </svg>
  );
}

function rankColumnOrder(rank: Rank): number {
  return rank === START_CARD_RANK ? 0 : rank;
}

/**
 * Returns the colors of a card face for a suit, or the colors of an unknown card. The colors that
 * come from the theme are classes, since the theme does not define them as CSS variables.
 */
function getFaceColors(
  variant: Variant,
  suit: Suit | undefined,
  rank: Rank | undefined,
  colorblindMode: boolean,
): { className: string; background?: string; ink?: string } {
  if (suit === undefined) {
    return { className: "tw:bg-card-unknown tw:text-card-ink" };
  }

  if (suit.fillColors !== undefined) {
    const stops = suit.fillColors.map(
      (color) => `color-mix(in srgb, ${color} ${FACE_TINT_PERCENT}%, white)`,
    );
    return {
      className: "tw:text-card-ink",
      background: `linear-gradient(135deg, ${stops.join(", ")})`,
    };
  }

  const fill = colorblindMode ? suit.fillColorblind : suit.fill;

  // A prism card is tinted with the color that touches it, which depends on its rank. A card of
  // unknown rank uses the suit color.
  const tintSource =
    rank !== undefined && suit.prism
      ? getColorForPrismCard(variant, rank)
      : suit;
  const tint = colorblindMode ? tintSource.fillColorblind : tintSource.fill;

  return {
    className: "",
    background: `color-mix(in srgb, ${tint} ${FACE_TINT_PERCENT}%, white)`,
    ink: `color-mix(in srgb, ${fill} ${INK_PERCENT}%, black)`,
  };
}

function getRankLabel(rank: Rank): string {
  return rank === START_CARD_RANK ? START_CARD_RANK_LABEL : rank.toString();
}

/** The label of a rank clue: "O" and "E" in "Odds and Evens" variants, else the rank. */
export function getRankClueLabel(variant: Variant, rank: ClueRank): string {
  if (variant.oddsAndEvens) {
    return rank === EVEN_RANK_CLUE ? "E" : "O";
  }
  return getRankLabel(rank);
}

/** Describes a card for screen readers. */
export function describeCard(
  variant: Variant,
  suitIndex: SuitIndex | undefined,
  rank: Rank | undefined,
): string {
  const suitName =
    suitIndex === undefined ? undefined : variant.suits[suitIndex]?.displayName;
  const rankLabel = rank === undefined ? undefined : getRankLabel(rank);
  return suitName === undefined && rankLabel === undefined
    ? "Unknown card"
    : [suitName ?? "Unknown suit", rankLabel ?? "of unknown rank"].join(" ");
}

/**
 * The border of a card whose note marks it as finessed, chop moved, or allowed to be discarded. It
 * is drawn like the border of a clued card, in the colors of the classic screen.
 */
const NOTE_BORDER_CLASSES = {
  finessed: "tw:ring-4 tw:ring-finesse tw:inset-ring-2 tw:inset-ring-card-ink",
  chopMoved:
    "tw:ring-4 tw:ring-chop-move tw:inset-ring-2 tw:inset-ring-card-ink",
  discardPermission:
    "tw:ring-4 tw:ring-discard-permission tw:inset-ring-2 tw:inset-ring-card-ink",
} as const satisfies Record<NoteBorder, string>;

/**
 * The box around the shapes of the ranks 1 to 5, relative to the origin of their paths, in the
 * card's own units. It adds the right side to `RANK_SHAPE_BOX`.
 */
const RANK_SHAPE_RIGHT = 28;

/**
 * The space between the suit's letter and the rank in color-blind mode, in the card's own units.
 */
const SUIT_LETTER_GAP = 14;

/** How large the rank that a deceptive card pretends to be is, beside its real rank. */
const DECEPTIVE_RANK_SCALE = 0.5;

/**
 * The space between the rank and the deceptive rank, in the card's own units. It is smaller than
 * the space after the suit's letter, because the deceptive rank sits at the top, where the rank's
 * shape is narrower.
 */
const DECEPTIVE_RANK_GAP = 4;

/**
 * The font size of the suit's letter until the browser measures it, in the card's units. Its
 * capital letters are about as tall as the rank.
 */
const SUIT_LETTER_ESTIMATED_FONT_SIZE = 110;

/** The font size at which the browser measures the shape of the suit's letter, in pixels. */
const SUIT_LETTER_MEASURE_FONT_SIZE = 100;

/**
 * The font of the suit's letter in color-blind mode. Its brush strokes look like the shapes of the
 * ranks. "public/css/app/common.css" loads it.
 */
const SUIT_LETTER_FONT_FAMILY = "Kalam";

/**
 * The width of the suit's letter until the browser measures it, in the card's units. It is about
 * the width of most capital letters.
 */
const SUIT_LETTER_ESTIMATED_WIDTH = 80;

/**
 * Where the deceptive rank and the bottom of the rank go in the corner, in the card's own units.
 */
const DECEPTIVE_RANK_X =
  RANK_CORNER_OFFSET.x + RANK_SHAPE_RIGHT + DECEPTIVE_RANK_GAP;
const RANK_BOTTOM_Y = RANK_CORNER_OFFSET.y + RANK_SHAPE_BOX.bottom;
const RANK_LEFT_X = RANK_CORNER_OFFSET.x + RANK_SHAPE_BOX.left;
const RANK_HEIGHT = RANK_SHAPE_BOX.bottom - RANK_SHAPE_BOX.top;

/** Where and how large the suit's letter is drawn in the corner, in the card's own units. */
interface SuitLetterBox {
  readonly fontSize: number;
  /** The start of the text, which puts the left of the letter's shape at the corner. */
  readonly x: number;
  /** The baseline of the text, which puts the bottom of the letter's shape at the rank's bottom. */
  readonly y: number;
  /** The width of the letter's shape. */
  readonly width: number;
}

const ESTIMATED_SUIT_LETTER_BOX = {
  fontSize: SUIT_LETTER_ESTIMATED_FONT_SIZE,
  x: RANK_LEFT_X,
  y: RANK_BOTTOM_Y,
  width: SUIT_LETTER_ESTIMATED_WIDTH,
} as const satisfies SuitLetterBox;

/** The boxes of the letters that the browser measured in the loaded font. */
const suitLetterBoxes = new Map<string, SuitLetterBox>();

/**
 * Measures the shape of a suit's letter, and sizes it to be as tall as a rank. Letters have shapes
 * of different sizes in the font, so a fixed font size would make some taller than others. Returns
 * `undefined` when the browser cannot measure text.
 */
function measureSuitLetter(letter: string): SuitLetterBox | undefined {
  const cached = suitLetterBoxes.get(letter);
  if (cached !== undefined) {
    return cached;
  }

  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    return undefined;
  }
  const font = `bold ${SUIT_LETTER_MEASURE_FONT_SIZE}px ${SUIT_LETTER_FONT_FAMILY}`;
  context.font = font;
  const metrics = context.measureText(letter);
  const shapeHeight =
    metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  if (shapeHeight <= 0) {
    return undefined;
  }

  const scale = RANK_HEIGHT / shapeHeight;
  const box = {
    fontSize: SUIT_LETTER_MEASURE_FONT_SIZE * scale,
    x: RANK_LEFT_X + metrics.actualBoundingBoxLeft * scale,
    y: RANK_BOTTOM_Y - metrics.actualBoundingBoxDescent * scale,
    width:
      (metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight) * scale,
  };
  // Until the font loads, the browser measures another font.
  if (document.fonts.check(font, letter)) {
    suitLetterBoxes.set(letter, box);
  }
  return box;
}

/**
 * The colors of the rank in the corner of a card. Most ranks have the ink of the card's face, which
 * is `undefined` here. In some variants, a rank has other colors, such as a rainbow for the special
 * rank of "Rainbow-Ones" (see `getRankLabelFill`). Each color is darkened like the face's ink.
 */
function getRankInk(
  variant: Variant,
  suit: Suit | undefined,
  rank: Rank | undefined,
): readonly string[] | undefined {
  if (suit === undefined) {
    return undefined;
  }

  const fill = getRankLabelFill(variant, suit, rank);
  if (fill === undefined) {
    return undefined;
  }

  const colors = "fill" in fill ? [fill.fill] : fill.fillColors;
  return colors.map(darkenInk);
}

/** Darkens a suit's color, so that it reads on the light face of a card. */
function darkenInk(color: string): string {
  return `color-mix(in srgb, ${color} ${INK_PERCENT}%, black)`;
}

/**
 * The rank in the top-left corner of a card, drawn as the stylized shapes of the classic screen's
 * "stylized numbers" setting. The possibilities fill the bottom of the card, so the same rank,
 * turned over in the opposite corner as on a playing card, shows only when they do not.
 *
 * Beside the rank, a deceptive card shows the rank that it pretends to be, at half the size and at
 * the top. In color-blind mode, the suit's letter comes before the rank, at the same size, such as
 * "B1". A card of unknown rank shows only the letter.
 */
function CardCorner({
  rank,
  ink,
  deceptiveRank,
  suitLetter,
  showTurnedOver,
}: {
  readonly rank: Rank | undefined;
  /** The colors of the rank, top to bottom (see `getRankInk`), or the face's ink when undefined. */
  readonly ink: readonly string[] | undefined;
  readonly deceptiveRank: Rank | undefined;
  readonly suitLetter: string | undefined;
  readonly showTurnedOver: boolean;
}): React.JSX.Element {
  const path = rank === undefined ? undefined : RANK_PATHS.get(rank);
  const deceptivePath =
    deceptiveRank === undefined ? undefined : RANK_PATHS.get(deceptiveRank);
  const shadowId = useId();
  const gradientId = useId();

  // The suit's letter is sized to the height of the rank, and the rank moves right to make room for
  // it. The browser measures the letter again when its font finishes loading.
  const [letterBox, setLetterBox] = useState<SuitLetterBox>(
    ESTIMATED_SUIT_LETTER_BOX,
  );
  useLayoutEffect(() => {
    // The test environment has no fonts, so it cannot measure text.
    if (suitLetter === undefined || !("fonts" in document)) {
      return undefined;
    }
    const letter = suitLetter;
    let current = true;
    function measure() {
      const box = measureSuitLetter(letter);
      if (current && box !== undefined) {
        setLetterBox(box);
      }
    }
    measure();
    // If the font does not load, the letter keeps the measure of the fallback font.
    document.fonts
      .load(
        `bold ${SUIT_LETTER_MEASURE_FONT_SIZE}px ${SUIT_LETTER_FONT_FAMILY}`,
        letter,
      )
      .then(measure)
      .catch(measure);
    return () => {
      current = false;
    };
  }, [suitLetter]);
  const rankShift =
    suitLetter === undefined ? 0 : letterBox.width + SUIT_LETTER_GAP;
  const corner = `translate(${RANK_CORNER_OFFSET.x} ${RANK_CORNER_OFFSET.y})`;
  const shiftedCorner = `translate(${RANK_CORNER_OFFSET.x + rankShift} ${RANK_CORNER_OFFSET.y})`;
  let fill: string | undefined;
  if (ink !== undefined) {
    fill = ink.length === 1 ? ink[0] : `url(#${gradientId})`;
  }
  const strokeProps = {
    className: `tw:stroke-card-ink ${fill === undefined ? "tw:fill-current" : ""}`,
    filter: `url(#${shadowId})`,
    paintOrder: "stroke",
    strokeLinejoin: "round",
    strokeWidth: RANK_OUTLINE_WIDTH,
    style: fill === undefined ? undefined : { fill },
  } as const;

  return (
    <svg
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:size-full tw:overflow-visible"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
    >
      <filter height="200%" id={shadowId} width="200%" x="-50%" y="-50%">
        <feDropShadow
          dx={0}
          dy={0}
          floodColor={CARD_IMAGE_SHADOW_COLOR}
          stdDeviation={RANK_SHADOW_DEVIATION}
        />
      </filter>
      {ink !== undefined && ink.length > 1 && (
        // The colors run from the top of each shape to its bottom, as on the classic screen.
        <linearGradient id={gradientId} x1={0} x2={0} y1={0} y2={1}>
          {ink.map((color, i) => (
            <stop
              key={color}
              offset={i / (ink.length - 1)}
              style={{ stopColor: color }}
            />
          ))}
        </linearGradient>
      )}
      {path !== undefined && (
        <path {...strokeProps} d={path} transform={shiftedCorner} />
      )}
      {path !== undefined && showTurnedOver && (
        <path
          {...strokeProps}
          d={path}
          transform={`rotate(180 ${CARD_W / 2} ${CARD_H / 2}) ${corner}`}
        />
      )}
      {deceptivePath !== undefined && (
        <path
          {...strokeProps}
          d={deceptivePath}
          data-deceptive-rank
          // Its box starts beside the rank, level with its top.
          transform={`translate(${DECEPTIVE_RANK_X + rankShift - RANK_SHAPE_BOX.left * DECEPTIVE_RANK_SCALE} ${
            RANK_CORNER_OFFSET.y
            + RANK_SHAPE_BOX.top * (1 - DECEPTIVE_RANK_SCALE)
          }) scale(${DECEPTIVE_RANK_SCALE})`}
        />
      )}
      {suitLetter !== undefined && (
        <text
          {...strokeProps}
          className={`${strokeProps.className} tw:font-bold`}
          data-suit-letter
          dominantBaseline="alphabetic"
          fontFamily={SUIT_LETTER_FONT_FAMILY}
          fontSize={letterBox.fontSize}
          x={letterBox.x}
          y={letterBox.y}
        >
          {suitLetter}
        </text>
      )}
    </svg>
  );
}

/**
 * The legs of the triangles in two corners of a card of a suit that several colors touch, in the
 * card's own units. They are larger than on the classic screen, since New UI cards are smaller.
 */
const COLOR_TRIANGLE_SIZE = 64;

/** The width of the line along the long side of each triangle, in the card's own units. */
const COLOR_TRIANGLE_OUTLINE_WIDTH = 4;

/**
 * The points of each color's slice of a triangle in a corner, which shares the long side evenly
 * between the colors. `corner` is the corner's point, and `legX` and `legY` are where the long side
 * meets the card's top or bottom edge and its side edge.
 */
function getTriangleSlices(
  count: number,
  corner: { x: number; y: number },
  legX: { x: number; y: number },
  legY: { x: number; y: number },
): readonly string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      `${corner.x},${corner.y} ${getPointBetween(legX, legY, i / count)} ${getPointBetween(legX, legY, (i + 1) / count)}`,
  );
}

/** The point that is a share `t` of the way from `a` to `b`, as SVG coordinates. */
function getPointBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): string {
  return `${a.x + (b.x - a.x) * t},${a.y + (b.y - a.y) * t}`;
}

/**
 * Triangles in the top-right and bottom-left corners of a card of a suit that several colors touch,
 * such as "Tangerine", with a slice of each color, as on the classic screen. They show the colors
 * that touch the card without a look at the suit's notes. One line runs along the long side of each
 * triangle, so that the slices read as one shape.
 */
function DualColorTriangles({
  colors,
  colorblindMode,
  width,
}: {
  readonly colors: readonly Color[];
  readonly colorblindMode: boolean;
  readonly width: number;
}): React.JSX.Element {
  const size = COLOR_TRIANGLE_SIZE;
  const topRight = {
    corner: {
      x: CARD_W,
      y: 0,
    },
    legX: {
      x: CARD_W - size,
      y: 0,
    },
    legY: {
      x: CARD_W,
      y: size,
    },
  };
  // The colors go in the same order in both corners when the card is turned over.
  const bottomLeft = {
    corner: {
      x: 0,
      y: CARD_H,
    },
    legX: {
      x: size,
      y: CARD_H,
    },
    legY: {
      x: 0,
      y: CARD_H - size,
    },
  };

  return (
    // The card's round corners cut the triangles.
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:overflow-hidden"
      style={{ borderRadius: width * CARD_CORNER_PER_WIDTH }}
    >
      <svg
        className="tw:size-full"
        data-color-triangles
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      >
        {[topRight, bottomLeft].map(({ corner, legX, legY }) => (
          <g key={`${corner.x} ${corner.y}`}>
            {getTriangleSlices(colors.length, corner, legX, legY).map(
              (points, i) => {
                const color = colors[i];
                return color === undefined ? undefined : (
                  <polygon
                    key={color.name}
                    points={points}
                    style={{
                      fill: colorblindMode ? color.fillColorblind : color.fill,
                    }}
                  />
                );
              },
            )}
            <path
              className="tw:stroke-card-ink"
              d={`M ${legX.x} ${legX.y} L ${legY.x} ${legY.y}`}
              strokeLinecap="round"
              strokeWidth={COLOR_TRIANGLE_OUTLINE_WIDTH}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * The arrow on a card of a suit that is played in another order than up, in the card's own units:
 * a shaft with a head, in the bottom-right corner.
 */
const DIRECTION_ARROW = {
  width: 50,
  height: 80,
  shaftWidth: 18,
  headLength: 32,
  outlineWidth: 7,
} as const;

/**
 * Which way the arrow on a card points, or `undefined` for no arrow, as on the classic screen. A
 * reversed suit always points down. In "Up or Down" variants, a suit points the way that its play
 * stack goes, once the stack has chosen a direction.
 */
function getDirectionArrow(
  variant: Variant,
  suit: Suit,
  stackDirection: StackDirection | undefined,
): "up" | "down" | undefined {
  if (!hasReversedSuits(variant)) {
    return undefined;
  }

  if (variant.upOrDown) {
    switch (stackDirection) {
      case StackDirection.Up: {
        return "up";
      }

      case StackDirection.Down: {
        return "down";
      }

      default: {
        return undefined;
      }
    }
  }

  return suit.reversed ? "down" : undefined;
}

/**
 * The arrow in the bottom-right corner of a card of a reversed suit, or of a suit in an "Up or
 * Down" variant, which says which way its stack is played. It has the suit's colors, from top to
 * bottom, with one outline around the shaft and the head.
 */
function DirectionArrow({
  direction,
  suit,
  colorblindMode,
}: {
  readonly direction: "up" | "down";
  readonly suit: Suit;
  readonly colorblindMode: boolean;
}): React.JSX.Element {
  const gradientId = useId();
  const { width, height, shaftWidth, headLength, outlineWidth } =
    DIRECTION_ARROW;
  const inset = CORNER_INSET_PER_WIDTH * CARD_W;
  const left = CARD_W - inset - width;
  const top = CARD_H - inset - height;
  const middle = left + width / 2;
  const shaftLeft = middle - shaftWidth / 2;
  const shaftRight = middle + shaftWidth / 2;

  // The arrow points down, and is flipped to point up. Its points are flipped rather than the whole
  // shape, so that the colors keep their order from top to bottom.
  function flip(y: number) {
    return direction === "down" ? y : 2 * top + height - y;
  }
  const headStart = top + height - headLength;
  const d = [
    `M ${shaftLeft} ${flip(top)}`,
    `H ${shaftRight}`,
    `V ${flip(headStart)}`,
    `H ${left + width}`,
    `L ${middle} ${flip(top + height)}`,
    `L ${left} ${flip(headStart)}`,
    `H ${shaftLeft}`,
    "Z",
  ].join(" ");

  const solidFill = colorblindMode ? suit.fillColorblind : suit.fill;
  const fill =
    suit.fillColors === undefined ? solidFill : `url(#${gradientId})`;

  return (
    <svg
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:size-full"
      data-direction-arrow={direction}
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
    >
      {suit.fillColors !== undefined && (
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1={0}
          x2={0}
          y1={top}
          y2={top + height}
        >
          {suit.fillColors.map((color, i, colors) => (
            <stop
              key={color}
              offset={i / (colors.length - 1)}
              style={{ stopColor: color }}
            />
          ))}
        </linearGradient>
      )}
      {/* The stroke is drawn first and is twice as wide, so the fill covers its inner half. */}
      <path
        className="tw:stroke-card-ink"
        d={d}
        paintOrder="stroke"
        strokeLinejoin="round"
        strokeWidth={2 * outlineWidth}
        style={{ fill }}
      />
    </svg>
  );
}

/**
 * The back of a card: dark ink with a faint diagonal lattice, so that a pile of them reads as
 * face-down cards. The deck and a card with a "blank" note use it.
 */
export const CARD_BACK_STYLE = {
  backgroundColor: "var(--card-ink)",
  backgroundImage: [
    "repeating-linear-gradient(45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
    "repeating-linear-gradient(-45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
  ].join(", "),
} as const;

/** The front of a card, as it shows in a hand, on a play stack, or in the discard pile. */
export function CardFace({
  variant,
  colorblindMode,
  suitIndex,
  rank,
  width,
  clued = false,
  critical = false,
  trash = false,
  noteBorder,
  noteMark,
  trashIcon = false,
  note = false,
  noteHtml,
  noteUnread = false,
  identityFromNote = false,
  raiseClued = false,
  highlighted = false,
  pips,
  blank = false,
  doubleDiscard = false,
  stackDirection,
  clueMarker,
}: CardFaceProps): React.JSX.Element {
  const suit = suitIndex === undefined ? undefined : variant.suits[suitIndex];
  const faceColors = getFaceColors(variant, suit, rank, colorblindMode);
  const height = width * CARD_HEIGHT_PER_WIDTH;
  const bubble = pips?.bubble;
  const [hovered, setHovered] = useState<HTMLElement>();
  const raise = clued && raiseClued ? width * CLUED_RAISE_PER_WIDTH : 0;

  // The pips go in the middle of the card, or, under a rank, in the middle of the space between the
  // rank and the bottom of the card.
  const pipsTop =
    rank === undefined
      ? 0
      : width * (RANK_BOTTOM_PER_WIDTH + RANK_PIP_GAP_PER_WIDTH);
  const pipsBottom =
    rank === undefined ? height : height - width * CORNER_INSET_PER_WIDTH;
  const pipsCenterY = (pipsTop + pipsBottom) / 2;

  const statusBadge = getStatusBadge(critical, trashIcon, doubleDiscard);
  const arrow =
    suit === undefined || blank
      ? undefined
      : getDirectionArrow(variant, suit, stackDirection);

  // Clued cards get a thick border in the clue color, with a dark line inside it so that it stands
  // out against faces of a similar color. Other cards get a dark line and a shadow, so that they
  // stand out against the green felt. Cards that a chosen clue would touch get a white outline
  // outside of it.
  let border = "tw:ring-1 tw:ring-black/45";
  if (clued) {
    border = "tw:ring-4 tw:ring-clue tw:inset-ring-2 tw:inset-ring-card-ink";
  } else if (noteBorder !== undefined) {
    border = NOTE_BORDER_CLASSES[noteBorder];
  }
  const outline = highlighted
    ? "tw:outline-4 tw:outline-offset-4 tw:outline-white"
    : "";
  // A card with a "blank" note shows its back, as on the classic screen, with a frame inside its
  // edge like the deck's.
  const surface = blank
    ? "tw:shadow-[inset_0_0_0_3px_var(--card-ink),inset_0_0_0_4px_rgb(255_255_255/18%),0_3px_8px_rgb(0_0_0/35%)]"
    : `tw:shadow-[0_3px_8px_rgb(0_0_0/35%)] ${faceColors.className}`;

  const face = (
    <div
      // A card that a clue newly touches slides up to its raised place, without a bounce.
      className={`tw:relative tw:shrink-0 tw:transition-transform tw:duration-200 tw:ease-out ${surface} ${border} ${outline}`}
      data-card-blank={blank ? true : undefined}
      // A played card that its holder did not know turns over on its way to the stack (see
      // "playMotion.ts").
      data-card-face
      data-card-unknown={
        suitIndex === undefined || rank === undefined ? true : undefined
      }
      // The card tracks the pointer even without a bubble, so that the bubble opens when the card
      // gets one under the pointer, such as when the viewer holds the pointer down on a hand to see
      // its holder's view.
      onPointerEnter={(event) => {
        setHovered(event.currentTarget);
      }}
      onPointerLeave={() => {
        setHovered(undefined);
      }}
      style={{
        width,
        height,
        borderRadius: width * CARD_CORNER_PER_WIDTH,
        ...(blank
          ? CARD_BACK_STYLE
          : {
              background: faceColors.background,
              color: faceColors.ink,
            }),
        transform: `translateY(${-raise}px)`,
        opacity: trash ? TRASH_CARD_OPACITY : 1,
      }}
    >
      {clueMarker !== undefined && (
        <ClueMarker marker={clueMarker} width={width} />
      )}
      {suit !== undefined && suit.clueColors.length > 1 && (
        <DualColorTriangles
          colorblindMode={colorblindMode}
          colors={suit.clueColors}
          width={width}
        />
      )}
      {(rank !== undefined || (suit !== undefined && colorblindMode)) && (
        <CardCorner
          deceptiveRank={
            suitIndex === undefined
              ? undefined
              : getDeceptiveRank(variant, suitIndex, rank)
          }
          ink={getRankInk(variant, suit, rank)}
          rank={rank}
          showTurnedOver={
            suit === undefined && pips === undefined && arrow === undefined
          }
          suitLetter={
            suit !== undefined && colorblindMode
              ? getSuitAbbreviationForVariant(suit, variant)
              : undefined
          }
        />
      )}

      {suit !== undefined
        && getFacePips(rank).map((pip) => (
          <div
            className="tw:absolute"
            key={`${pip.x} ${pip.y}`}
            style={{
              left: width / 2 + width * (pip.x - pip.size / 2),
              top: pipsCenterY + width * (pip.y - pip.size / 2),
              transform: pip.turned ? "rotate(180deg)" : undefined,
            }}
          >
            <Pip shadow size={width * pip.size} suit={suit} variant={variant} />
          </div>
        ))}

      {arrow !== undefined && suit !== undefined && (
        <DirectionArrow
          colorblindMode={colorblindMode}
          direction={arrow}
          suit={suit}
        />
      )}

      {statusBadge !== undefined && (
        <StatusBadge badge={statusBadge} width={width} />
      )}

      {note && (
        <NoteBadge
          pencil={identityFromNote}
          unread={noteUnread}
          width={width}
        />
      )}

      {pips !== undefined && (
        <Possibilities
          badgeShown={statusBadge !== undefined || arrow !== undefined}
          pips={pips}
          rankShown={rank !== undefined}
          variant={variant}
          width={width}
        />
      )}

      {noteMark !== undefined && <NoteMarkIcon mark={noteMark} width={width} />}

      {bubble?.inexact === true && <PossibleCardsMark width={width} />}

      {bubble !== undefined
        && hovered !== undefined
        && createPortal(
          <PossibleCardsBubble
            anchor={hovered}
            bubble={bubble}
            colorblindMode={colorblindMode}
            noteHtml={noteHtml}
            variant={variant}
          />,
          document.body,
        )}
    </div>
  );

  if (!trash) {
    return face;
  }

  // A faded card lets the felt show through it. A blurred copy of the felt sits behind it, so that
  // the card blends into smooth green rather than into the texture.
  return (
    <div className="tw:relative tw:shrink-0">
      <div
        aria-hidden="true"
        className="tw:pointer-events-none tw:absolute tw:inset-0 tw:backdrop-blur-lg tw:transition-transform tw:duration-200 tw:ease-out"
        style={{
          borderRadius: width * CARD_CORNER_PER_WIDTH,
          transform: `translateY(${-raise}px)`,
        }}
      />
      {face}
    </div>
  );
}
