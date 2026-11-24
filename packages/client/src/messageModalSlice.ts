// The message modal that is open, if any: a warning, an error, a question, or a request for the
// password of a table. "modals.ts" keeps the functions that its buttons run.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

/**
 * Why the error modal shows: the server closed the connection ("disconnected"), the server stopped
 * and the client waits for it to come back ("maintenance"), or something on this page failed
 * ("failed").
 */
export type ErrorCause = "disconnected" | "maintenance" | "failed";

/** A question that asks the user to confirm an action that can go wrong. */
export interface Confirmation {
  readonly title: string;
  readonly description: string;
  /** The name of the action, such as "Play anyway". */
  readonly confirmText: string;
}

export type MessageModal =
  | {
      readonly type: "warning";
      /** It can hold markup from the server and the client. */
      readonly html: string;
    }
  | {
      readonly type: "error";
      /** It can hold markup, such as a formatted stack trace. */
      readonly html: string;
      readonly cause: ErrorCause;
    }
  | {
      readonly type: "idle";
      /** When the game ends, in milliseconds since the epoch. */
      readonly deadline: number;
      /** Whether we can keep the game going, which only players can do. */
      readonly canKeepPlaying: boolean;
    }
  | ({
      readonly type: "confirm";
    } & Confirmation)
  | {
      readonly type: "password";
      readonly tableId: number;
    };

interface MessageModalState {
  readonly modal: MessageModal | undefined;
  /** Counts the modals shown, so that each one starts again, even of the same type. */
  readonly count: number;
}

const initialState: MessageModalState = {
  modal: undefined,
  count: 0,
};

const messageModalSlice = createSlice({
  name: "messageModal",
  initialState,
  reducers: {
    messageModalShown(state, action: PayloadAction<MessageModal>) {
      state.modal = action.payload;
      state.count++;
    },
    messageModalClosed(state) {
      state.modal = undefined;
    },
  },
});

export const { messageModalShown, messageModalClosed } =
  messageModalSlice.actions;
export const messageModalReducer = messageModalSlice.reducer;
