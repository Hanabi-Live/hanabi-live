import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { UsersList, UsersTitle } from "./UsersList";

export function mountUsersList(): void {
  renderRoot(getHTMLElement("#lobby-users-container"), <UsersList />);
  renderRoot(getHTMLElement("#lobby-users-title"), <UsersTitle />);
}
