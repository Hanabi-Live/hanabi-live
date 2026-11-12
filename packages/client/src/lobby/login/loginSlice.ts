// The state of the login screen, which "login.ts" changes as it checks our session and signs in.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

/** What the login box shows: a wait, a warning for Firefox users, or the form. */
type LoginStage = "loading" | "firefoxWarning" | "signIn";

interface LoginAlert {
  readonly message: string;
  /** Whether the check of our saved session failed, which a button can try again. */
  readonly retry: boolean;
  /** Counts the alerts, so that each one fades in and scrolls into view. */
  readonly count: number;
}

interface LoginState {
  readonly stage: LoginStage;
  /** Whether a login request is on its way. */
  readonly busy: boolean;
  readonly alert: LoginAlert | undefined;
  /**
   * The username that the server said has no account. Submitting it again creates the account, so
   * that a mistyped username does not create one by accident.
   */
  readonly confirmingUsername: string | undefined;
}

const initialState: LoginState = {
  stage: "loading",
  busy: false,
  alert: undefined,
  confirmingUsername: undefined,
};

const loginSlice = createSlice({
  name: "login",
  initialState,
  reducers: {
    loginStageChanged(state, action: PayloadAction<LoginStage>) {
      state.stage = action.payload;
    },
    loginStarted(state) {
      state.busy = true;
    },
    loginFailed(
      state,
      action: PayloadAction<{ message: string; retry?: boolean }>,
    ) {
      state.busy = false;
      state.alert = {
        message: action.payload.message,
        retry: action.payload.retry ?? false,
        count: (state.alert?.count ?? 0) + 1,
      };
    },
    loginAlertCleared(state) {
      state.alert = undefined;
    },
    noAccountFound(state, action: PayloadAction<string>) {
      state.busy = false;
      state.alert = undefined;
      state.confirmingUsername = action.payload;
    },
    confirmingUsernameCleared(state) {
      state.confirmingUsername = undefined;
    },
  },
});

export const {
  loginStageChanged,
  loginStarted,
  loginFailed,
  loginAlertCleared,
  noAccountFound,
  confirmingUsernameCleared,
} = loginSlice.actions;
export const loginReducer = loginSlice.reducer;
