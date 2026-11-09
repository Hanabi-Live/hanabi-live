import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import "./tailwind.css"; // eslint-disable-line import-x/no-unassigned-import

/** Renders a React component, with access to the store, in place of an element's contents. */
export function renderRoot(
  container: HTMLElement,
  component: React.JSX.Element,
): void {
  createRoot(container).render(
    <StrictMode>
      <Provider store={store}>{component}</Provider>
    </StrictMode>,
  );
}
