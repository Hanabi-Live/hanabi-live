import type { Rank, Suit, SuitIndex, Variant } from "@hanabi-live/game";
import { START_CARD_RANK } from "@hanabi-live/game";
import { START_CARD_RANK_LABEL } from "../../constants.ts";
import { CARD_H, CARD_W } from "../ui/constants.ts";
import { Pip } from "./Pip.tsx";

/** Cards keep the proportions of the classic card images. */
export const CARD_HEIGHT_PER_WIDTH = CARD_H / CARD_W;

/** How far a clued card in a hand sits above the others, as a fraction of the card's width. */
const CLUED_RAISE_PER_WIDTH = 0.12;

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

  if (suit.fill === "multi") {
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
}: CardFaceProps): React.JSX.Element {
  const suit = suitIndex === undefined ? undefined : variant.suits[suitIndex];
  const faceColors = getFaceColors(suit, colorblindMode);
  const height = width * CARD_HEIGHT_PER_WIDTH;
  const raise = clued && raiseClued ? width * CLUED_RAISE_PER_WIDTH : 0;

  // A row of possibilities with one entry or none tells the holder nothing new, so it is left out.
  const showSuitPips = possibleSuitIndexes.length > 1;
  const showRankPips = possibleRanks.length > 1;
  const smallPipSize = width * 0.17;

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
        <span
          className={`tw:absolute tw:flex tw:items-center tw:justify-center tw:rounded-full tw:font-extrabold tw:text-white ${
            critical ? "tw:bg-critical" : "tw:bg-game-line"
          }`}
          style={{
            right: width * 0.06,
            top: width * 0.06,
            width: width * 0.3,
            height: width * 0.3,
            fontSize: width * 0.22,
            boxShadow: "0 0 0 1.5px white",
          }}
          title={critical ? "Last copy" : "Trash"}
        >
          {critical ? (
            "!"
          ) : (
            <i aria-hidden="true" className="fas fa-trash-alt" />
          )}
        </span>
      )}

      {(showSuitPips || showRankPips) && (
        <div
          className="tw:absolute tw:flex tw:flex-col tw:items-center"
          style={{
            left: width * 0.05,
            right: width * 0.05,
            bottom: width * 0.08,
            gap: width * 0.05,
          }}
        >
          {showSuitPips && (
            <div className="tw:flex tw:flex-wrap tw:justify-center">
              {possibleSuitIndexes.map((possibleSuitIndex) => {
                const possibleSuit = variant.suits[possibleSuitIndex];
                return possibleSuit === undefined ? undefined : (
                  <Pip
                    key={possibleSuitIndex}
                    size={smallPipSize}
                    suit={possibleSuit}
                    variant={variant}
                  />
                );
              })}
            </div>
          )}
          {showRankPips && (
            <div
              className="tw:flex tw:font-bold tw:leading-none"
              style={{ gap: width * 0.06, fontSize: width * 0.17 }}
            >
              {possibleRanks.map((possibleRank) => (
                <span key={possibleRank}>{getRankLabel(possibleRank)}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
