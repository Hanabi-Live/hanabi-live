// The prompts: a choice (such as the next leader of a shared replay), a number (such as a turn or a
// card slot), and a card (the morph prompt of a hypothetical). "modals.ts" opens and closes the
// dialog that holds them, and runs the function that takes the answer.

import type { Rank } from "@hanabi-live/game";
import { getVariantById, START_CARD_RANK } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { useState } from "react";
import { START_CARD_RANK_LABEL } from "./constants.ts";
import { getCardImages } from "./game/cardImages.ts";
import {
  MODAL_ACTIONS_CLASS_NAME,
  MODAL_COLUMN_CLASS_NAME,
  MODAL_DESCRIPTION_CLASS_NAME,
  ModalButton,
} from "./ModalParts.tsx";
import { cancelPrompt, submitPrompt } from "./modals.ts";
import type { PromptModal as Prompt } from "./promptModalSlice.ts";
import { useAppSelector } from "./store.ts";

/** The title of a prompt, which has no icon above it. */
const PROMPT_TITLE_CLASS_NAME = "tw:mt-0 tw:mb-[0.25em] tw:text-balance";

/**
 * The widest that a card of the morph prompt gets, so that a variant with few suits stays small.
 */
const MORPH_CARD_MAX_WIDTH = "4em";

/**
 * A card of the morph prompt, after its hidden radio button. It cuts off the bottom of the card,
 * which only repeats the rank. The selected card has a ring and a check mark in its corner.
 */
const MORPH_CARD_CLASS_NAME = [
  "tw:relative tw:block tw:aspect-[4/5] tw:overflow-hidden tw:rounded-[0.25em] tw:ring-1 tw:ring-game-line/40",
  "tw:[&_canvas]:block tw:[&_canvas]:h-auto tw:[&_canvas]:w-full",
  "tw:peer-checked:ring-[0.1875em] tw:peer-checked:ring-game-turn tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-offset-2 tw:peer-focus-visible:outline-game-text",
  "tw:before:absolute tw:before:top-[0.125em] tw:before:right-[0.125em] tw:before:hidden tw:before:size-[1.25em] tw:before:items-center tw:before:justify-center tw:before:rounded-full tw:before:bg-game-turn tw:before:text-[0.75em] tw:before:font-bold tw:before:text-game-panel tw:before:content-[var(--morph-mark)] tw:peer-checked:before:flex",
].join(" ");

/** The mark of the selected card: a check mark, escaped for CSS. */
const MORPH_MARK_STYLE = {
  "--morph-mark": String.raw`"\2713"`,
} as React.CSSProperties;

export function PromptModal(): React.JSX.Element | undefined {
  const prompt = useAppSelector((state) => state.promptModal.prompt);
  const count = useAppSelector((state) => state.promptModal.count);
  // Each prompt starts again, so that it focuses its input.
  return prompt === undefined ? undefined : (
    <PromptContent key={count} prompt={prompt} />
  );
}

function PromptContent({ prompt }: { readonly prompt: Prompt }) {
  switch (prompt.type) {
    case "choice": {
      return (
        <section className={MODAL_COLUMN_CLASS_NAME} id="choice-prompt">
          <h3 className={PROMPT_TITLE_CLASS_NAME}>{prompt.title}</h3>
          {prompt.description !== undefined && (
            <p className={MODAL_DESCRIPTION_CLASS_NAME}>{prompt.description}</p>
          )}
          {/* The options are a column of buttons of the same width, such as names. */}
          <div className="tw:mt-[1em] tw:flex tw:w-full tw:max-w-[16em] tw:flex-col tw:gap-[0.5em] tw:[&_button]:m-0 tw:[&_button]:w-full">
            {prompt.options.map((option, index) => (
              <ModalButton
                autoFocus={index === 0}
                key={option}
                onClick={() => {
                  submitPrompt(option);
                }}
              >
                {option}
              </ModalButton>
            ))}
          </div>
          <ul className={`${MODAL_ACTIONS_CLASS_NAME} tw:mt-[1.25em]`}>
            <li>
              <ModalButton onClick={cancelPrompt} variant="alt">
                Cancel
              </ModalButton>
            </li>
          </ul>
        </section>
      );
    }

    case "number": {
      return <NumberPrompt prompt={prompt} />;
    }

    case "morph": {
      return <MorphPrompt prompt={prompt} />;
    }
  }
}

function NumberPrompt({
  prompt,
}: {
  readonly prompt: Extract<Prompt, { type: "number" }>;
}) {
  const [value, setValue] = useState(prompt.value);

  return (
    <section className={MODAL_COLUMN_CLASS_NAME} id="number-prompt">
      <h3 className={PROMPT_TITLE_CLASS_NAME}>{prompt.title}</h3>
      {prompt.description !== undefined && (
        <p className={MODAL_DESCRIPTION_CLASS_NAME}>{prompt.description}</p>
      )}
      {/* The labels and their values line up in two columns, each label beside its value. */}
      <div className="tw:mt-[0.5em] tw:mb-[1.25em] tw:grid tw:grid-cols-[auto_auto] tw:items-center tw:justify-center tw:gap-x-4 tw:gap-y-2 tw:text-left">
        {prompt.current !== undefined && (
          <>
            {/* It looks like the label of the input below. */}
            <span className="tw:text-[0.9em] tw:font-light tw:text-text">
              {prompt.current.label}
            </span>
            {/* Lined up with the number in the input below, after its border and padding. */}
            <span className="tw:pl-[calc(1em+1px)]">
              {prompt.current.value}
            </span>
          </>
        )}
        <label className="tw:m-0" htmlFor="prompt-number">
          {prompt.label}
        </label>
        <input
          autoFocus
          className="tw:m-0 tw:w-32"
          id="prompt-number"
          max={prompt.max}
          min={prompt.min}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onFocus={(event) => {
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            submitPrompt(value);
          }}
          type="number"
          value={value}
        />
      </div>
      <ul className={MODAL_ACTIONS_CLASS_NAME}>
        <li>
          <ModalButton
            onClick={() => {
              submitPrompt(value);
            }}
            variant="primary"
          >
            Set
          </ModalButton>
        </li>
        <li>
          <ModalButton onClick={cancelPrompt} variant="alt">
            Cancel
          </ModalButton>
        </li>
      </ul>
    </section>
  );
}

function MorphPrompt({
  prompt,
}: {
  readonly prompt: Extract<Prompt, { type: "morph" }>;
}) {
  const variant = getVariantById(prompt.variantId);
  const cardImages = getCardImages(variant);
  const [selected, setSelected] = useState<readonly [number, Rank]>([
    prompt.startSuitIndex,
    prompt.startRank,
  ]);
  const [text, setText] = useState(() =>
    getCardText(
      variant.suits[prompt.startSuitIndex]?.displayName,
      prompt.startRank,
    ),
  );

  return (
    <section
      className={MODAL_COLUMN_CLASS_NAME}
      id="morph-modal"
      onKeyDown={(event) => {
        // The prompt must not also close the dialog, which cannot close until the card is chosen.
        if (event.key !== "Escape") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        cancelPrompt();
      }}
    >
      <h3 className={PROMPT_TITLE_CLASS_NAME}>Morph</h3>
      <p className={MODAL_DESCRIPTION_CLASS_NAME}>{prompt.description}</p>
      <form
        className="tw:mt-[0.75em] tw:w-full"
        name="morph-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {/* A column for each suit and a row for each rank. The cards shrink to fit a narrow
            screen. */}
        <div
          className="tw:grid tw:justify-center tw:gap-[0.375em]"
          style={{
            gridTemplateColumns: `repeat(${variant.suits.length}, minmax(0, ${MORPH_CARD_MAX_WIDTH}))`,
          }}
        >
          {variant.ranks.map((rank) =>
            variant.suits.map((suit, suitIndex) => {
              const key = `${suitIndex}-${rank}`;
              const possible = prompt.possibilities.some(
                (possibility) =>
                  possibility[0] === suitIndex && possibility[1] === rank,
              );
              const imageName = `card-${suit.name}-${rank}`;
              const image = cardImages.get(imageName);
              assertDefined(
                image,
                `Failed to get the card image with label: ${imageName}`,
              );
              return (
                // The radio button is inside the label, so that the site's style of a radio
                // button's label does not apply.
                <label
                  className={`tw:m-0 tw:block tw:cursor-pointer ${possible ? "" : "tw:opacity-50"}`}
                  key={key}
                >
                  <input
                    aria-label={`${suit.displayName} ${rank}`}
                    checked={selected[0] === suitIndex && selected[1] === rank}
                    className="tw:peer tw:sr-only"
                    name="morph-cards"
                    onChange={() => {
                      setSelected([suitIndex, rank]);
                      setText(getCardText(suit.displayName, rank));
                    }}
                    type="radio"
                    value={`${suit.displayName} ${rank}`}
                  />
                  <span
                    className={MORPH_CARD_CLASS_NAME}
                    // The card images are canvases that the client draws once for each variant.
                    ref={(span) => {
                      span?.replaceChildren(image);
                    }}
                    style={MORPH_MARK_STYLE}
                  />
                </label>
              );
            }),
          )}
        </div>
        <label
          className="tw:mt-[1em] tw:mb-[0.25em] tw:block tw:text-game-muted"
          htmlFor="morph-modal-textbox"
        >
          Or type a card, such as red 1, b3, or blank
        </label>
        <input
          autoFocus
          className="tw:m-0 tw:w-full"
          id="morph-modal-textbox"
          name="morph-modal-textbox"
          onChange={(event) => {
            setText(event.target.value);
          }}
          onFocus={(event) => {
            event.target.select();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            submitPrompt(text);
          }}
          type="text"
          value={text}
        />
      </form>
      <ul className={MODAL_ACTIONS_CLASS_NAME}>
        <li>
          <ModalButton
            id="morph-modal-button-ok"
            onClick={() => {
              submitPrompt(text);
            }}
            variant="primary"
          >
            Morph
          </ModalButton>
        </li>
        <li>
          <ModalButton
            id="morph-modal-button-cancel"
            onClick={cancelPrompt}
            variant="alt"
          >
            Cancel
          </ModalButton>
        </li>
      </ul>
    </section>
  );
}

/** The text of a card, as the player would type it, such as "Red 1" or "Red S". */
function getCardText(suitName: string | undefined, rank: Rank): string {
  const rankLabel =
    rank === START_CARD_RANK ? START_CARD_RANK_LABEL : rank.toString();
  return `${suitName ?? ""} ${rankLabel}`;
}
