// The achievements on a player's profile: what each one asks for, and how far the player has come.
// Each one shows the cards of the suit that it is about.

import type { publicPageTableSchema } from "@hanabi-live/data";
import { MIN_ACHIEVEMENT_PLAYERS } from "@hanabi-live/data";
import type { Variant } from "@hanabi-live/game";
import { getVariant } from "@hanabi-live/game";
import type * as z from "zod";
import {
  CARD_CORNER_PER_WIDTH,
  CARD_HEIGHT_PER_WIDTH,
} from "../game/newUi/Card.tsx";
import { Pip } from "../game/newUi/Pip.tsx";
import { tooltipRef } from "../tooltipRef.ts";

type ProfileTable = Extract<
  z.infer<typeof publicPageTableSchema>,
  { type: "profile" }
>;
type Achievement = ProfileTable["achievements"][number];

/**
 * What each achievement shows: the suits of a variant (every suit of it, or only its last suit),
 * one person for each player, a card of the last suit of a variant with a rank on it instead of a
 * pip, for a special rank, or a card with an icon, for a rule such as Up or Down. Deceptive ranks
 * have no suit of their own, so they show a "?".
 */
const ACHIEVEMENT_CARDS = {
  noVariant10Wins: {
    variant: "No Variant",
    allSuits: true,
  },
  noVariant100Wins: {
    variant: "No Variant",
    allSuits: true,
  },
  black10Wins: {
    variant: "Black (5 Suits)",
    allSuits: false,
  },
  rainbow10Wins: {
    variant: "Rainbow (5 Suits)",
    allSuits: false,
  },
  pink10Wins: {
    variant: "Pink (5 Suits)",
    allSuits: false,
  },
  white10Wins: {
    variant: "White (5 Suits)",
    allSuits: false,
  },
  brown10Wins: {
    variant: "Brown (5 Suits)",
    allSuits: false,
  },
  omni10Wins: {
    variant: "Omni (5 Suits)",
    allSuits: false,
  },
  null10Wins: {
    variant: "Null (5 Suits)",
    allSuits: false,
  },
  muddyRainbow10Wins: {
    variant: "Muddy Rainbow (5 Suits)",
    allSuits: false,
  },
  lightPink10Wins: {
    variant: "Light Pink (5 Suits)",
    allSuits: false,
  },
  prism10Wins: {
    variant: "Prism (5 Suits)",
    allSuits: false,
  },
  orange10Wins: {
    variant: "Orange (5 Suits)",
    allSuits: false,
  },
  darkSuitsWins: {
    variant: "Black (5 Suits)",
    allSuits: false,
  },
  rainbowRank10Wins: {
    rankOf: "Rainbow (5 Suits)",
    label: "1",
  },
  pinkRank10Wins: {
    rankOf: "Pink (5 Suits)",
    label: "1",
  },
  whiteRank10Wins: {
    rankOf: "White (5 Suits)",
    label: "1",
  },
  brownRank10Wins: {
    rankOf: "Brown (5 Suits)",
    label: "1",
  },
  omniRank10Wins: {
    rankOf: "Omni (5 Suits)",
    label: "1",
  },
  nullRank10Wins: {
    rankOf: "Null (5 Suits)",
    label: "1",
  },
  muddyRainbowRank10Wins: {
    rankOf: "Muddy Rainbow (5 Suits)",
    label: "1",
  },
  lightPinkRank10Wins: {
    rankOf: "Light Pink (5 Suits)",
    label: "1",
  },
  deceptiveRank10Wins: {
    rankOf: "No Variant",
    label: "?",
  },
  ambiguous10Wins: {
    variant: "Ambiguous (6 Suits)",
    allSuits: true,
  },
  veryAmbiguous10Wins: {
    variant: "Very Ambiguous (6 Suits)",
    allSuits: true,
  },
  extremelyAmbiguous10Wins: {
    variant: "Extremely Ambiguous (6 Suits)",
    allSuits: true,
  },
  dualColor5Suits10Wins: {
    variant: "Dual-Color (5 Suits)",
    allSuits: true,
  },
  dualColor6Suits10Wins: {
    variant: "Dual-Color (6 Suits)",
    allSuits: true,
  },
  criticalOnes10Wins: {
    rankOf: "Black (5 Suits)",
    label: "1",
  },
  criticalTwos10Wins: {
    rankOf: "Black (5 Suits)",
    label: "2",
  },
  criticalThrees10Wins: {
    rankOf: "Black (5 Suits)",
    label: "3",
  },
  criticalFours10Wins: {
    rankOf: "Black (5 Suits)",
    label: "4",
  },
  scarceOnes10Wins: {
    icon: "fa-gem",
    suitIndex: 5,
  },
  clueStarved10Wins: {
    icon: "fa-battery-empty",
    suitIndex: 1,
  },
  colorBlind10Wins: {
    icon: "fa-palette",
    suitIndex: 2,
  },
  numberBlind10Wins: {
    icon: "fa-hashtag",
    suitIndex: 3,
  },
  totallyBlind10Wins: {
    icon: "fa-eye-slash",
    suitIndex: 4,
  },
  cowAndPig10Wins: {
    icon: "fa-cow",
    suitIndex: 0,
  },
  duck10Wins: {
    icon: "fa-feather",
    suitIndex: 1,
  },
  oddsAndEvens10Wins: {
    icon: "fa-dice",
    suitIndex: 2,
  },
  reversedSuit10Wins: {
    icon: "fa-arrow-rotate-left",
    suitIndex: 3,
  },
  upOrDown10Wins: {
    icon: "fa-arrows-up-down",
    suitIndex: 4,
  },
  throwItInAHole10Wins: {
    icon: "fa-golf-ball-tee",
    suitIndex: 5,
  },
  sudoku10Wins: {
    icon: "fa-table-cells",
    suitIndex: 0,
  },
  threePlayers10Wins: {
    players: 3,
  },
  fourPlayers10Wins: {
    players: 4,
  },
  fivePlayers10Wins: {
    players: 5,
  },
  noVariant5Streak: {
    variant: "No Variant",
    allSuits: true,
  },
} as const satisfies Record<
  Achievement["id"],
  | { readonly variant: string; readonly allSuits: boolean }
  | { readonly players: number }
  | { readonly rankOf: string; readonly label: string }
  | { readonly icon: string; readonly suitIndex: number }
>;

/** The variant whose suits give the colors of the cards with an icon, for a rule. */
const ICON_CARD_VARIANT = "6 Suits";

/** The most people in a row of an achievement's players. */
const MAX_PLAYERS_PER_ROW = 3;

/** The width of a card, in CSS pixels. */
const CARD_WIDTH = 32;

/**
 * The width of the area that a pip is drawn in, as a fraction of its card's width. The pip itself
 * fills about half of it.
 */
const PIP_PER_CARD_WIDTH = 1.2;

/** How far each card of a fan turns from the next, in degrees. */
const FAN_DEGREES_PER_CARD = 7;

/** The width of the space that the cards take, so that the text of every achievement lines up. */
const ART_WIDTH = 64;

function unlockedText(date: string): string {
  const unlocked = new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Unlocked on ${unlocked}.`;
}

/** The smallest percentage that a card shows as a number. Smaller ones show as "<0.1%". */
const MIN_SHOWN_PERCENTAGE = 0.1;

/** How many players have an achievement, such as "12.5% of players". */
function rarityText(percentage: number): string {
  const shown =
    percentage > 0 && percentage < MIN_SHOWN_PERCENTAGE
      ? `<${MIN_SHOWN_PERCENTAGE}`
      : String(Math.round(percentage * 10) / 10);
  return `${shown}% of players`;
}

/** A card of a suit, face up, with the suit's color and a white pip, as on a clue token. */
function SuitCard({
  suitIndex,
  variant,
  rotation = 0,
}: {
  readonly suitIndex: number;
  readonly variant: Variant;
  readonly rotation?: number;
}): React.JSX.Element | null {
  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return null;
  }
  return (
    <div
      className="tw:absolute tw:flex tw:items-center tw:justify-center tw:shadow-[0_1px_3px_rgb(0_0_0/0.35)] tw:ring-1 tw:ring-black/30"
      style={{
        width: CARD_WIDTH,
        height: CARD_WIDTH * CARD_HEIGHT_PER_WIDTH,
        borderRadius: CARD_WIDTH * CARD_CORNER_PER_WIDTH,
        background:
          suit.fill ?? `linear-gradient(160deg, ${suit.fillColors.join(", ")})`,
        rotate: `${rotation}deg`,
        transformOrigin: "50% 120%",
      }}
    >
      <Pip
        fill="white"
        shadow
        size={CARD_WIDTH * PIP_PER_CARD_WIDTH}
        suit={suit}
        variant={variant}
      />
    </div>
  );
}

/**
 * A card of a suit of a variant (its last suit by default), with a rank or an icon on it instead of
 * a pip.
 */
function LabelCard({
  children,
  suitIndex,
  variant,
}: {
  readonly children: React.ReactNode;
  readonly suitIndex?: number;
  readonly variant: Variant;
}): React.JSX.Element | null {
  const suit =
    suitIndex === undefined ? variant.suits.at(-1) : variant.suits[suitIndex];
  if (suit === undefined) {
    return null;
  }
  return (
    <div
      className="tw:absolute tw:flex tw:items-center tw:justify-center tw:text-[1.6em] tw:leading-none tw:font-bold tw:text-white tw:shadow-[0_1px_3px_rgb(0_0_0/0.35)] tw:ring-1 tw:ring-black/30 tw:[text-shadow:0_1px_2px_rgb(0_0_0/0.6)] tw:[-webkit-text-stroke:3px_rgb(0_0_0/0.55)] tw:[paint-order:stroke_fill]"
      style={{
        width: CARD_WIDTH,
        height: CARD_WIDTH * CARD_HEIGHT_PER_WIDTH,
        borderRadius: CARD_WIDTH * CARD_CORNER_PER_WIDTH,
        background:
          suit.fill ?? `linear-gradient(160deg, ${suit.fillColors.join(", ")})`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * One person for each player, in rows of at most `MAX_PLAYERS_PER_ROW`, with the longer row on top.
 */
function Players({ players }: { readonly players: number }): React.JSX.Element {
  const rows = Math.ceil(players / MAX_PLAYERS_PER_ROW);
  const top = Math.ceil(players / rows);
  const counts = rows === 1 ? [players] : [top, players - top];
  return (
    <div className="tw:flex tw:flex-col tw:items-center tw:gap-0.5 tw:text-[1.15em] tw:leading-none tw:text-[var(--button-primary-bg)]">
      {counts.map((count, row) => (
        <div className="tw:flex tw:gap-1" key={row}>
          {Array.from({ length: count }, (_person, index) => (
            <i className="fas fa-user" key={index} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The art of an achievement: one card of its suit, a fan of every suit of its variant, or its
 * players. It is gray until the achievement is unlocked.
 */
export function AchievementArt({
  id,
  unlocked,
}: {
  readonly id: Achievement["id"];
  readonly unlocked: boolean;
}): React.JSX.Element {
  const art = ACHIEVEMENT_CARDS[id];
  const artClassName = `tw:relative tw:flex tw:shrink-0 tw:items-center tw:justify-center ${unlocked ? "" : "tw:opacity-45 tw:grayscale"}`;
  const artStyle = {
    width: ART_WIDTH,
    height: CARD_WIDTH * CARD_HEIGHT_PER_WIDTH + 6,
  };
  if ("rankOf" in art) {
    return (
      <div aria-hidden="true" className={artClassName} style={artStyle}>
        <LabelCard variant={getVariant(art.rankOf)}>{art.label}</LabelCard>
      </div>
    );
  }
  if ("icon" in art) {
    return (
      <div aria-hidden="true" className={artClassName} style={artStyle}>
        <LabelCard
          suitIndex={art.suitIndex}
          variant={getVariant(ICON_CARD_VARIANT)}
        >
          <i className={`fas ${art.icon} tw:text-[0.75em]`} />
        </LabelCard>
      </div>
    );
  }
  if ("players" in art) {
    return (
      <div aria-hidden="true" className={artClassName} style={artStyle}>
        <Players players={art.players} />
      </div>
    );
  }
  const { variant: variantName, allSuits } = art;
  const variant = getVariant(variantName);
  const suitIndexes = allSuits
    ? variant.suits.map((_suit, index) => index)
    : [variant.suits.length - 1];
  const middle = (suitIndexes.length - 1) / 2;
  return (
    <div aria-hidden="true" className={artClassName} style={artStyle}>
      {suitIndexes.map((suitIndex, index) => (
        <SuitCard
          key={suitIndex}
          rotation={(index - middle) * FAN_DEGREES_PER_CARD}
          suitIndex={suitIndex}
          variant={variant}
        />
      ))}
    </div>
  );
}

function AchievementCard({
  achievement,
}: {
  readonly achievement: Achievement;
}): React.JSX.Element {
  const {
    dateUnlocked,
    description,
    goal,
    id,
    name,
    progress,
    unlockedPercentage,
  } = achievement;
  const unlocked = dateUnlocked !== undefined;
  return (
    <div
      className={`tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:p-2.5 ${unlocked ? "tw:border-border tw:bg-surface-panel" : "tw:border-dashed tw:border-border"}`}
    >
      <AchievementArt id={id} unlocked={unlocked} />
      <div className="tw:min-w-0 tw:flex-1">
        <div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-x-2">
          <span
            className={`tw:font-semibold ${unlocked ? "" : "tw:text-text-label"}`}
          >
            {name}
          </span>
          <span
            className="tw:shrink-0 tw:text-[0.8em] tw:text-text-label tw:tabular-nums"
            ref={tooltipRef(
              "The share of the players with at least one achievement who have this one.",
            )}
          >
            {rarityText(unlockedPercentage)}
          </span>
        </div>
        <div className="tw:text-[0.85em] tw:leading-snug tw:text-text-label">
          {description}
        </div>
        {unlocked ? (
          <div className="tw:mt-1 tw:text-[0.85em] tw:text-green-text">
            {unlockedText(dateUnlocked)}
          </div>
        ) : (
          <div className="tw:mt-1.5 tw:flex tw:items-center tw:gap-2">
            <div
              aria-label={name}
              aria-valuemax={goal}
              aria-valuemin={0}
              aria-valuenow={progress}
              className="tw:h-1.5 tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-border"
              role="progressbar"
            >
              <div
                className="tw:h-full tw:rounded-full tw:bg-green-text"
                style={{ width: `${(progress * 100) / goal}%` }}
              />
            </div>
            <span className="tw:text-[0.85em] tw:text-text-label tw:tabular-nums">
              {progress} / {goal}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Achievements({
  achievements,
}: {
  readonly achievements: readonly Achievement[];
}): React.JSX.Element {
  const numUnlocked = achievements.filter(
    (achievement) => achievement.dateUnlocked !== undefined,
  ).length;
  return (
    <section className="tw:mb-6">
      <h3 className="tw:flex tw:items-baseline tw:gap-3">
        Achievements
        <span className="tw:text-[0.6em] tw:text-text-label tw:tabular-nums">
          {numUnlocked} / {achievements.length}
        </span>
      </h3>
      <p className="tw:mb-3 tw:text-[0.85em] tw:leading-snug tw:text-text-label">
        Only games with {MIN_ACHIEVEMENT_PLAYERS} or more players count. Games
        with an option, such as &quot;One Extra Card&quot;, do not count.
      </p>
      <div className="tw:grid tw:grid-cols-[repeat(auto-fill,minmax(min(100%,19em),1fr))] tw:gap-2.5">
        {achievements.map((achievement) => (
          <AchievementCard achievement={achievement} key={achievement.id} />
        ))}
      </div>
    </section>
  );
}
