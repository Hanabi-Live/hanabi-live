import { configureStore } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { lobbyChatReducer } from "./lobby/chat/lobbyChatSlice.ts";
import { historyReducer } from "./lobby/gameHistory/historySlice.ts";
import { pregameReducer } from "./lobby/pregame/pregameSlice.ts";
import { tablesReducer } from "./lobby/tables/tablesSlice.ts";
import { usersReducer } from "./lobby/users/usersSlice.ts";
import { sessionReducer } from "./sessionSlice.ts";

export const store = configureStore({
  reducer: {
    history: historyReducer,
    lobbyChat: lobbyChatReducer,
    pregame: pregameReducer,
    session: sessionReducer,
    tables: tablesReducer,
    users: usersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export const useAppSelector = useSelector.withTypes<RootState>();
