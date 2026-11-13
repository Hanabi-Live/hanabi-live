// The page's one React root. Each part of the page renders into its own element of the page's
// template through a portal, so that the template keeps its layout.

import { createPortal } from "react-dom";
import { MessageModal } from "./MessageModal.tsx";
import { GameChatBox } from "./game/GameChatBox.tsx";
import { GameScreen } from "./game/newUi/GameScreen.tsx";
import { switchToClassic } from "./game/newUi/newUi.ts";
import { LOBBY_CLASS_NAME, Lobby } from "./lobby/Lobby.tsx";
import { LoginBox } from "./lobby/login/LoginBox.tsx";
import { Tutorial } from "./lobby/login/Tutorial.tsx";
import { Nav } from "./lobby/nav/Nav.tsx";
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

  return (
    <>
      {createPortal(<Nav />, targets.nav)}
      {createPortal(<LoginBox />, targets.loginBox)}
      {createPortal(<Tutorial />, targets.tutorial)}
      {createPortal(<Lobby />, targets.lobby)}
      {createPortal(<MessageModal />, targets.messageModal)}
      {createPortal(<GameChatBox />, targets.gameChat)}
      {newUiShown
        && createPortal(
          <GameScreen onSwitchToClassic={switchToClassic} />,
          targets.newUi,
        )}
    </>
  );
}
