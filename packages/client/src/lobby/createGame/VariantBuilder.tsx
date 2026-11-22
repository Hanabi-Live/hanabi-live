// The variant builder of Create Game: rows of suits and rules that a player turns on and off, and
// the deck of the variant that they make.

import type { Suit, Variant } from "@hanabi-live/game";
import { getVariant, MAX_SUITS, VALID_SUIT_INDEXES } from "@hanabi-live/game";
import { useEffect, useState } from "react";
import { CardFace } from "../../game/newUi/Card.tsx";
import { useAppSelector } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import type {
  Choice,
  FlagPart,
  RecipeFlag,
  SuitGroup,
} from "./variantBuilder.ts";
import {
  canAddSuit,
  getCatalogName,
  getChoice,
  getCriticalDescription,
  getDeckSuitIds,
  getDeckVariant,
  getParts,
  getRecipe,
  getReverseBlocker,
  getSuitDescription,
  getVariantName,
  REVERSED_DESCRIPTION,
  RULE_RANKS,
  SCARCE_ONES_DESCRIPTION,
  setNumSuits,
  setSpecialRank,
  toggleCriticalRank,
  toggleFlag,
  toggleReversed,
  toggleScarceOnes,
  toggleSpecialRule,
  toggleSuit,
} from "./variantBuilder.ts";

/** The rows of suits, in the order that the builder shows them. */
const SUIT_GROUPS = [
  {
    group: "special",
    label: "Special suits",
  },
  {
    group: "dark",
    label: "Dark suits",
  },
  {
    group: "ambiguous",
    label: "Ambiguous suits",
  },
] as const satisfies ReadonlyArray<{
  readonly group: SuitGroup;
  readonly label: string;
}>;

const SUIT_COUNTS: readonly number[] = Array.from(
  { length: MAX_SUITS },
  (_, index) => index + 1,
);

export function VariantBuilder({
  onNew,
  onPick,
  variantName,
}: {
  /** The chosen parts make a variant that the catalog does not have. */
  readonly onNew: (recipe: string) => void;
  /** The chosen parts make a variant of the catalog, and the form takes it. */
  readonly onPick: (variantName: string) => void;
  readonly variantName: string;
}): React.JSX.Element {
  const parts = getParts();
  const [choice, setChoice] = useState<Choice>(() =>
    getChoice(getVariant(variantName).recipe),
  );
  const recipe = getRecipe(choice);
  const catalogName = getCatalogName(recipe);

  // A variant that the player chose in the field above starts a new choice.
  useEffect(() => {
    if (catalogName !== variantName) {
      setChoice(getChoice(getVariant(variantName).recipe));
    }
    // Only a new variant from the field starts a new choice, not a new choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantName]);

  function choose(next: Choice) {
    setChoice(next);
    const nextRecipe = getRecipe(next);
    const name = getCatalogName(nextRecipe);
    if (name === undefined) {
      onNew(nextRecipe);
    } else {
      onPick(name);
    }
  }

  const deckIds = getDeckSuitIds(choice);
  const deck =
    catalogName === undefined
      ? getDeckVariant(choice, getVariantName(choice))
      : getVariant(catalogName);

  return (
    <div className="tw:flex tw:w-full tw:flex-col tw:gap-[0.9em]">
      <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-x-[1.2em] tw:gap-y-[0.6em]">
        <Deck
          ids={deckIds}
          onReverse={(id) => {
            choose(toggleReversed(choice, id));
          }}
          reverseBlocker={getReverseBlocker(choice)}
          reversed={choice.reversed}
          variant={deck}
        />
      </div>
      {getReverseBlocker(choice) === undefined && (
        <p className="tw:m-0 tw:text-[0.9em] tw:text-text-label">
          Click a card to reverse its suit.
        </p>
      )}

      <PartRow label="Suits">
        {SUIT_COUNTS.map((numSuits) => (
          <Chip
            enabled={numSuits >= choice.suits.length}
            key={numSuits}
            label={numSuits.toString()}
            onClick={() => {
              choose(setNumSuits(choice, numSuits));
            }}
            pressed={choice.numSuits === numSuits}
          />
        ))}
      </PartRow>

      {SUIT_GROUPS.map(({ group, label }) => (
        <PartRow key={group} label={label}>
          {parts.suits
            .filter((part) => part.group === group)
            .map(({ id, suit }) => (
              <Chip
                enabled={choice.suits.includes(id) || canAddSuit(choice, id)}
                key={id}
                label={suit.name}
                onClick={() => {
                  choose(toggleSuit(choice, id));
                }}
                pressed={choice.suits.includes(id)}
                suit={suit}
                tooltip={getSuitDescription(suit)}
              />
            ))}
        </PartRow>
      ))}

      <PartRow label="Special rank">
        {parts.specialRanks.map(({ code, name, description }) => (
          <Chip
            enabled
            key={code}
            label={name}
            // A suit of the same name can be in the rows above.
            name={`${name} rank`}
            onClick={() => {
              choose(toggleSpecialRule(choice, code));
            }}
            pressed={choice.specialRank?.code === code}
            tooltip={description}
          />
        ))}
      </PartRow>

      {choice.specialRank !== undefined && (
        <PartRow label="Which rank">
          {RULE_RANKS.map((rank) => (
            <Chip
              enabled
              key={rank}
              label={rank.toString()}
              name={`Special rank ${rank}`}
              onClick={() => {
                choose(setSpecialRank(choice, rank));
              }}
              pressed={choice.specialRank?.rank === rank}
              tooltip={`The rule above changes the ${rank}s.`}
            />
          ))}
        </PartRow>
      )}

      <PartRow label="Copies">
        {RULE_RANKS.map((rank) => (
          <Chip
            enabled
            key={rank}
            label={`Critical ${rank}s`}
            onClick={() => {
              choose(toggleCriticalRank(choice, rank));
            }}
            pressed={choice.criticalRank === rank}
            tooltip={getCriticalDescription(rank)}
          />
        ))}
        <Chip
          enabled
          label="Scarce 1s"
          onClick={() => {
            choose(toggleScarceOnes(choice));
          }}
          pressed={choice.scarceOnes}
          tooltip={SCARCE_ONES_DESCRIPTION}
        />
      </PartRow>

      <FlagRow
        choice={choice}
        choose={choose}
        flags={parts.clueFlags}
        label="Clues"
      />
      <FlagRow
        choice={choice}
        choose={choose}
        flags={parts.playFlags}
        label="Play"
      />
    </div>
  );
}

function FlagRow({
  choice,
  choose,
  flags,
  label,
}: {
  readonly choice: Choice;
  readonly choose: (next: Choice) => void;
  readonly flags: readonly FlagPart[];
  readonly label: string;
}) {
  return (
    <PartRow label={label}>
      {flags.map(({ flag, name, description }) => (
        <Chip
          enabled
          key={flag}
          label={name}
          onClick={() => {
            choose(toggleFlag(choice, flag));
          }}
          pressed={choice.flags.has(flag)}
          tooltip={description}
        />
      ))}
    </PartRow>
  );
}

/** The width of each card of the deck, in CSS pixels. */
const DECK_CARD_WIDTH = 40;

/** The variant's suits, drawn as the cards of a game, without ranks. */
function Deck({
  ids,
  onReverse,
  reversed,
  reverseBlocker,
  variant,
}: {
  /** The ID of each suit of the deck, in order. */
  readonly ids: readonly string[];
  readonly onReverse: (id: string) => void;
  readonly reversed: ReadonlySet<string>;
  /** The rule that stops a suit from being reversed, such as "Up or Down". */
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly variant: Variant;
}) {
  const colorblindMode = useAppSelector(
    (state) => state.session.settings.colorblindMode,
  );
  return (
    <figure className="tw:m-0 tw:flex tw:flex-wrap tw:items-end tw:gap-[0.6em]">
      <div className="tw:flex tw:gap-[0.3em]" role="group">
        {VALID_SUIT_INDEXES.slice(0, variant.suits.length).map((suitIndex) => {
          const id = ids[suitIndex];
          const name = variant.suits[suitIndex]?.displayName ?? "";
          const isReversed = id !== undefined && reversed.has(id);
          const blocked = reverseBlocker !== undefined;
          return (
            // A disabled button gets no pointer events, so this one only looks disabled, to keep
            // its tooltip.
            <button
              aria-disabled={blocked}
              aria-label={`${name} Reversed`}
              aria-pressed={isReversed}
              className={`tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:leading-none ${blocked ? "tw:cursor-not-allowed" : "tw:hover:-translate-y-[2px]"}`}
              key={suitIndex}
              onClick={() => {
                if (!blocked && id !== undefined) {
                  onReverse(id);
                }
              }}
              ref={tooltipRef(getReverseTooltip(reverseBlocker, isReversed))}
              type="button"
            >
              <CardFace
                colorblindMode={colorblindMode}
                rank={undefined}
                suitIndex={suitIndex}
                variant={variant}
                width={DECK_CARD_WIDTH}
              />
            </button>
          );
        })}
      </div>
      <figcaption className="tw:font-bold">{variant.name}</figcaption>
    </figure>
  );
}

function getReverseTooltip(
  blocker: RecipeFlag | undefined,
  reversed: boolean,
): string {
  if (blocker === "updown") {
    return "In Up or Down, every suit can go up or down, so no suit can be reversed.";
  }
  if (blocker === "sudoku") {
    return "In Sudoku, every stack goes up, so no suit can be reversed.";
  }
  return reversed
    ? "Click to play this suit from 1 up to 5 again."
    : `Click to reverse this suit. ${REVERSED_DESCRIPTION}`;
}

/** A suit's color, or the stripes of its colors for a suit with several, such as Rainbow. */
function getSuitBackground(suit: Suit): string {
  if (suit.fillColors === undefined) {
    return suit.fill;
  }
  const step = 100 / suit.fillColors.length;
  const stops = suit.fillColors.map(
    (color, index) => `${color} ${index * step}% ${(index + 1) * step}%`,
  );
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

function PartRow({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <div className="tw:flex tw:flex-wrap tw:items-baseline tw:gap-x-[1em] tw:gap-y-[0.4em] tw:narrow-640:flex-col">
      <span className="tw:w-[8.5em] tw:shrink-0 tw:text-text-label tw:narrow-640:w-auto">
        {label}
      </span>
      <div
        className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-wrap tw:gap-[0.4em]"
        role="group"
      >
        {children}
      </div>
    </div>
  );
}

function Chip({
  enabled,
  label,
  name = label,
  onClick,
  pressed,
  suit,
  tooltip,
}: {
  readonly enabled: boolean;
  readonly label: string;
  /** The accessible name, when the label leaves out what the row tells. */
  readonly name?: string;
  readonly onClick: () => void;
  readonly pressed: boolean;
  readonly suit?: Suit | undefined;
  /** What the part does. The tooltip waits for the pointer to rest on the chip. */
  readonly tooltip?: string;
}) {
  return (
    <button
      aria-label={name === label ? undefined : name}
      aria-pressed={pressed}
      className={`tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-[0.45em] tw:rounded-full tw:border tw:border-solid tw:px-[0.8em] tw:py-[0.25em] tw:text-[0.9em] tw:disabled:cursor-not-allowed tw:disabled:opacity-35 ${
        pressed
          ? "tw:border-green tw:bg-green tw:text-text-on-accent"
          : "tw:border-border tw:bg-surface tw:text-text tw:enabled:hover:border-green"
      }`}
      disabled={!enabled}
      onClick={onClick}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      {suit !== undefined && (
        <span
          aria-hidden
          className="tw:block tw:size-[0.85em] tw:rounded-full tw:border tw:border-solid tw:border-black/40"
          style={{ background: getSuitBackground(suit) }}
        />
      )}
      {label}
    </button>
  );
}
