// The variant builder of Create Game: rows of parts that a player turns on and off, and the deck of
// the variant that has them.

import type { Suit, Variant } from "@hanabi-live/game";
import { doesVariantExist, getVariant } from "@hanabi-live/game";
import { useEffect, useState } from "react";
import type { Choice, PartGroup } from "./variantBuilder.ts";
import {
  canAdd,
  canHaveSuits,
  getCatalog,
  getChoice,
  getMatches,
  toggle,
} from "./variantBuilder.ts";

/** The rows of parts, in the order that the builder shows them. */
const GROUPS = [
  {
    group: "special",
    label: "Special suits",
  },
  {
    group: "dark",
    label: "Dark suits",
  },
  {
    group: "reversed",
    label: "Reversed suits",
  },
  {
    group: "otherColors",
    label: "Other colors",
  },
  {
    group: "ranks",
    label: "Ranks",
  },
  {
    group: "clues",
    label: "Clues",
  },
  {
    group: "play",
    label: "Play",
  },
] as const satisfies ReadonlyArray<{
  readonly group: PartGroup;
  readonly label: string;
}>;

/**
 * The groups whose parts show only when they lead to a variant. They have dozens of parts that only
 * a few variants use.
 */
const SPARSE_GROUPS: ReadonlySet<PartGroup> = new Set(["otherColors"]);

export function VariantBuilder({
  onPick,
  variantName,
}: {
  /** A variant has the chosen parts, and the form takes it. */
  readonly onPick: (variantName: string) => void;
  readonly variantName: string;
}): React.JSX.Element {
  const catalog = getCatalog();
  const [choice, setChoice] = useState<Choice>(() =>
    getChoice(catalog, variantName),
  );
  const matches = getMatches(catalog, choice);

  // A variant that the player chose in the field above starts a new choice.
  useEffect(() => {
    if (
      doesVariantExist(variantName)
      && getMatches(catalog, choice).every(
        ({ variant }) => variant.name !== variantName,
      )
    ) {
      setChoice(getChoice(catalog, variantName));
    }
    // Only a new variant from the field starts a new choice, not a new choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantName]);

  function choose(next: Choice) {
    setChoice(next);
    const [first] = getMatches(catalog, next);
    if (first !== undefined) {
      onPick(first.variant.name);
    }
  }

  const shown = doesVariantExist(variantName)
    ? getVariant(variantName)
    : matches[0]?.variant;

  return (
    <div className="tw:flex tw:w-full tw:flex-col tw:gap-[0.9em]">
      <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-x-[1.2em] tw:gap-y-[0.6em]">
        {shown !== undefined && <Deck variant={shown} />}
        <p className="tw:m-0 tw:text-text-label">
          {getMatchText(matches.length)}
        </p>
      </div>

      <PartRow label="Suits">
        {catalog.suitCounts.map((numSuits) => (
          <Chip
            enabled={canHaveSuits(catalog, choice, numSuits)}
            key={numSuits}
            label={numSuits.toString()}
            onClick={() => {
              // A second click removes the count, which matches any count.
              choose({
                ...choice,
                numSuits: choice.numSuits === numSuits ? undefined : numSuits,
              });
            }}
            pressed={choice.numSuits === numSuits}
          />
        ))}
      </PartRow>

      {GROUPS.map(({ group, label }) => {
        const parts = [...catalog.parts.values()]
          .filter((part) => part.group === group)
          .map((part) => ({
            part,
            pressed: choice.parts.has(part.code),
            enabled:
              choice.parts.has(part.code) || canAdd(catalog, choice, part.code),
          }))
          .filter(
            ({ pressed, enabled }) =>
              !SPARSE_GROUPS.has(group) || pressed || enabled,
          );
        if (parts.length === 0) {
          return undefined;
        }
        return (
          <PartRow key={group} label={label}>
            {parts.map(({ part, pressed, enabled }) => (
              <Chip
                enabled={enabled}
                key={part.code}
                label={part.label}
                name={part.name}
                onClick={() => {
                  choose(toggle(choice, part.code));
                }}
                pressed={pressed}
                suit={part.suit}
              />
            ))}
          </PartRow>
        );
      })}

      {matches.length > 1 && (
        <PartRow label="Variants">
          {matches.map(({ variant }) => (
            <Chip
              enabled
              key={variant.name}
              label={variant.name}
              onClick={() => {
                onPick(variant.name);
              }}
              pressed={variant.name === variantName}
            />
          ))}
        </PartRow>
      )}
    </div>
  );
}

function getMatchText(numMatches: number): string {
  if (numMatches === 0) {
    return "No variant has all of these. Turn one off.";
  }
  return numMatches === 1
    ? "This is the only variant with these."
    : `${numMatches} variants have these.`;
}

/** One card face for each suit of the variant, in the colors of the suit. */
function Deck({ variant }: { readonly variant: Variant }) {
  return (
    <figure className="tw:m-0 tw:flex tw:flex-wrap tw:items-end tw:gap-[0.6em]">
      <div aria-hidden className="tw:flex tw:gap-[0.3em]">
        {variant.suits.map((suit, index) => (
          // A variant can have the same suit twice.
          <SuitCard key={index} suit={suit} />
        ))}
      </div>
      <figcaption className="tw:font-bold">{variant.name}</figcaption>
    </figure>
  );
}

function SuitCard({ suit }: { readonly suit: Suit }) {
  return (
    <span
      className="tw:block tw:h-[2.6em] tw:w-[1.8em] tw:rounded-[0.3em] tw:border tw:border-solid tw:border-black/40 tw:shadow-[0_2px_0_rgb(0_0_0/0.25)]"
      style={{ background: getSuitBackground(suit) }}
    />
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
