import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import "./tailwind.css"; // eslint-disable-line import-x/no-unassigned-import

/** Renders a React component, with access to the store, in place of an element's contents. */
export function renderRoot(
  container: HTMLElement,
  component: React.JSX.Element,
): Root {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <Provider store={store}>{component}</Provider>
    </StrictMode>,
  );
  return root;
}
