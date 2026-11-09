import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { OnlineUserCount, UsersList } from "./UsersList";

export function mountUsersList(): void {
  renderRoot(getHTMLElement("#lobby-users-container"), <UsersList />);
  for (const element of document.querySelectorAll<HTMLElement>(
    ".lobby-users-num",
  )) {
    renderRoot(element, <OnlineUserCount />);
  }
}
