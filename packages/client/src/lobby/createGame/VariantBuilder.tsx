// The variant builder of Create Game: rows of suits and rules that a player turns on and off, and
// the deck of the variant that they make.

import type { Suit, SuitIndex, Variant } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  doesVariantExist,
  getVariant,
  MAX_SUITS,
  VALID_SUIT_INDEXES,
} from "@hanabi-live/game";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardFace } from "../../game/newUi/Card.tsx";
import { useAppSelector } from "../../store.ts";
import { Tooltip } from "../../Tooltip.ts";
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
    group: "dualColor",
    label: "Dual-color suits",
  },
  {
    group: "matryoshka",
    label: "Matryoshka suits",
  },
] as const satisfies ReadonlyArray<{
  readonly group: SuitGroup;
  readonly label: string;
}>;

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
          count={{
            onAdd:
              choice.numSuits < MAX_SUITS
                ? () => {
                    choose(setNumSuits(choice, choice.numSuits + 1));
                  }
                : undefined,
            // Only a normal suit goes, since the player picked the others.
            onRemove:
              choice.numSuits > Math.max(choice.suits.length, 1)
                ? () => {
                    choose(setNumSuits(choice, choice.numSuits - 1));
                  }
                : undefined,
            removeBlockedReason:
              choice.numSuits === 1
                ? "A deck has at least one suit."
                : "This deck has no normal suit. Remove another suit from its card's menu.",
          }}
          ids={deckIds}
          reverseBlocker={getReverseBlocker(choice)}
          reversed={choice.reversed}
          variant={deck}
        />
      </div>
      <p className="tw:m-0 tw:text-[0.9em] tw:text-text-label">
        Click a card to make it dark or reversed.
      </p>

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

/** The buttons that add or remove a normal suit. Each is absent when it cannot. */
interface CountActions {
  readonly onAdd: (() => void) | undefined;
  readonly onRemove: (() => void) | undefined;
  /** Why no suit can be removed, while `onRemove` is absent. */
  readonly removeBlockedReason: string;
}

function Deck({
  actions,
  chosen,
  count,
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
  readonly count: CountActions;
  /** The ID of each suit of the deck, in order. */
  readonly ids: readonly string[];
  readonly reversed: ReadonlySet<string>;
  /** The rule that stops a suit from being reversed, such as "Up or Down". */
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly variant: Variant;
}) {
  // A dark swap changes a suit's ID, and so its card. The new card opens its menu again.
  const [reopenId, setReopenId] = useState<string | undefined>();
  const menuActions: DeckActions = {
    ...actions,
    onToggleDark: (id) => {
      setReopenId(getOtherVersion(id));
      actions.onToggleDark(id);
    },
  };

  return (
    <figure className="tw:m-0 tw:flex tw:flex-col tw:items-start tw:gap-[0.6em]">
      {/* The buttons wrap below the cards on a narrow screen. */}
      <div className="tw:flex tw:flex-wrap tw:gap-[0.3em]" role="group">
        {VALID_SUIT_INDEXES.slice(0, variant.suits.length).map((suitIndex) => {
          const id = ids[suitIndex];
          return (
            id !== undefined && (
              <DeckCard
                actions={menuActions}
                id={id}
                key={id}
                onReopened={() => {
                  setReopenId(undefined);
                }}
                removable={chosen.includes(id)}
                reopen={reopenId === id}
                reverseBlocker={reverseBlocker}
                reversed={reversed.has(id)}
                suitIndex={suitIndex}
                variant={variant}
              />
            )
          );
        })}
        <span className="tw:flex tw:items-center tw:gap-[0.3em] tw:pl-[0.2em]">
          <CountButton
            icon="fa-minus"
            label="Remove a suit"
            onClick={count.onRemove}
            tooltip={
              count.onRemove === undefined
                ? count.removeBlockedReason
                : "Remove a normal suit."
            }
          />
          <CountButton
            icon="fa-plus"
            label="Add a suit"
            onClick={count.onAdd}
            tooltip={
              count.onAdd === undefined
                ? `A deck has at most ${MAX_SUITS} suits.`
                : "Add a normal suit."
            }
          />
        </span>
      </div>
      {/* The name has its own line under the deck, so that it stays in place while the deck
          grows or shrinks. */}
      <figcaption className="tw:font-bold">{variant.name}</figcaption>
    </figure>
  );
}

/** A small round button beside the deck that adds or removes a suit. */
function CountButton({
  icon,
  label,
  onClick,
  tooltip,
}: {
  /** The Font Awesome icon, such as "fa-plus". */
  readonly icon: string;
  readonly label: string;
  /** Absent when the button cannot do anything. */
  readonly onClick: (() => void) | undefined;
  readonly tooltip: string;
}) {
  const enabled = onClick !== undefined;
  return (
    // A disabled button gets no pointer events, so this one only looks disabled, to keep its
    // tooltip.
    <button
      aria-disabled={!enabled}
      aria-label={label}
      className={`tw:flex tw:size-[1.4em] tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-solid tw:border-border tw:bg-surface tw:p-0 tw:text-[1.1em] tw:leading-none tw:text-text ${enabled ? "tw:cursor-pointer tw:hover:border-green" : "tw:cursor-not-allowed tw:opacity-35"}`}
      onClick={onClick}
      ref={tooltipRef(tooltip)}
      type="button"
    >
      <i aria-hidden className={`fas ${icon} tw:text-[0.7em]`} />
    </button>
  );
}

/**
 * A card of the deck. A click opens its menu in the site's tooltip, which makes the suit dark or
 * reversed, or removes it.
 */
function DeckCard({
  actions,
  id,
  onReopened,
  removable,
  reopen,
  reverseBlocker,
  reversed,
  suitIndex,
  variant,
}: {
  readonly actions: DeckActions;
  readonly id: string;
  readonly onReopened: () => void;
  readonly removable: boolean;
  /** Whether the card opens its menu as it appears, after a dark swap. */
  readonly reopen: boolean;
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly reversed: boolean;
  readonly suitIndex: SuitIndex;
  readonly variant: Variant;
}) {
  const colorblindMode = useAppSelector(
    (state) => state.session.settings.colorblindMode,
  );
  const cardRef = useRef<HTMLButtonElement>(null);
  const [menu] = useState(() => document.createElement("div"));
  const menuRef = useRef<Tooltip>(null);
  const name = `${getSuitName(id)}${reversed ? " Reversed" : ""}`;

  useEffect(() => {
    const tooltip = new Tooltip(cardRef.current!, {
      content: menu,
      interactive: true,
    });
    menuRef.current = tooltip;
    return () => {
      tooltip.destroy();
    };
  }, [menu]);

  function openMenu() {
    menuRef.current?.openUntilClickElsewhere();
    menu.querySelector<HTMLElement>("input:not(:disabled), button")?.focus();
  }

  function closeMenu(returnFocus: boolean) {
    menuRef.current?.close();
    if (returnFocus) {
      cardRef.current?.focus();
    }
  }

  // Only a new card reopens its menu, after a dark swap.
  useEffect(() => {
    if (!reopen) {
      return;
    }
    openMenu();
    onReopened();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={name}
        className="tw:cursor-pointer tw:border-none tw:bg-transparent tw:p-0 tw:leading-none tw:hover:-translate-y-[2px]"
        onClick={() => {
          if (menuRef.current?.isOpen === true) {
            closeMenu(false);
          } else {
            openMenu();
          }
        }}
        ref={cardRef}
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
      {createPortal(
        <SuitMenu
          actions={actions}
          id={id}
          name={name}
          onClose={closeMenu}
          removable={removable}
          reverseBlocker={reverseBlocker}
          reversed={reversed}
        />,
        menu,
      )}
    </>
  );
}

/** The menu of a deck card: whether its suit is dark or reversed, and whether it stays. */
function SuitMenu({
  actions,
  id,
  name,
  onClose,
  removable,
  reverseBlocker,
  reversed,
}: {
  readonly actions: DeckActions;
  readonly id: string;
  readonly name: string;
  /** Closes the menu. `returnFocus` moves the focus back to the card. */
  readonly onClose: (returnFocus: boolean) => void;
  readonly removable: boolean;
  readonly reverseBlocker: RecipeFlag | undefined;
  readonly reversed: boolean;
}) {
  const otherVersion = getOtherVersion(id);
  const dark = isDark(id);
  const darkId = dark ? id : otherVersion;
  const lightName = getSuitName(dark ? (otherVersion ?? id) : id);

  return (
    // Escape closes the menu, and the focus goes back to its card.
    <div
      aria-label={name}
      className="tw:flex tw:max-w-[16em] tw:flex-col tw:gap-[0.5em] tw:text-left"
      onKeyDown={(event) => {
        if (event.key !== "Escape") {
          return;
        }

        event.stopPropagation();
        onClose(true);
      }}
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
          className="tw:cursor-pointer tw:self-start tw:border-none tw:bg-transparent tw:p-0 tw:text-inherit tw:underline"
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
