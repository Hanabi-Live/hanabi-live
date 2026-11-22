// The variant builder of Create Game: rows of suits and rules that a player turns on and off, and
// the deck of the variant that they make.

import type { Suit, Variant } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  doesVariantExist,
  getVariant,
  MAX_SUITS,
  VALID_SUIT_INDEXES,
} from "@hanabi-live/game";
import { useEffect, useId, useRef, useState } from "react";
import { CardFace } from "../../game/newUi/Card.tsx";
import { useAppSelector } from "../../store.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { escapeHtml } from "../../utils.ts";
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
  getChosenVersion,
  getCriticalDescription,
  getDeckSuitIds,
  getDeckVariant,
  getOtherVersion,
  getParts,
  getRecipe,
  getReverseBlocker,
  getSuitDescription,
  getSuitName,
  getVariantName,
  isDark,
  REVERSED_DESCRIPTION,
  RULE_RANKS,
  SCARCE_ONES_DESCRIPTION,
  setNumSuits,
  setSpecialRank,
  toggleCriticalRank,
  toggleDark,
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
    group: "ambiguous",
    label: "Ambiguous suits",
  },
  {
    group: "multiColor",
    label: "Multi-color suits",
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
  // The field above holds a partial name while the player types a search, such as "n".
  const [choice, setChoice] = useState<Choice>(() =>
    getChoice(
      getVariant(
        doesVariantExist(variantName) ? variantName : DEFAULT_VARIANT_NAME,
      ).recipe,
    ),
  );
  const recipe = getRecipe(choice);
  const catalogName = getCatalogName(recipe);

  // A variant that the player chose in the field above starts a new choice.
  useEffect(() => {
    if (catalogName !== variantName && doesVariantExist(variantName)) {
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
  const specialRule = parts.specialRanks.find(
    ({ code }) => code === choice.specialRank?.code,
  );
  const removesRankClue = specialRule?.removesRankClue === true;
  const deck =
    catalogName === undefined
      ? getDeckVariant(choice, getVariantName(choice))
      : getVariant(catalogName);

  return (
    <div className="tw:flex tw:w-full tw:flex-col tw:gap-[0.9em]">
      <div className="tw:flex tw:flex-wrap tw:items-end tw:gap-x-[1.2em] tw:gap-y-[0.6em]">
        <Deck
          actions={{
            onToggleDark: (id) => {
              choose(toggleDark(choice, id));
            },
            onToggleReversed: (id) => {
              choose(toggleReversed(choice, id));
            },
            onRemove: (id) => {
              choose(toggleSuit(choice, id));
            },
          }}
          chosen={choice.suits}
          ids={deckIds}
          reverseBlocker={getReverseBlocker(choice)}
          reversed={choice.reversed}
          variant={deck}
        />
      </div>
      <p className="tw:m-0 tw:text-[0.9em] tw:text-text-label">
        Click a card to make it dark or reversed.
      </p>

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
                enabled={canAddSuit(choice, id)}
                key={id}
                label={suit.name}
                onClick={() => {
                  choose(toggleSuit(choice, id));
                }}
                pressed={getChosenVersion(choice, id) !== undefined}
                suit={suit}
                tooltip={`${getSuitDescription(suit)}${
                  getOtherVersion(id) === undefined
                    ? ""
                    : " Click its card in the deck to make it dark."
                }`}
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

      {specialRule !== undefined && (
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
              tooltip={`The rule above changes the ${rank}s.${
                removesRankClue ? ` There is no ${rank} clue.` : ""
              }`}
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

/** The width of each card of the deck, in CSS pixels. Six of them fit at the narrowest width. */
const DECK_CARD_WIDTH = 36;

/** The variant's suits, drawn as the cards of a game, without ranks. */
/** What a deck card's menu can change about its suit. */
interface DeckActions {
  readonly onToggleDark: (id: string) => void;
  readonly onToggleReversed: (id: string) => void;
  readonly onRemove: (id: string) => void;
}

function Deck({
  actions,
  chosen,
  ids,
  reversed,
  reverseBlocker,
  variant,
}: {
  readonly actions: DeckActions;
  /**
   * The suits that the player picked, which the menu can remove. The normal suits fill the rest.
   */
  readonly chosen: readonly string[];
  /** The ID of each suit of the deck, in order. */
  readonly ids: readonly string[];
  readonly reversed: ReadonlySet<string>;
  /** The rule that stops a suit from being reversed, such as "Up or Down". */
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly variant: Variant;
}) {
  const colorblindMode = useAppSelector(
    (state) => state.session.settings.colorblindMode,
  );
  const [openId, setOpenId] = useState<string | undefined>();
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());

  // A dark swap changes the suit's ID, so the menu follows it to the new card.
  const menuActions: DeckActions = {
    ...actions,
    onToggleDark: (id) => {
      actions.onToggleDark(id);
      setOpenId(getOtherVersion(id) ?? id);
    },
  };

  function close(returnFocus: boolean) {
    if (returnFocus && openId !== undefined) {
      cardRefs.current.get(openId)?.focus();
    }
    setOpenId(undefined);
  }

  return (
    <figure className="tw:m-0 tw:flex tw:flex-wrap tw:items-end tw:gap-[0.6em]">
      <div className="tw:flex tw:gap-[0.3em]" role="group">
        {VALID_SUIT_INDEXES.slice(0, variant.suits.length).map((suitIndex) => {
          const id = ids[suitIndex];
          if (id === undefined) {
            return undefined;
          }
          const isReversed = reversed.has(id);
          const name = `${getSuitName(id)}${isReversed ? " Reversed" : ""}`;
          const open = openId === id;
          const tooltip = tooltipRefHtml(
            open
              ? ""
              : `<strong>${escapeHtml(name)}</strong><br>Click to make it dark or reversed.`,
          );
          return (
            <span className="tw:relative" key={id}>
              <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={name}
                className="tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:leading-none tw:hover:-translate-y-[2px]"
                onClick={() => {
                  setOpenId(open ? undefined : id);
                }}
                ref={(element) => {
                  if (element === null) {
                    cardRefs.current.delete(id);
                  } else {
                    cardRefs.current.set(id, element);
                  }
                  return tooltip(element);
                }}
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
              {open && (
                <SuitMenu
                  actions={menuActions}
                  // Cards on the right half open their menu to the left, so that it stays on a
                  // narrow screen.
                  alignRight={suitIndex >= variant.suits.length / 2}
                  id={id}
                  name={name}
                  onClose={close}
                  removable={chosen.includes(id)}
                  reverseBlocker={reverseBlocker}
                  reversed={isReversed}
                />
              )}
            </span>
          );
        })}
      </div>
      <figcaption className="tw:font-bold">{variant.name}</figcaption>
    </figure>
  );
}

/** The menu of a deck card: whether its suit is dark or reversed, and whether it stays. */
function SuitMenu({
  actions,
  alignRight,
  id,
  name,
  onClose,
  removable,
  reverseBlocker,
  reversed,
}: {
  readonly actions: DeckActions;
  readonly alignRight: boolean;
  readonly id: string;
  readonly name: string;
  /** Closes the menu. `returnFocus` moves the focus back to the card. */
  readonly onClose: (returnFocus: boolean) => void;
  readonly removable: boolean;
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly reversed: boolean;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  // The listeners below last while the menu is open, so they read the latest callback here.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const otherVersion = getOtherVersion(id);
  const dark = isDark(id);
  const darkId = dark ? id : otherVersion;
  const lightName = getSuitName(dark ? (otherVersion ?? id) : id);

  // The first control takes the focus. A click outside, or Escape, closes the menu.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>("input:not(:disabled), button")
      ?.focus();
    function onPointerDown(event: PointerEvent) {
      const menu = menuRef.current;
      const card = menu?.parentElement;
      if (
        card !== null
        && card !== undefined
        && !card.contains(event.target as Node)
      ) {
        onCloseRef.current(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.stopPropagation();
      onCloseRef.current(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div
      aria-label={name}
      className={`tw:absolute tw:top-full tw:z-10 tw:mt-[0.4em] tw:flex tw:w-max tw:max-w-[16em] tw:flex-col tw:gap-[0.5em] tw:rounded-[0.4em] tw:border tw:border-solid tw:border-border tw:bg-surface tw:p-[0.7em] tw:shadow-[0_4px_12px_rgb(0_0_0/0.25)] tw:transition-opacity tw:starting:opacity-0 ${alignRight ? "tw:right-0" : "tw:left-0"}`}
      ref={menuRef}
      role="dialog"
    >
      <strong>{name}</strong>
      <MenuCheckbox
        checked={dark}
        disabledReason={
          darkId === undefined ? `${lightName} has no dark version.` : undefined
        }
        label={getDarkLabel(darkId)}
        note="One card of each rank."
        onChange={() => {
          actions.onToggleDark(id);
        }}
      />
      <MenuCheckbox
        checked={reversed}
        disabledReason={getReverseBlockReason(reverseBlocker)}
        label="Reversed"
        note={REVERSED_DESCRIPTION}
        onChange={() => {
          actions.onToggleReversed(id);
        }}
      />
      {removable && (
        <button
          className="tw:cursor-pointer tw:self-start tw:border-none tw:bg-transparent tw:p-0 tw:text-green-text tw:underline"
          onClick={() => {
            onClose(false);
            actions.onRemove(id);
          }}
          type="button"
        >
          Remove from deck
        </button>
      )}
    </div>
  );
}

function MenuCheckbox({
  checked,
  disabledReason,
  label,
  note,
  onChange,
}: {
  readonly checked: boolean;
  /** Why the box cannot change, if it cannot. */
  readonly disabledReason: string | undefined;
  readonly label: string;
  /** What the box does, under its label. */
  readonly note: string;
  readonly onChange: () => void;
}) {
  const disabled = disabledReason !== undefined;
  const id = useId();
  // The site's stylesheet draws the box from the label that follows the input.
  return (
    <div className={disabled ? "tw:opacity-60" : undefined}>
      <input
        checked={checked}
        disabled={disabled}
        id={id}
        onChange={onChange}
        type="checkbox"
      />
      <label
        className={disabled ? "tw:cursor-not-allowed" : undefined}
        htmlFor={id}
      >
        <span className="tw:block tw:leading-[1.8em]">{label}</span>
        <span className="tw:block tw:text-[0.85em] tw:leading-snug tw:text-text-label">
          {disabledReason ?? note}
        </span>
      </label>
    </div>
  );
}

/** The label of the dark box, with the dark suit's own name when it has one, such as Gray. */
function getDarkLabel(darkId: string | undefined): string {
  if (darkId === undefined) {
    return "Dark";
  }
  const darkName = getSuitName(darkId);
  return darkName.startsWith("Dark ") ? "Dark" : `Dark (${darkName})`;
}

function getReverseBlockReason(
  blocker: RecipeFlag | undefined,
): string | undefined {
  if (blocker === "updown") {
    return "In Up or Down, every suit can go up or down.";
  }
  if (blocker === "sudoku") {
    return "In Sudoku, every stack goes up.";
  }
  return undefined;
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
