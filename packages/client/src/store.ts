import { configureStore } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { tablesReducer } from "./lobby/tables/tablesSlice";
import { usersReducer } from "./lobby/users/usersSlice";
import { sessionReducer } from "./sessionSlice";

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    tables: tablesReducer,
    users: usersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;

export const useAppSelector = useSelector.withTypes<RootState>();
