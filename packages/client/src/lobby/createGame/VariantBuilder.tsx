// The variant builder of Create Game: rows of suits and rules that a player turns on and off, and
// the deck of the variant that they make.

import type { Suit, Variant } from "@hanabi-live/game";
import { getVariant, MAX_SUITS, VALID_SUIT_INDEXES } from "@hanabi-live/game";
import { useEffect, useState } from "react";
import { CardFace } from "../../game/newUi/Card.tsx";
import { useAppSelector } from "../../store.ts";
import type { Choice, FlagPart, SuitGroup } from "./variantBuilder.ts";
import {
  canAddSuit,
  getCatalogName,
  getChoice,
  getDeckSuitIds,
  getDeckVariant,
  getParts,
  getRecipe,
  RULE_RANKS,
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
    group: "otherColors",
    label: "Other colors",
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
      ? getDeckVariant(choice, "New variant")
      : getVariant(catalogName);

  return (
    <div className="tw:flex tw:w-full tw:flex-col tw:gap-[0.9em]">
      <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-x-[1.2em] tw:gap-y-[0.6em]">
        <Deck variant={deck} />
        <p className="tw:m-0 tw:text-text-label">
          {catalogName === undefined ? (
            <>
              The server checks the rules when it creates the game. Recipe:{" "}
              <code>{recipe}</code>
            </>
          ) : (
            "A variant that players already know."
          )}
        </p>
      </div>

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
              />
            ))}
        </PartRow>
      ))}

      <PartRow label="Reversed suits">
        {deckIds.map((id, index) => (
          <Chip
            enabled
            // A deck has each suit once.
            key={id}
            label={deck.suits[index]?.displayName ?? id}
            name={`${deck.suits[index]?.displayName ?? id} Reversed`}
            onClick={() => {
              choose(toggleReversed(choice, id));
            }}
            pressed={choice.reversed.has(id)}
            suit={deck.suits[index]}
          />
        ))}
      </PartRow>

      <PartRow label="Special rank">
        {parts.specialRanks.map(({ code, name }) => (
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
          />
        ))}
        <Chip
          enabled
          label="Scarce 1s"
          onClick={() => {
            choose(toggleScarceOnes(choice));
          }}
          pressed={choice.scarceOnes}
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
      {flags.map(({ flag, name }) => (
        <Chip
          enabled
          key={flag}
          label={name}
          onClick={() => {
            choose(toggleFlag(choice, flag));
          }}
          pressed={choice.flags.has(flag)}
        />
      ))}
    </PartRow>
  );
}

/** The width of each card of the deck, in CSS pixels. */
const DECK_CARD_WIDTH = 40;

/** The variant's suits, drawn as the cards of a game, without ranks. */
function Deck({ variant }: { readonly variant: Variant }) {
  const colorblindMode = useAppSelector(
    (state) => state.session.settings.colorblindMode,
  );
  return (
    <figure className="tw:m-0 tw:flex tw:flex-wrap tw:items-end tw:gap-[0.6em]">
      <div aria-hidden className="tw:flex tw:gap-[0.3em]">
        {VALID_SUIT_INDEXES.slice(0, variant.suits.length).map((suitIndex) => (
          <CardFace
            colorblindMode={colorblindMode}
            key={suitIndex}
            rank={undefined}
            suitIndex={suitIndex}
            variant={variant}
            width={DECK_CARD_WIDTH}
          />
        ))}
      </div>
      <figcaption className="tw:font-bold">{variant.name}</figcaption>
    </figure>
  );
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
}: {
  readonly enabled: boolean;
  readonly label: string;
  /** The accessible name, when the label leaves out what the row tells. */
  readonly name?: string;
  readonly onClick: () => void;
  readonly pressed: boolean;
  readonly suit?: Suit | undefined;
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
