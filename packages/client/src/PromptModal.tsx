// The prompts: a choice (such as the next leader of a shared replay), a number (such as a turn or a
// card slot), and a card (the morph prompt of a hypothetical). "modals.ts" opens and closes the
// dialog that holds them, and runs the function that takes the answer.

import type { Rank } from "@hanabi-live/game";
import { getVariantById, START_CARD_RANK } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { useState } from "react";
import { ModalHeader } from "./ModalHeader.tsx";
import { START_CARD_RANK_LABEL } from "./constants.ts";
import { getCardImages } from "./game/cardImages.ts";
import { cancelPrompt, submitPrompt } from "./modals.ts";
import type { PromptModal as Prompt } from "./promptModalSlice.ts";
import { useAppSelector } from "./store.ts";

/** A morph option: a card with a radio button that is hidden behind a mark in its corner. */
const MORPH_LABEL_CLASS_NAME = [
  "tw:relative tw:mx-[0.625em] tw:my-[0.3em] tw:block tw:max-h-[4.5em] tw:cursor-pointer tw:overflow-hidden tw:border tw:border-solid tw:border-morph-option-border tw:p-[0.625em] tw:leading-[1em]",
  "tw:peer-checked:border-morph-option-selected",
  // The mark, which grows in when the card is selected.
  "tw:before:absolute tw:before:top-px tw:before:left-px tw:before:block tw:before:size-[1.5em] tw:before:rounded-[50%] tw:before:border tw:before:border-solid tw:before:border-morph-option-border tw:before:bg-surface tw:before:text-center tw:before:leading-[1.75em] tw:before:text-text-on-accent tw:before:duration-[0.4s] tw:before:content-['_'] tw:before:[transform:scale(0)]",
  "tw:peer-checked:before:z-1 tw:peer-checked:before:border-[unset] tw:peer-checked:before:bg-morph-option-border tw:peer-checked:before:leading-[1.2em] tw:peer-checked:before:content-[var(--morph-mark)] tw:peer-checked:before:[transform:scale(1)]",
  // The card, which shrinks a little when it is selected.
  "tw:[&_canvas]:h-[10vh] tw:[&_canvas]:origin-center tw:[&_canvas]:duration-[0.2s] tw:peer-checked:[&_canvas]:-z-1 tw:peer-checked:[&_canvas]:[transform:scale(0.9)]",
].join(" ");

/** The mark of the selected card: a check mark, escaped for CSS. */
const MORPH_MARK_STYLE = {
  "--morph-mark": String.raw`"\2713"`,
} as React.CSSProperties;

/** A row of cards, without the stripes and lines of other tables. */
const MORPH_TABLE_ROW_CLASS_NAME = "tw:border-0 tw:bg-transparent";

/** A row of the morph prompt, below its cards. */
const MORPH_ROW_CLASS_NAME = "row tw:mt-4 tw:mb-0";

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
        <>
          <ModalHeader heading={prompt.title} />
          <p>{prompt.description}</p>
          <div className="tw:flex tw:content-evenly tw:justify-center tw:gap-x-[0.625em]">
            {prompt.options.map((option, index) => (
              <button
                // The dialog would otherwise focus its close button, which comes first.
                autoFocus={index === 0}
                className="button"
                key={option}
                onClick={() => {
                  submitPrompt(option);
                }}
                type="submit"
              >
                {option}
              </button>
            ))}
          </div>
        </>
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
    <>
      <ModalHeader heading={prompt.title} />
      {prompt.description !== undefined && <p>{prompt.description}</p>}
      {prompt.current !== undefined && (
        <div className="row">
          <div className="col-6">{prompt.current.label}</div>
          <div className="col-6">
            <span className="tw:ml-[0.9em]">{prompt.current.value}</span>
          </div>
        </div>
      )}
      <div className="row">
        <div className="col-6">{prompt.label}</div>
        <div className="col-6">
          <input
            autoFocus
            max={prompt.max}
            min={prompt.min}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            onFocus={(event) => {
              event.target.select();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitPrompt(value);
              }
            }}
            type="number"
            value={value}
          />
        </div>
      </div>
      <div className="row">
        <div className="col-2 off-5">
          <button
            className="button"
            onClick={() => {
              submitPrompt(value);
            }}
            type="submit"
          >
            Go
          </button>
        </div>
      </div>
    </>
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
    <div
      id="morph-modal"
      onKeyDown={(event) => {
        // The prompt must not also close the dialog, which cannot close until the card is chosen.
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelPrompt();
        }
      }}
    >
      <h2 className="tw:m-0">Morph</h2>
      <p className="tw:m-0">{prompt.description}</p>
      <form
        className="tw:mb-2"
        name="morph-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <table className="tw:mb-2">
          <tbody>
            {variant.ranks.map((rank) => (
              <tr className={MORPH_TABLE_ROW_CLASS_NAME} key={rank}>
                {variant.suits.map((suit, suitIndex) => {
                  const radioId = `morph-radio-${suitIndex}-${rank}`;
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
                    <td
                      className={possible ? "tw:p-1" : "tw:p-1 tw:opacity-50"}
                      key={suit.name}
                    >
                      <input
                        checked={
                          selected[0] === suitIndex && selected[1] === rank
                        }
                        className="tw:peer"
                        id={radioId}
                        name="morph-cards"
                        onChange={() => {
                          setSelected([suitIndex, rank]);
                          setText(getCardText(suit.displayName, rank));
                        }}
                        type="radio"
                        value={`${suit.displayName} ${rank}`}
                      />
                      <label
                        className={MORPH_LABEL_CLASS_NAME}
                        htmlFor={radioId}
                        // The card images are canvases that the client draws once for each variant.
                        ref={(label) => {
                          label?.replaceChildren(image);
                        }}
                        style={MORPH_MARK_STYLE}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row tw:my-4">
          <div className="col-6 tw:relative tw:top-[1.5em]">
            or type in the card (e.g. red 1, b3, blank)
          </div>
          <div className="row tw:my-4">
            <input
              autoFocus
              id="morph-modal-textbox"
              name="morph-modal-textbox"
              onChange={(event) => {
                setText(event.target.value);
              }}
              onFocus={(event) => {
                event.target.select();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitPrompt(text);
                }
              }}
              type="text"
              value={text}
            />
          </div>
        </div>
      </form>
      <div className={MORPH_ROW_CLASS_NAME}>
        <div className="col-2 off-3">
          <button
            className="button"
            id="morph-modal-button-ok"
            onClick={() => {
              submitPrompt(text);
            }}
            type="submit"
          >
            Ok
          </button>
        </div>
        <div className="col-2 off-1">
          <button
            className="button"
            id="morph-modal-button-cancel"
            onClick={cancelPrompt}
            type="submit"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** The text of a card, as the player would type it, such as "Red 1" or "Red S". */
function getCardText(suitName: string | undefined, rank: Rank): string {
  const rankLabel =
    rank === START_CARD_RANK ? START_CARD_RANK_LABEL : rank.toString();
  return `${suitName ?? ""} ${rankLabel}`;
}
