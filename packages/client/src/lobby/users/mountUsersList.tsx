import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "../../store";
import "../../tailwind.css"; // eslint-disable-line import-x/no-unassigned-import
import { getHTMLElement } from "../../utils";
import { OnlineUserCount, UsersList } from "./UsersList";

export function mountUsersList(): void {
  render(getHTMLElement("#lobby-users-container"), <UsersList />);
  for (const element of document.querySelectorAll<HTMLElement>(
    ".lobby-users-num",
  )) {
    render(element, <OnlineUserCount />);
  }
}

function render(container: HTMLElement, component: React.JSX.Element) {
  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>{component}</Provider>
    </StrictMode>,
  );
}
