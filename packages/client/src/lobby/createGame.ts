// The "Create Game" page, which also changes the options of an unstarted game. The form itself is
// in "createGame/CreateGame.tsx".

import {
  DEFAULT_VARIANT_ID,
  doesVariantIdExist,
  getVariant,
} from "@hanabi-live/game";
import equal from "fast-deep-equal";
import type { SuggestedSettings } from "../chatKind.ts";
import { globals } from "../Globals.ts";
import { settingsChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import type { CreateTable } from "./createGameForm.ts";
import * as lobbyPage from "./lobbyPage.ts";

/** Shows the page from the lobby (to create a game) or the pre-game screen (to change options). */
export function show(): void {
  // A variant that no longer exists becomes the default one.
  const { createTable } = store.getState().session.settings;
  if (!doesVariantIdExist(createTable.options.variantId)) {
    store.dispatch(
      settingsChanged({
        ...store.getState().session.settings,
        createTable: {
          ...createTable,
          options: {
            ...createTable.options,
            variantId: DEFAULT_VARIANT_ID,
          },
        },
      }),
    );
  }

  lobbyPage.show("createGame");
}

export function acceptOptionsFromGuest(suggestion: SuggestedSettings): void {
  globals.connection.send("tableUpdate", {
    tableId: globals.joinedTableId,
    settings: suggestion,
  });
}

/** Remembers the table that the form starts from next time, if it changed. */
export function remember(createTable: CreateTable): void {
  if (!equal(createTable, store.getState().session.settings.createTable)) {
    store.dispatch(
      settingsChanged({
        ...store.getState().session.settings,
        createTable,
      }),
    );
    globals.connection.send("settings", {
      settings: {
        createTable,
      },
    });
  }
}

/** Remembers a variant that a chat command chose. */
export function rememberVariant(variantName: string): void {
  const { createTable } = store.getState().session.settings;
  remember({
    ...createTable,
    options: {
      ...createTable.options,
      variantId: getVariant(variantName).id,
    },
  });
}
