import { configureStore } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { emojiPickerReducer } from "./emojiPickerSlice.ts";
import { gameChatReducer } from "./game/gameChatSlice.ts";
import {
  gameSliceReducer,
  gameStarted,
  gameUpdated,
} from "./game/gameSlice.ts";
import { newUiReducer } from "./game/newUi/newUiSlice.ts";
import { lobbyChatReducer } from "./lobby/chat/lobbyChatSlice.ts";
import { historyReducer } from "./lobby/gameHistory/historySlice.ts";
import { loginReducer } from "./lobby/login/loginSlice.ts";
import { pregameReducer } from "./lobby/pregame/pregameSlice.ts";
import { tablesReducer } from "./lobby/tables/tablesSlice.ts";
import { usersReducer } from "./lobby/users/usersSlice.ts";
import { messageModalReducer } from "./messageModalSlice.ts";
import { sessionReducer } from "./sessionSlice.ts";

export const store = configureStore({
  reducer: {
    emojiPicker: emojiPickerReducer,
    game: gameSliceReducer,
    gameChat: gameChatReducer,
    history: historyReducer,
    lobbyChat: lobbyChatReducer,
    login: loginReducer,
    messageModal: messageModalReducer,
    newUi: newUiReducer,
    pregame: pregameReducer,
    session: sessionReducer,
    tables: tablesReducer,
    users: usersReducer,
  },
  // In development, these checks walk the state after every action. The game's state keeps a whole
  // game state for each turn of a replay, so they skip it. Its reducers use Immer, which freezes
  // it.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: { ignoredPaths: ["game"] },
      serializableCheck: {
        ignoredPaths: ["game"],
        ignoredActions: [gameStarted.type, gameUpdated.type],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;

export const useAppSelector = useSelector.withTypes<RootState>();
