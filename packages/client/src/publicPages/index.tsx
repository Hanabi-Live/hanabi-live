// The script of the server's public pages, such as a player's scores or history. It draws the table
// whose data the server puts in the page, with the controls and the chart that go with it, or the
// form of the password reset page.

// This file must not define a component. For Fast Refresh, Vite makes a file that defines one
// import itself. After the module changes, that import gets a timestamp, so its URL differs from
// the one in the page, and the page runs this script twice.

import "../zodConfig.ts"; // eslint-disable-line import-x/no-unassigned-import

import { publicPageTableSchema } from "@hanabi-live/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadCachedReducedMotion } from "../reducedMotionCache.ts";
import { store } from "../store.ts";
import { TAB_TRANSITION_CLASS_NAME } from "../tabClassName.ts";
import "../tailwind.css"; // eslint-disable-line import-x/no-unassigned-import
import { allowTranslators } from "../translators.ts";
import { PasswordReset } from "./PasswordReset.tsx";
import { PublicPageTable } from "./PublicPageTable.tsx";

allowTranslators();
loadCachedReducedMotion();
animateProfileTabs();

const passwordReset = document.querySelector("#password-reset");
if (passwordReset === null) {
  renderTable();
} else {
  createRoot(passwordReset).render(
    <StrictMode>
      <PasswordReset />
    </StrictMode>,
  );
}

function renderTable() {
  const container = document.querySelector<HTMLElement>("#public-page-table");
  if (container === null) {
    throw new Error('The page has no "#public-page-table" element.');
  }
  const table = publicPageTableSchema.parse(
    JSON.parse(container.dataset["table"] ?? ""),
  );

  createRoot(container).render(
    <StrictMode>
      <PublicPageTable table={table} />
    </StrictMode>,
  );
}

/**
 * Animates the tabs between a player's pages, which the server draws, like the tabs in the lobby. A
 * public page reads the "Reduced motion" setting once, from the browser's cache (see
 * "reducedMotionCache.ts").
 */
function animateProfileTabs() {
  if (store.getState().session.settings.reducedMotion) {
    return;
  }
  for (const tab of document.querySelectorAll("#profile-buttons a")) {
    tab.classList.add(...TAB_TRANSITION_CLASS_NAME.split(" "));
  }
}
