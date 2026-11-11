import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { Nav } from "./Nav.tsx";

export function mountNav(): void {
  renderRoot(getHtmlElement("#nav"), <Nav />);
}
