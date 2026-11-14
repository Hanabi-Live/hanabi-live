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

/** How far the rank in a card's corner is from the card's top edge, as a fraction of its width. */
const RANK_TOP_PER_WIDTH = 0.08;

/** The size of the rank in a card's corner, as a fraction of the card's width. */
const RANK_SIZE_PER_WIDTH = 0.46;

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

/**
 * The panel in the suit's color, inside the paper margin of a card face, in fractions of the card's
 * width. Its corners are tighter than the card's, as on a printed card.
 */
const FACE_PANEL = { inset: 0.05, corner: 0.03 } as const;

/** How much of a suit's color tints the panel of a card face. The rest is white. */
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

  /** Whether a clued card sits higher than the others, as it does in a hand. */
  readonly raiseClued?: boolean;

  /** Marks a card that the clue being chosen would touch. */
  readonly highlighted?: boolean;

  readonly possibleSuitIndexes?: readonly SuitIndex[];
  readonly possibleRanks?: readonly Rank[];

  /** The clue that touched the card on the turn that shows, like the classic screen's arrows. */
  readonly clueMarker?: ClueMarkerView;

  /**
   * The folded corner of a card with a note, which its tooltip shows: "identity" when the note
   * changes the suit or rank that the face shows, and "note" for any other note.
   */
  readonly noteFold?: NoteFoldKind;
  readonly noteFoldCorner?: NoteFoldCorner;
}

/** The color that stands for a clue on the screen: its own color, or white for a rank. */
export function getClueMarkerColor(marker: ClueMarkerView): string {
  return marker.type === "color" ? marker.fill : "white";
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
  let label = "";
  if (marker.type === "rank") {
    ({ label } = marker);
  } else if (marker.type === "hidden") {
    label = "?";
  }

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

/**
 * The badge in the corner of a card. A red badge with an exclamation mark shows the last copy of a
 * card that is still needed. A gray badge with a trash can shows a card that is known to be trash.
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
        right: width * 0.06,
        top: width * 0.06,
        width: width * 0.3,
        height: width * 0.3,
        fontSize: width * 0.22,
        boxShadow: "0 0 0 1.5px white",
      }}
    >
      {critical ? "!" : <i aria-hidden="true" className="fas fa-trash-alt" />}
    </span>
  );
}

export type NoteFoldKind = "note" | "identity";

/** Which corner of a card folds over: one that stays in view where cards overlap. */
type NoteFoldCorner = "bottomRight" | "topLeft";

/**
 * How far a folded corner reaches along each edge, as a fraction of the card's width, and the least
 * reach in CSS pixels, so that it shows on small cards. The fold stays clear of the possibilities,
 * which keep `POSSIBILITIES.inset` from the edges, and it reaches past the rounded corner, so that
 * the fold is a straight line.
 */
const NOTE_FOLD = { reach: 0.18, minReach: 10 } as const;

/**
 * The size of the folded corner of a card with a note, in CSS pixels. Larger than the corner's
 * rounding, so that the fold cuts a straight line.
 */
function getNoteFoldReach(width: number): number {
  return Math.max(width * NOTE_FOLD.reach, NOTE_FOLD.minReach);
}

/**
 * The `clip-path` that cuts off the folded corner of a card. The cut line sits just outside the
 * fold, so that the whole border of the flap along the fold shows. It keeps everything else that
 * the card draws outside of its edges, such as its border and its clue marker.
 */
function getNoteFoldClipPath(
  corner: NoteFoldCorner,
  width: number,
  height: number,
  clued: boolean,
): string {
  // Far enough out to keep everything that the card draws outside of its edges.
  const far = Math.max(width, height) * 2;
  // The outer half of the flap's border is outside the fold.
  const offset = (getNoteFoldBorder(clued).strokeWidth / 2) * Math.SQRT2;
  const reach = getNoteFoldReach(width);
  if (corner === "bottomRight") {
    // Keep the points where x + y is less than this.
    const sum = width + height - reach + offset;
    return `polygon(${-far}px ${-far}px, ${width + far}px ${-far}px, ${width + far}px ${sum - width - far}px, ${sum - height - far}px ${height + far}px, ${-far}px ${height + far}px)`;
  }

  // Keep the points where x + y is more than this.
  const sum = reach - offset;
  return `polygon(${sum + far}px ${-far}px, ${width + far}px ${-far}px, ${width + far}px ${height + far}px, ${-far}px ${height + far}px, ${-far}px ${sum + far}px)`;
}

/** The border of the folded corner, like the card's border (see `CardFace`). */
function getNoteFoldBorder(clued: boolean): {
  readonly stroke: string;
  readonly strokeWidth: number;
} {
  return clued
    ? { stroke: "var(--clue-border)", strokeWidth: CLUED_BORDER_WIDTH / 2 }
    : { stroke: "rgb(0 0 0 / 45%)", strokeWidth: 1 };
}

const NOTE_FOLD_COLORS = {
  // The back of the paper.
  note: "var(--game-screen-text)",
  // Dark, so that a card that a note shows as known does not pass for one that the player knows.
  identity: "var(--card-ink)",
} as const satisfies Record<NoteFoldKind, string>;

/**
 * The folded corner of a card with a note, as on a page that someone marked. It is inside the card,
 * so that it plainly belongs to that card. Its edges have the card's border, so that the border
 * runs around the card and the flap as one shape. A light flap marks a note, and a dark flap marks
 * a note that changes the suit or rank on the face.
 */
function NoteFold({
  kind,
  corner,
  width,
  clued,
}: {
  readonly kind: NoteFoldKind;
  readonly corner: NoteFoldCorner;
  readonly width: number;
  readonly clued: boolean;
}): React.JSX.Element {
  const reach = getNoteFoldReach(width);
  const { stroke, strokeWidth } = getNoteFoldBorder(clued);
  return (
    <svg
      aria-label={
        kind === "identity"
          ? "Has a note that sets the suit or rank shown"
          : "Has a note"
      }
      className="tw:pointer-events-none tw:absolute tw:overflow-visible"
      data-note-fold={kind}
      height={reach}
      role="img"
      style={{
        ...(corner === "bottomRight"
          ? { right: 0, bottom: 0 }
          : { left: 0, top: 0, rotate: "180deg" }),
        // The flap lifts off the card a little.
        filter: "drop-shadow(-1.5px -1.5px 2px rgb(0 0 0 / 45%))",
      }}
      viewBox={`0 0 ${reach} ${reach}`}
      width={reach}
    >
      {/* The flap is the cut-off corner, folded over the fold line onto the card. */}
      <polygon
        fill={NOTE_FOLD_COLORS[kind]}
        points={`0,0 ${reach},0 0,${reach}`}
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
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
): {
  className: string;
  panelClassName?: string;
  background?: string;
  ink?: string;
} {
  if (suit === undefined) {
    return {
      className: "tw:text-card-ink",
      panelClassName: "tw:bg-card-unknown",
    };
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
  raiseClued = false,
  highlighted = false,
  possibleSuitIndexes = [],
  possibleRanks = [],
  clueMarker,
  noteFold,
  noteFoldCorner = "bottomRight",
}: CardFaceProps): React.JSX.Element {
  const suit = suitIndex === undefined ? undefined : variant.suits[suitIndex];
  const faceColors = getFaceColors(suit, colorblindMode);
  const height = width * CARD_HEIGHT_PER_WIDTH;
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
      className={`tw:relative tw:shrink-0 tw:shadow-[0_3px_8px_rgb(0_0_0/35%)] tw:transition-transform tw:duration-200 tw:ease-out tw:select-none tw:bg-card-paper ${border} ${outline} ${faceColors.className}`}
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
        color: faceColors.ink,
        transform: `translateY(${-raise}px)`,
        opacity: trash ? TRASH_CARD_OPACITY : 1,
        clipPath:
          noteFold === undefined
            ? undefined
            : getNoteFoldClipPath(noteFoldCorner, width, height, clued),
      }}
    >
      {/* The panel in the suit's color, with a thin line around it, inside the paper margin. */}
      <div
        className={`tw:absolute tw:inset-ring-1 tw:inset-ring-black/20 ${faceColors.panelClassName ?? ""}`}
        style={{
          inset: width * FACE_PANEL.inset,
          borderRadius: width * FACE_PANEL.corner,
          background: faceColors.background,
        }}
      />
      {clueMarker !== undefined && (
        <ClueMarker marker={clueMarker} width={width} />
      )}
      {rank !== undefined && (
        <span
          className="tw:absolute tw:font-extrabold tw:leading-none"
          style={{
            left: width * 0.12,
            top: width * RANK_TOP_PER_WIDTH,
            fontSize: width * RANK_SIZE_PER_WIDTH,
          }}
        >
          {getRankLabel(rank)}
        </span>
      )}

      {suit !== undefined && (
        <div
          className="tw:absolute tw:flex tw:justify-center"
          style={{ left: 0, right: 0, top: height * 0.42 }}
        >
          <Pip size={width * 0.5} suit={suit} variant={variant} />
        </div>
      )}

      {(critical || trashIcon) && (
        <StatusBadge critical={critical} width={width} />
      )}

      {noteFold !== undefined && (
        <NoteFold
          clued={clued}
          corner={noteFoldCorner}
          kind={noteFold}
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
