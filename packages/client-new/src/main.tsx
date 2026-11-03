import { NEW_LOBBY_NAVIGATION_KEY } from "@hanabi-live/data";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { LobbyConnection } from "./connection";
import { actions, createLobbyStore } from "./store";
import "./style.css";
import { App } from "./ui/App";

const store = createLobbyStore();
sessionStorage.setItem("hanabi-lobby", "new");
sessionStorage.removeItem(NEW_LOBBY_NAVIGATION_KEY);
const connection = new LobbyConnection(store, (target) => {
  try {
    sessionStorage.setItem(NEW_LOBBY_NAVIGATION_KEY, JSON.stringify(target));
    globalThis.location.assign("/game");
    return true;
  } catch (error) {
    console.error("Unable to transfer to the game screen", error);
    store.dispatch(
      actions.notify({
        text: "Your browser could not prepare the game screen. Enable session storage and try again.",
      }),
    );
    return false;
  }
});
const root = document.querySelector("#root");
if (!root) {
  throw new Error("Missing lobby root.");
}
createRoot(root).render(
  <Provider store={store}>
    <BrowserRouter basename="/new">
      <App connection={connection} />
    </BrowserRouter>
  </Provider>,
);
void connection.checkSession();
globalThis.addEventListener("pagehide", () => connection.stop());
globalThis.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    connection.retryNow();
  }
});
globalThis.addEventListener("online", () => {
  if (store.getState().connection === "reconnecting") {
    connection.retryNow();
  }
});
globalThis.addEventListener("offline", () => connection.offline());
