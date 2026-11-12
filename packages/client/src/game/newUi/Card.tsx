import type { Rank, Suit, SuitIndex, Variant } from "@hanabi-live/game";
import { START_CARD_RANK } from "@hanabi-live/game";
import { START_CARD_RANK_LABEL } from "../../constants.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import { CARD_H, CARD_W } from "../ui/constants.ts";
import { Pip } from "./Pip.tsx";

/** Cards keep the proportions of the classic card images. */
export const CARD_HEIGHT_PER_WIDTH = CARD_H / CARD_W;

/** How far a clued card in a hand sits above the others, as a fraction of the card's width. */
const CLUED_RAISE_PER_WIDTH = 0.12;

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

/** Trash cards fade far enough to stand apart from the cards that still matter. */
const TRASH_OPACITY = 0.25;

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

function roundToEven(value: number): number {
  return 2 * Math.round(value / 2);
}

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
  // Whole, even sizes, and a left edge on a whole pixel, keep the point centered under the disc.
  // The browser snaps the disc to whole pixels, but draws the rotated point where it falls.
  const size = roundToEven(width * CLUE_TOKEN_SIZE_PER_WIDTH);
  const point = roundToEven(size * 0.34);
  const color = getClueMarkerColor(marker);
  let label = "";
  if (marker.type === "rank") {
    ({ label } = marker);
  } else if (marker.type === "hidden") {
    label = "?";
  }

  return (
    <span
      aria-hidden="true"
      className="tw:pointer-events-none tw:absolute tw:z-10"
      data-clue-marker
      style={{
        top: -size * CLUE_TOKEN_PART_ABOVE_CARD,
        left: `round(down, calc(50% - ${size / 2}px), 1px)`,
        width: size,
        height: size,
      }}
    >
      <span
        className="tw:absolute tw:left-1/2 tw:rotate-45 tw:bg-white tw:shadow-[0_0_0_2px_var(--card-ink)]"
        style={{
          width: point,
          height: point,
          bottom: -point * 0.38,
          marginLeft: -point / 2,
        }}
      />
      <span
        className="tw:absolute tw:inset-0 tw:box-border tw:flex tw:items-center tw:justify-center tw:rounded-full tw:border-solid tw:border-white tw:font-extrabold tw:leading-none tw:text-card-ink tw:shadow-[0_0_0_2px_var(--card-ink),0_3px_8px_rgb(0_0_0/60%)]"
        style={{
          borderWidth: size * 0.1,
          background: color,
          fontSize: size * 0.66,
        }}
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
  raiseClued = false,
  highlighted = false,
  possibleSuitIndexes = [],
  possibleRanks = [],
  clueMarker,
}: CardFaceProps): React.JSX.Element {
  const suit = suitIndex === undefined ? undefined : variant.suits[suitIndex];
  const faceColors = getFaceColors(suit, colorblindMode);
  const height = width * CARD_HEIGHT_PER_WIDTH;
  const raise = clued && raiseClued ? width * CLUED_RAISE_PER_WIDTH : 0;

  // A row of possibilities with one entry or none tells the holder nothing new, so it is left out.
  const showSuitPips = possibleSuitIndexes.length > 1;
  const showRankPips = possibleRanks.length > 1;

  // Clued cards get a thick border in the clue color, with a dark line inside it so that it stands
  // out against faces of a similar color. Cards that a chosen clue would touch get a white outline
  // outside of it.
  const border = clued
    ? "tw:ring-4 tw:ring-clue tw:inset-ring-2 tw:inset-ring-card-ink"
    : "tw:ring-1 tw:ring-black/35";
  const outline = highlighted
    ? "tw:outline-4 tw:outline-offset-4 tw:outline-white"
    : "";

  return (
    <div
      className={`tw:relative tw:shrink-0 tw:select-none ${border} ${outline} ${faceColors.className}`}
      // A played card that its holder did not know turns over on its way to the stack (see
      // "playMotion.ts").
      data-card-face
      data-card-unknown={
        suitIndex === undefined || rank === undefined ? true : undefined
      }
      style={{
        width,
        height,
        borderRadius: width * 0.14,
        background: faceColors.background,
        color: faceColors.ink,
        transform: `translateY(${-raise}px)`,
        opacity: trash ? TRASH_OPACITY : 1,
      }}
    >
      {clueMarker !== undefined && (
        <>
          <ClueMarker marker={clueMarker} width={width} />
          {/* The card flashes as the token lands on it. */}
          <span
            className="tw:pointer-events-none tw:absolute tw:inset-0 tw:rounded-[inherit] tw:bg-white tw:opacity-0"
            data-clue-flash
          />
        </>
      )}
      {rank !== undefined && (
        <span
          className="tw:absolute tw:font-extrabold tw:leading-none"
          style={{
            left: width * 0.1,
            top: width * 0.05,
            fontSize: width * 0.46,
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
