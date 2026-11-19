// The `bot()` console command, for development. It adds a bot named "bot-test" to the lobby's user
// list, so that you can check how the list shows bots without connecting one. Only this browser
// sees it. Run it again to remove the bot. It goes away when the page reloads or the connection
// restarts.

import type { UserId } from "@hanabi-live/data";
import { store } from "../../store.ts";
import { userChanged, userLeft } from "./usersSlice.ts";

const BOT_NAME = "bot-test";

/** The largest user ID, which no real account has. */
const BOT_USER_ID = 2_147_483_647 as UserId;

// Allow TypeScript to modify the browser's "window" object:
// https://stackoverflow.com/questions/56457935/typescript-error-property-x-does-not-exist-on-type-window
declare global {
  interface Window {
    bot: () => void;
  }
}

// eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-global-object-property-assignment
window.bot = () => {
  if (store.getState().users.entities[BOT_USER_ID] !== undefined) {
    store.dispatch(userLeft(BOT_USER_ID));
    console.log(`Removed the fake bot "${BOT_NAME}".`);
    return;
  }

  store.dispatch(
    userChanged({
      activity: {
        type: "lobby",
      },
      bot: true,
      hGroupConventions: false,
      inactive: false,
      userId: BOT_USER_ID,
      username: BOT_NAME,
    }),
  );
  console.log(
    `Added the fake bot "${BOT_NAME}" to the user list. Run bot() again to remove it.`,
  );
};
