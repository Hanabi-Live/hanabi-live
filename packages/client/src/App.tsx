// The page's one React root. Each part of the page renders into its own element of the page's
// template through a portal, so that the template keeps its layout.

import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { EmojiPicker } from "./EmojiPicker.tsx";
import { MessageModal } from "./MessageModal.tsx";
import { fadeIn, hideElement } from "./elementVisibility.ts";
import { GameChatBox } from "./game/GameChatBox.tsx";
import { GameScreen } from "./game/newUi/GameScreen.tsx";
import { switchToClassic } from "./game/newUi/newUi.ts";
import { LOBBY_CLASS_NAME, Lobby } from "./lobby/Lobby.tsx";
import { scrollLobbyChatToBottom } from "./lobby/chat/LobbyChat.tsx";
import { LoginBox } from "./lobby/login/LoginBox.tsx";
import { Tutorial } from "./lobby/login/Tutorial.tsx";
import type { LoginPage } from "./lobby/login/loginSlice.ts";
import { Nav } from "./lobby/nav/Nav.tsx";
import { EMOJI_MODAL_ID } from "./modals.ts";
import { renderRoot } from "./renderRoot.tsx";
import { useAppSelector } from "./store.ts";
import { getHtmlElement } from "./utils.ts";

/** The elements of the template that the parts of the page render into. */
type Targets = Readonly<
  Record<
    | "nav"
    | "loginBox"
    | "tutorial"
    | "lobby"
    | "messageModal"
    | "emojiModal"
    | "gameChat"
    | "newUi",
    HTMLElement
  >
>;

export function mountApp(): void {
  const targets: Targets = {
    nav: getHtmlElement("#nav"),
    loginBox: getHtmlElement("#login-box"),
    tutorial: getHtmlElement("#tutorial"),
    lobby: getHtmlElement("#lobby"),
    messageModal: getHtmlElement("#message-modal"),
    emojiModal: getHtmlElement(`#${EMOJI_MODAL_ID}`),
    gameChat: getHtmlElement("#game-chat-modal-white"),
    newUi: getHtmlElement("#game-new-ui"),
  };

  // The React parts replace what the template shows until the client loads, such as the wait in
  // place of the login form.
  for (const target of Object.values(targets)) {
    target.replaceChildren();
  }
  targets.lobby.classList.add(...LOBBY_CLASS_NAME.split(" "));

  const container = document.createElement("div");
  document.body.append(container);
  renderRoot(container, <App targets={targets} />);
}

function App({ targets }: { readonly targets: Targets }): React.JSX.Element {
  const newUiShown = useAppSelector((state) => state.newUi.shown);
  const emojiInputId = useAppSelector((state) => state.emojiPicker.inputId);
  const loginPage = useAppSelector((state) => state.login.page);

  useLayoutEffect(() => {
    showLoginPage(loginPage, targets);
  }, [loginPage, targets]);

  return (
    <>
      {createPortal(<Nav />, targets.nav)}
      {createPortal(<LoginBox />, targets.loginBox)}
      {createPortal(<Tutorial />, targets.tutorial)}
      {createPortal(<Lobby />, targets.lobby)}
      {createPortal(<MessageModal />, targets.messageModal)}
      {emojiInputId !== undefined
        && createPortal(
          <EmojiPicker inputId={emojiInputId} />,
          targets.emojiModal,
        )}
      {createPortal(<GameChatBox />, targets.gameChat)}
      {newUiShown
        && createPortal(
          <GameScreen onSwitchToClassic={switchToClassic} />,
          targets.newUi,
        )}
    </>
  );
}

/** Shows the login screen, the tutorial, or the lobby. The server renders the login screen. */
function showLoginPage(page: LoginPage, targets: Targets) {
  if (page === "login") {
    return;
  }

  hideElement(getHtmlElement("#login"));
  if (page === "tutorial") {
    fadeIn(targets.tutorial);
    return;
  }
  hideElement(targets.tutorial);

  // Disable scroll bars. Even with height and width 100%, the scroll bar can pop up when going back
  // from a game to the lobby. It also can show up in-game if a tooltip animates off of the edge of
  // the screen. So we can set "overflow" to explicitly prevent this from occurring. We do not want
  // to set this in the stylesheets because there should be scrolling enabled on the login screen.
  // We need to scroll to the top of the screen before disabling the scroll bars or else the lobby
  // can become misaligned when logging in from a scroll-down state. The login screen can scroll the
  // body element itself rather than the window, so reset both.
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  document.body.style.overflow = "hidden";

  targets.lobby.classList.remove("hidden");
  document.querySelector<HTMLElement>("#lobby-chat-input")?.focus();

  // Scroll to the bottom of the chat. (This is necessary if we are going to the lobby after the
  // tutorial.)
  scrollLobbyChatToBottom();
}
