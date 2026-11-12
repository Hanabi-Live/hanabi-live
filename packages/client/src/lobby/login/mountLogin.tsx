import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { LoginBox } from "./LoginBox.tsx";
import { Tutorial } from "./Tutorial.tsx";

export function mountLogin(): void {
  renderRoot(getHtmlElement("#login-box"), <LoginBox />);
  renderRoot(getHtmlElement("#tutorial"), <Tutorial />);
}
