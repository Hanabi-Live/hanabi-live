// The toasts that tell the player about the achievements that they just unlocked. The server sends
// one for each achievement, after it saves the game that unlocked it.

import type { ServerEventData } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export interface AchievementToast {
  /** Tells apart two toasts for the same achievement, such as after a reconnect. */
  readonly key: number;
  readonly achievement: ServerEventData["achievementUnlocked"];
}

interface AchievementToastState {
  readonly toasts: readonly AchievementToast[];
  readonly nextKey: number;
}

const initialState: AchievementToastState = {
  toasts: [],
  nextKey: 0,
};

const achievementToastSlice = createSlice({
  name: "achievementToast",
  initialState,
  reducers: {
    achievementUnlocked: (
      state,
      action: PayloadAction<ServerEventData["achievementUnlocked"]>,
    ) => ({
      toasts: [
        ...state.toasts,
        {
          key: state.nextKey,
          achievement: action.payload,
        },
      ],
      nextKey: state.nextKey + 1,
    }),
    achievementToastClosed: (state, action: PayloadAction<number>) => ({
      ...state,
      toasts: state.toasts.filter((toast) => toast.key !== action.payload),
    }),
  },
});

export const { achievementUnlocked, achievementToastClosed } =
  achievementToastSlice.actions;
export const achievementToastReducer = achievementToastSlice.reducer;
