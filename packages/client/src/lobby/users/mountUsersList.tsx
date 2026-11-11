import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { UsersList, UsersTitle } from "./UsersList.tsx";

export function mountUsersList(): void {
  renderRoot(getHtmlElement("#lobby-users-container"), <UsersList />);
  renderRoot(getHtmlElement("#lobby-users-title"), <UsersTitle />);
}
