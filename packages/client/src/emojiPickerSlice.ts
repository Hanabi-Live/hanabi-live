// The emote and emoji picker, while it is open: the chat input that it adds to.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface EmojiPickerState {
  /** The ID of the chat input, or `undefined` while the picker is closed. */
  readonly inputId: string | undefined;
}

const initialState: EmojiPickerState = {
  inputId: undefined,
};

const emojiPickerSlice = createSlice({
  name: "emojiPicker",
  initialState,
  reducers: {
    emojiPickerOpened(state, action: PayloadAction<string>) {
      state.inputId = action.payload;
    },
    emojiPickerClosed(state) {
      state.inputId = undefined;
    },
  },
});

export const { emojiPickerOpened, emojiPickerClosed } =
  emojiPickerSlice.actions;
export const emojiPickerReducer = emojiPickerSlice.reducer;
