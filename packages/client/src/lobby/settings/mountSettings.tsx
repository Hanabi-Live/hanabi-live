import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { SettingsPage } from "./SettingsPage.tsx";

export function mountSettings(): void {
  renderRoot(getHtmlElement("#lobby-settings"), <SettingsPage />);
}
