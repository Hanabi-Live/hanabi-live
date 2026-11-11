import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { UsersList, UsersTitle } from "./UsersList.tsx";

export function mountUsersList(): void {
  renderRoot(getHTMLElement("#lobby-users-container"), <UsersList />);
  renderRoot(getHTMLElement("#lobby-users-title"), <UsersTitle />);
}
