import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { SettingsPage } from "./SettingsPage";

export function mountSettings(): void {
  renderRoot(getHTMLElement("#lobby-settings"), <SettingsPage />);
}
