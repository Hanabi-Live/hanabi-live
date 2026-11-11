// The users who are currently online, from the "userList", "user", "userLeft", and "userInactive"
// server messages.

import type { ServerCommandData, UserID } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store.ts";

type User = ServerCommandData["user"];

/** How a user relates to us, which decides their color and position in the list. */
type UserKind = "self" | "friend" | "other";

export interface UserRow {
  readonly user: User;
  readonly kind: UserKind;
}

/** We are listed first, then our friends, then everyone else. */
const KIND_ORDER = {
  self: 0,
  friend: 1,
  other: 2,
} as const satisfies Record<UserKind, number>;

const usersAdapter = createEntityAdapter({
  selectId: (user: User) => user.userId,
});

const usersSlice = createSlice({
  name: "users",
  initialState: usersAdapter.getInitialState({
    /** Whether the list shows the bots instead of the users. */
    botsShown: false,
  }),
  reducers: {
    userChanged(state, action: PayloadAction<User>) {
      usersAdapter.setOne(state, action.payload);
    },
    usersListed(state, action: PayloadAction<readonly User[]>) {
      usersAdapter.setMany(state, action.payload);
    },
    userLeft(state, action: PayloadAction<UserID>) {
      usersAdapter.removeOne(state, action.payload);
    },
    userInactiveChanged(
      state,
      action: PayloadAction<{ userId: UserID; inactive: boolean }>,
    ) {
      const { userId, inactive } = action.payload;
      usersAdapter.updateOne(state, { id: userId, changes: { inactive } });
    },
    usersCleared(state) {
      usersAdapter.removeAll(state);
    },
    botsShownChanged(state, action: PayloadAction<boolean>) {
      state.botsShown = action.payload;
    },
  },
});

export const {
  userChanged,
  usersListed,
  userLeft,
  userInactiveChanged,
  usersCleared,
  botsShownChanged,
} = usersSlice.actions;
export const usersReducer = usersSlice.reducer;

const usersSelectors = usersAdapter.getSelectors(
  (state: RootState) => state.users,
);

const selectAllRows = createSelector(
  [
    usersSelectors.selectAll,
    (state: RootState) => state.session.username,
    (state: RootState) => state.session.friends,
  ],
  (
    users: readonly User[],
    username: string,
    friends: readonly string[],
  ): readonly UserRow[] => {
    const friendNames = new Set(friends);
    return users
      .map((user) => ({
        user,
        kind: getKind(user.username, username, friendNames),
      }))
      .toSorted((a, b) => {
        const kindOrder = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
        return kindOrder === 0
          ? // Sort case-insensitively, which does not happen by default.
            a.user.username
              .toLowerCase()
              .localeCompare(b.user.username.toLowerCase())
          : kindOrder;
      });
  },
);

function getKind(
  name: string,
  username: string,
  friendNames: ReadonlySet<string>,
): UserKind {
  if (name === username) {
    return "self";
  }
  return friendNames.has(name) ? "friend" : "other";
}

/** Bots are listed separately, since they are not really users. */
export const selectUserRows = createSelector(
  [selectAllRows],
  (rows): readonly UserRow[] => rows.filter((row) => !row.user.bot),
);

export const selectBotRows = createSelector(
  [selectAllRows],
  (rows): readonly UserRow[] => rows.filter((row) => row.user.bot),
);

export function selectUserCount(state: RootState): number {
  return selectUserRows(state).length;
}

/** The bots tab exists only while bots are online. */
export function selectBotsShown(state: RootState): boolean {
  return state.users.botsShown && selectBotRows(state).length > 0;
}

/**
 * The highest H-Group level that an online user chose, if they chose one and have the H-Group
 * features enabled.
 */
export function selectHGroupLevel(
  state: RootState,
  username: string,
): number | undefined {
  const user = usersSelectors
    .selectAll(state)
    .find((loopUser) => loopUser.username === username);
  return user?.hGroupConventions === true ? user.hGroupLevel : undefined;
}
