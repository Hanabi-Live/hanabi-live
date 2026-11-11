import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { SettingsPage } from "./SettingsPage.tsx";

export function mountSettings(): void {
  renderRoot(getHTMLElement("#lobby-settings"), <SettingsPage />);
}
