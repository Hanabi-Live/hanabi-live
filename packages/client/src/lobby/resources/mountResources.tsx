import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { Resources } from "./Resources.tsx";

export function mountResources(): void {
  renderRoot(getHtmlElement("#lobby-resources"), <Resources />);
}
