// The prompt that is open, if any: a modal that asks for a choice, a number, or a card. "modals.ts"
// keeps the function that runs with the answer.

import type { Rank, SuitRankTuple, VariantId } from "@hanabi-live/game";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export type PromptModal =
  | {
      /** A button for each option. The answer is the option's text. */
      readonly type: "choice";
      readonly title: string;
      readonly description: string;
      readonly options: readonly string[];
    }
  | {
      /** A number input. The answer is the text of the input. */
      readonly type: "number";
      readonly title: string;
      readonly description: string | undefined;
      /** The value that the input changes, shown above it. */
      readonly current:
        { readonly label: string; readonly value: string } | undefined;
      readonly label: string;
      readonly value: string;
      readonly min: string | undefined;
      readonly max: string | undefined;
    }
  | {
      /** The cards of the variant, to pick one from. The answer is the text of the card. */
      readonly type: "morph";
      readonly description: string;
      readonly variantId: VariantId;
      readonly startSuitIndex: number;
      readonly startRank: Rank;
      /** The cards that the card can be, which show brighter than the others. */
      readonly possibilities: readonly SuitRankTuple[];
    };

interface PromptModalState {
  readonly prompt: PromptModal | undefined;
  /** Counts the prompts shown, so that each one starts again, even of the same type. */
  readonly count: number;
}

const initialState: PromptModalState = {
  prompt: undefined,
  count: 0,
};

const promptModalSlice = createSlice({
  name: "promptModal",
  initialState,
  reducers: {
    // A new state, because a draft cannot hold the read-only arrays of a prompt.
    promptModalShown: (state, action: PayloadAction<PromptModal>) => ({
      prompt: action.payload,
      count: state.count + 1,
    }),
    promptModalClosed(state) {
      state.prompt = undefined;
    },
  },
});

export const { promptModalShown, promptModalClosed } = promptModalSlice.actions;
export const promptModalReducer = promptModalSlice.reducer;
