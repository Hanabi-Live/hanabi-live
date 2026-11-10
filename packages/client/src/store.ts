import { configureStore } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { lobbyChatReducer } from "./lobby/chat/lobbyChatSlice";
import { historyReducer } from "./lobby/gameHistory/historySlice";
import { pregameReducer } from "./lobby/pregame/pregameSlice";
import { tablesReducer } from "./lobby/tables/tablesSlice";
import { usersReducer } from "./lobby/users/usersSlice";
import { sessionReducer } from "./sessionSlice";

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
