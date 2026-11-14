import type { Rank, Suit, SuitIndex, Variant } from "@hanabi-live/game";
import { START_CARD_RANK } from "@hanabi-live/game";
import { START_CARD_RANK_LABEL } from "../../constants.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { CARD_H, CARD_W } from "../ui/constants.ts";
import { Pip } from "./Pip.tsx";

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

/** How far the rank in a card's corner is from the card's left edge, as a fraction of its width. */
const RANK_LEFT_PER_WIDTH = 0.1;

/** How far the rank in a card's corner is from the card's top edge, as a fraction of its width. */
const RANK_TOP_PER_WIDTH = 0.05;

/** The size of the rank in a card's corner, as a fraction of the card's width. */
const RANK_SIZE_PER_WIDTH = 0.46;

/**
 * The size of the suit's pip, as a fraction of the card's width. It is in the middle of the card,
 * between the rank in the corner and the same rank turned over in the opposite corner.
 */
const SUIT_PIP_SIZE_PER_WIDTH = 0.5;

/** How far the bottom of the rank in a card's corner is from the card's top edge. */
export const RANK_BOTTOM_PER_WIDTH = RANK_TOP_PER_WIDTH + RANK_SIZE_PER_WIDTH;

/** The width of the border in the clue color around a clued card (`tw:ring-4`), in CSS pixels. */
export const CLUED_BORDER_WIDTH = 4;

/**
 * The width of the token that marks a card that a clue touched, as a fraction of the card's width.
 */
const CLUE_TOKEN_SIZE_PER_WIDTH = 0.46;

/** How much of the token is above the card's top edge. The rest overlaps the card. */
const CLUE_TOKEN_PART_ABOVE_CARD = 0.8;

/**
 * How far a clue token reaches above the place where its card rests in a hand, as a fraction of the
 * card's width. (A touched card is clued, so it is also raised.) A hand whose name sits above its
 * cards leaves this much room between them.
 */
export const CLUE_TOKEN_REACH_PER_WIDTH =
  CLUE_TOKEN_SIZE_PER_WIDTH * CLUE_TOKEN_PART_ABOVE_CARD
  + CLUED_RAISE_PER_WIDTH;

/**
 * The clue that a marker on a card shows: a color, a rank, or a clue that the viewer may not see
 * (in some variants).
 */
export type ClueMarkerView =
  | { readonly type: "color"; readonly name: string; readonly fill: string }
  | { readonly type: "rank"; readonly label: string }
  | { readonly type: "hidden" };

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
  readonly trashIcon?: boolean;

  /** Whether the card has a note that the viewer can read. */
  readonly note?: boolean;

  /** Whether someone else changed the note while we spectate, and we have not read it since. */
  readonly noteUnread?: boolean;

  /** Whether the note decides the suit or the rank that the card shows. */
  readonly identityFromNote?: boolean;

  /** Whether a clued card sits higher than the others, as it does in a hand. */
  readonly raiseClued?: boolean;

  /** Marks a card that the clue being chosen would touch. */
  readonly highlighted?: boolean;

  readonly possibleSuitIndexes?: readonly SuitIndex[];
  readonly possibleRanks?: readonly Rank[];

  /** The clue that touched the card on the turn that shows, like the classic screen's arrows. */
  readonly clueMarker?: ClueMarkerView;
}

/** The color that stands for a clue on the screen: its own color, or white for a rank. */
export function getClueMarkerColor(marker: ClueMarkerView): string {
  return marker.type === "color" ? marker.fill : "white";
}

/** The text on a clue token: the clue's number, "?" for a hidden clue, and none for a color. */
export function getClueMarkerLabel(marker: ClueMarkerView): string {
  switch (marker.type) {
    case "color": {
      return "";
    }

    case "rank": {
      return marker.label;
    }

    case "hidden": {
      return "?";
    }
  }
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

/** The radius of the disc in the clue's color, inside the white ring, in the same units. */
const PIN_DISC_RADIUS = 40;

/** The width of the dark outline around a clue token, in CSS pixels. */
const PIN_OUTLINE_WIDTH = 2;

/**
 * A token that sits on the top edge of a card that a clue touched, with a point toward the card. It
 * shows the clue: a disc of the clue's color, or a white disc with the clue's number. The "data-"
 * attributes let it land on the card when the clue is given (see "cardMotion.ts").
 */
function ClueMarker({
  marker,
  width,
}: {
  readonly marker: ClueMarkerView;
  readonly width: number;
}): React.JSX.Element {
  const size = Math.round(width * CLUE_TOKEN_SIZE_PER_WIDTH);
  const label = getClueMarkerLabel(marker);

  return (
    <span
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:left-1/2 tw:z-10"
      data-clue-marker
      style={{
        top: -size * CLUE_TOKEN_PART_ABOVE_CARD,
        marginLeft: -size / 2,
        width: size,
        height: size,
      }}
    >
      {/* One path for the whole outline, so that the disc and the point share it. The stroke is
          drawn first and is twice as wide, so the fill covers its inner half. */}
      <svg
        className="tw:absolute tw:top-0 tw:left-0 tw:overflow-visible tw:drop-shadow-[0_3px_8px_rgb(0_0_0/60%)]"
        height={(size * PIN_TIP_Y) / (2 * PIN_RADIUS)}
        viewBox={`0 0 ${2 * PIN_RADIUS} ${PIN_TIP_Y}`}
        width={size}
      >
        <path
          className="tw:fill-white tw:stroke-card-ink"
          d={PIN_PATH}
          paintOrder="stroke"
          strokeWidth={2 * PIN_OUTLINE_WIDTH}
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
        style={{ fontSize: size * 0.66 }}
      >
        {label}
      </span>
    </span>
  );
}

/** What the badge in the corner of a card means, in the site's tooltip style. */
const STATUS_TOOLTIP = {
  critical: "The last copy of this card. Do not discard it.",
  trash: "Known trash. This card can never be played.",
} as const;

/** The size of a badge in the corner of a card, and its gap from the edges, per card width. */
const BADGE_SIZE_PER_WIDTH = 0.3;
const BADGE_INSET_PER_WIDTH = 0.06;

/** The style of a round badge in a corner of a card. */
function getBadgeStyle(
  width: number,
  corner: "topRight" | "bottomLeft",
): React.CSSProperties {
  const inset = width * BADGE_INSET_PER_WIDTH;
  return {
    ...(corner === "topRight"
      ? { right: inset, top: inset }
      : { left: inset, bottom: inset }),
    width: width * BADGE_SIZE_PER_WIDTH,
    height: width * BADGE_SIZE_PER_WIDTH,
    fontSize: width * 0.22,
  };
}

/**
 * The badge in the bottom-left corner of a card, as on the classic screen. A red badge with an
 * exclamation mark shows the last copy of a card that is still needed. A gray badge with a trash
 * can shows a card that is known to be trash.
 */
function StatusBadge({
  critical,
  width,
}: {
  readonly critical: boolean;
  readonly width: number;
}): React.JSX.Element {
  return (
    <span
      aria-label={critical ? "Last copy" : "Trash"}
      className={`tw:absolute tw:flex tw:items-center tw:justify-center tw:rounded-full tw:font-extrabold tw:text-white ${
        critical ? "tw:bg-critical" : "tw:bg-game-line"
      }`}
      // The badge is on a card that people click, so its tooltip waits like the card's buttons.
      ref={tooltipRef(
        critical ? STATUS_TOOLTIP.critical : STATUS_TOOLTIP.trash,
      )}
      role="img"
      style={{
        ...getBadgeStyle(width, "bottomLeft"),
        boxShadow: "0 0 0 1.5px white",
      }}
    >
      {critical ? "!" : <i aria-hidden="true" className="fas fa-trash-alt" />}
    </span>
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
  halfThickness: 12,
  coneEnd: 26,
  tipEnd: 9,
  capStart: 80,
} as const;

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
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
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
} as const;

/**
 * What the holder of a card knows about it: the suits and ranks that it can still be. They fill the
 * card, so that they are easy to read at a glance. Each suit is a pip on a white chip, which stands
 * out on the gray face of an unknown card, and each rank is a dark chip with a white number.
 */
function Possibilities({
  variant,
  width,
  possibleSuitIndexes,
  possibleRanks,
  rankShown,
  suitShown,
}: {
  readonly variant: Variant;
  readonly width: number;
  readonly possibleSuitIndexes: readonly SuitIndex[];
  readonly possibleRanks: readonly Rank[];
  /** Whether the card shows its rank in the corner, so that the possibilities go below it. */
  readonly rankShown: boolean;
  /** Whether the card shows its suit in the middle, so that the ranks go below it. */
  readonly suitShown: boolean;
}): React.JSX.Element {
  const { inset, topWithRank, topWithoutRank, gap, maxPip, maxChip } =
    POSSIBILITIES;
  const innerWidth = width * (1 - 2 * inset);

  const chipSize = Math.min(
    width * maxChip,
    (innerWidth - (possibleRanks.length - 1) * width * 0.03)
      / Math.max(possibleRanks.length, 1),
  );

  // The suits take the rest of the card's height. They go in as many columns as make the pips the
  // largest, such as two columns of three for six suits.
  const top = width * (rankShown ? topWithRank : topWithoutRank);
  const rankRowHeight =
    possibleRanks.length > 0 ? chipSize * 1.1 + width * gap : 0;
  const suitsHeight =
    width * CARD_HEIGHT_PER_WIDTH - top - width * inset - rankRowHeight;
  const suitCount = Math.max(possibleSuitIndexes.length, 1);
  let suitColumns = 1;
  let pipCell = 0;
  for (let columns = 1; columns <= suitCount; columns++) {
    const rows = Math.ceil(suitCount / columns);
    const cell = Math.min(
      innerWidth / columns,
      suitsHeight / rows,
      width * maxPip,
    );
    if (cell > pipCell) {
      pipCell = cell;
      suitColumns = columns;
    }
  }

  return (
    <div
      className={`tw:absolute tw:flex tw:flex-col tw:items-center ${
        suitShown ? "tw:justify-end" : "tw:justify-center"
      }`}
      style={{
        left: width * inset,
        right: width * inset,
        top,
        bottom: width * inset,
        gap: width * gap,
      }}
    >
      {possibleSuitIndexes.length > 0 && (
        // The rows wrap from the middle, so that a short last row is centered under the others.
        <div
          className="tw:flex tw:flex-wrap tw:justify-center"
          style={{ width: suitColumns * pipCell }}
        >
          {possibleSuitIndexes.map((possibleSuitIndex) => {
            const possibleSuit = variant.suits[possibleSuitIndex];
            return possibleSuit === undefined ? undefined : (
              <span
                className="tw:flex tw:items-center tw:justify-center"
                key={possibleSuitIndex}
                style={{ width: pipCell, height: pipCell }}
              >
                <span
                  className="tw:flex tw:items-center tw:justify-center tw:rounded-full tw:bg-white tw:shadow-[0_1px_2px_rgb(0_0_0/30%)]"
                  style={{ width: pipCell * 0.92, height: pipCell * 0.92 }}
                >
                  <Pip
                    size={pipCell * 0.74}
                    suit={possibleSuit}
                    variant={variant}
                  />
                </span>
              </span>
            );
          })}
        </div>
      )}
      {possibleRanks.length > 0 && (
        <div className="tw:flex" style={{ gap: width * 0.03 }}>
          {possibleRanks.map((possibleRank) => (
            <span
              className="tw:flex tw:items-center tw:justify-center tw:bg-card-ink tw:font-extrabold tw:leading-none tw:text-white"
              key={possibleRank}
              style={{
                width: chipSize,
                height: chipSize * 1.1,
                fontSize: chipSize * 0.72,
                borderRadius: chipSize * 0.25,
              }}
            >
              {getRankLabel(possibleRank)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Returns the colors of a card face for a suit, or the colors of an unknown card. The colors that
 * come from the theme are classes, since the theme does not define them as CSS variables.
 */
function getFaceColors(
  suit: Suit | undefined,
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
  return {
    className: "",
    background: `color-mix(in srgb, ${fill} ${FACE_TINT_PERCENT}%, white)`,
    ink: `color-mix(in srgb, ${fill} ${INK_PERCENT}%, black)`,
  };
}

export function getRankLabel(rank: Rank): string {
  return rank === START_CARD_RANK ? START_CARD_RANK_LABEL : rank.toString();
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
  if (suitName === undefined && rankLabel === undefined) {
    return "Unknown card";
  }

  return [suitName ?? "Unknown suit", rankLabel ?? "of unknown rank"].join(" ");
}

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
  trashIcon = false,
  note = false,
  noteUnread = false,
  identityFromNote = false,
  raiseClued = false,
  highlighted = false,
  possibleSuitIndexes = [],
  possibleRanks = [],
  clueMarker,
}: CardFaceProps): React.JSX.Element {
  const suit = suitIndex === undefined ? undefined : variant.suits[suitIndex];
  const faceColors = getFaceColors(suit, colorblindMode);
  const height = width * CARD_HEIGHT_PER_WIDTH;
  const suitPipSize = width * SUIT_PIP_SIZE_PER_WIDTH;
  const raise = clued && raiseClued ? width * CLUED_RAISE_PER_WIDTH : 0;

  // A row of possibilities with one entry or none tells the holder nothing new, so it is left out.
  const showSuitPips = possibleSuitIndexes.length > 1;
  const showRankPips = possibleRanks.length > 1;

  // Clued cards get a thick border in the clue color, with a dark line inside it so that it stands
  // out against faces of a similar color. Other cards get a dark line and a shadow, so that they
  // stand out against the green felt. Cards that a chosen clue would touch get a white outline
  // outside of it.
  const border = clued
    ? "tw:ring-4 tw:ring-clue tw:inset-ring-2 tw:inset-ring-card-ink"
    : "tw:ring-1 tw:ring-black/45";
  const outline = highlighted
    ? "tw:outline-4 tw:outline-offset-4 tw:outline-white"
    : "";

  return (
    <div
      // A card that a clue newly touches slides up to its raised place, without a bounce.
      className={`tw:relative tw:shrink-0 tw:shadow-[0_3px_8px_rgb(0_0_0/35%)] tw:transition-transform tw:duration-200 tw:ease-out tw:select-none ${border} ${outline} ${faceColors.className}`}
      // A played card that its holder did not know turns over on its way to the stack (see
      // "playMotion.ts").
      data-card-face
      data-card-unknown={
        suitIndex === undefined || rank === undefined ? true : undefined
      }
      style={{
        width,
        height,
        borderRadius: width * CARD_CORNER_PER_WIDTH,
        background: faceColors.background,
        color: faceColors.ink,
        transform: `translateY(${-raise}px)`,
        opacity: trash ? TRASH_CARD_OPACITY : 1,
      }}
    >
      {clueMarker !== undefined && (
        <ClueMarker marker={clueMarker} width={width} />
      )}
      {rank !== undefined && (
        <span
          className="tw:absolute tw:font-extrabold tw:leading-none"
          style={{
            left: width * RANK_LEFT_PER_WIDTH,
            top: width * RANK_TOP_PER_WIDTH,
            fontSize: width * RANK_SIZE_PER_WIDTH,
          }}
        >
          {getRankLabel(rank)}
        </span>
      )}

      {/* The rank again, turned over in the opposite corner, as on a playing card. The possibilities
          fill the bottom of the card, so it is left out when they show. */}
      {rank !== undefined && !showSuitPips && !showRankPips && (
        <span
          aria-hidden="true"
          className="tw:absolute tw:rotate-180 tw:font-extrabold tw:leading-none"
          style={{
            right: width * RANK_LEFT_PER_WIDTH,
            bottom: width * RANK_TOP_PER_WIDTH,
            fontSize: width * RANK_SIZE_PER_WIDTH,
          }}
        >
          {getRankLabel(rank)}
        </span>
      )}

      {suit !== undefined && (
        <div
          className="tw:absolute tw:flex tw:justify-center"
          style={{ left: 0, right: 0, top: (height - suitPipSize) / 2 }}
        >
          <Pip size={suitPipSize} suit={suit} variant={variant} />
        </div>
      )}

      {(critical || trashIcon) && (
        <StatusBadge critical={critical} width={width} />
      )}

      {note && (
        <NoteBadge
          pencil={identityFromNote}
          unread={noteUnread}
          width={width}
        />
      )}

      {(showSuitPips || showRankPips) && (
        <Possibilities
          possibleRanks={showRankPips ? possibleRanks : []}
          possibleSuitIndexes={showSuitPips ? possibleSuitIndexes : []}
          rankShown={rank !== undefined}
          suitShown={suit !== undefined}
          variant={variant}
          width={width}
        />
      )}
    </div>
  );
}
