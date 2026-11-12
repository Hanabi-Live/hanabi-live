import type { ServerCommandData } from "@hanabi-live/data";
import {
  DEFAULT_MAX_PLAYERS,
  DEFAULT_TABLE_NAME_SUFFIX,
  defaultSettings,
  tableIdSchema,
} from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { DEFAULT_VARIANT_NAME, isValidPlayerIndex } from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import { HISTORY_HASH, LOCAL_STORAGE_KEY, PATH } from "../constants.ts";
import { globals } from "../Globals.ts";
import { setBrowserAddressBarPath } from "../utils.ts";
import { readDeal } from "./deal.ts";
import { parseGameJson } from "./gameJson.ts";
import * as history from "./history.ts";
import { getOtherScoresSeed } from "./historyHash.ts";
import { expand } from "./hypoCompress.ts";
import { replayVisibility } from "./replayVisibility.ts";

export function parseAndGoto(data: ServerCommandData["welcome"]): void {
  // A link to a specific game or replay takes precedence over returning to the table that we were
  // at before we disconnected. (Custom paths are disabled for first time users.)
  if (!data.firstTimeUser && gotoPath(data)) {
    return;
  }

  // Otherwise, go back to the table that we were at. Do nothing else for first time users or when
  // we restore a lobby history view.
  if (
    reconnectToTable(data)
    || data.firstTimeUser
    || restoreLobbyHistoryView()
  ) {
    return;
  }

  // Otherwise, we will stay in the lobby.
  setBrowserAddressBarPath(PATH.LOBBY);
}

/** Returns whether the server informed us of a table that we were at and we went back to it. */
function reconnectToTable(data: ServerCommandData["welcome"]): boolean {
  // If the server has informed us that we are currently playing in an ongoing game, automatically
  // reconnect to that game.
  const firstTableId = data.playingAtTables[0];
  if (firstTableId !== undefined) {
    globals.conn!.send("tableReattend", {
      tableId: firstTableId,
    });
    return true;
  }

  // If the server has informed us that we were previously spectating a table, automatically
  // spectate the newest one.
  const spectatedTable = data.spectatingAtTables[0];
  if (spectatedTable !== undefined) {
    globals.conn!.send("tableSpectate", spectatedTable);
    return true;
  }

  return false;
}

/** Returns whether the URL path specifies somewhere to go and we went there. */
function gotoPath(data: ServerCommandData["welcome"]): boolean {
  // Automatically create a table if we are using a "/create-table" URL.
  if (globalThis.location.pathname === PATH.CREATE_TABLE) {
    const urlParams = new URLSearchParams(globalThis.location.search);
    // Without a name, the table is named after us.
    const nameParam = urlParams.get("name")?.trim() ?? "";
    const name =
      nameParam === ""
        ? `${data.username}${DEFAULT_TABLE_NAME_SUFFIX}`
        : nameParam;
    const variantName = urlParams.get("variantName") ?? DEFAULT_VARIANT_NAME;
    const timeControl =
      urlParams.get("timed") === "true"
        ? {
            baseSeconds:
              parseIntSafe(urlParams.get("timeBaseSeconds") ?? "")
              ?? defaultSettings.createTable.timeControl.baseSeconds,
            perTurnSeconds:
              parseIntSafe(urlParams.get("timePerTurnSeconds") ?? "")
              ?? defaultSettings.createTable.timeControl.perTurnSeconds,
          }
        : undefined;
    const speedrun = urlParams.get("speedrun") === "true";
    const deckPlays = urlParams.get("deckPlays") === "true";
    const emptyClues = urlParams.get("emptyClues") === "true";
    const oneExtraCard = urlParams.get("oneExtraCard") === "true";
    const oneLessCard = urlParams.get("oneLessCard") === "true";
    const allOrNothing = urlParams.get("allOrNothing") === "true";
    const detrimentalCharacters =
      urlParams.get("detrimentalCharacters") === "true";
    const password = urlParams.get("password") ?? "";
    // A blank seed deals one that none of the players have played.
    const deal = readDeal(
      urlParams.get("seed") ?? "",
      urlParams.get("replayGameId") ?? "",
      urlParams.get("replayTurn") ?? "",
    );

    globals.conn!.send("tableCreate", {
      settings: {
        name,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        options: {
          variantName,
          timeControl,
          speedrun,
          deckPlays,
          emptyClues,
          oneExtraCard,
          oneLessCard,
          allOrNothing,
          detrimentalCharacters,
        },
        ...(deal !== undefined && { deal }),
      },
      ...(password !== "" && { password }),
    });
    return true;
  }

  // Automatically join a pre-game if we are using a "/pre-game/123" URL. If we were spectating it
  // (such as before a page refresh), spectate it again instead.
  const preGameMatch = /\/pre-game\/(\d+)/u.exec(globalThis.location.pathname);
  if (preGameMatch !== null) {
    const tableIdString = preGameMatch[1];
    if (tableIdString !== undefined) {
      const tableId = parseIntSafe(tableIdString);
      if (tableId !== undefined && tableId > 0) {
        // We can be listed at other tables that we spectated, so look for this one.
        const spectatedTable = data.spectatingAtTables.find(
          (table) => table.tableId === tableId,
        );
        if (spectatedTable !== undefined) {
          globals.conn!.send("tableSpectate", spectatedTable);
          return true;
        }

        // Here we unconditionally send password from cookies. If the game has no password, the
        // server will ignore it.
        const password =
          localStorage.getItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD) ?? "";
        globals.conn!.send("tableJoin", {
          tableId,
          ...(password !== "" && { password }),
        });
        return true;
      }
    }
  }

  // Automatically spectate a game if we are using a "/game/123" URL (or reattend it if we are one
  // of its players). We can also shadow a player in a seat with "/game/123/shadow/0".
  const gameMatch = /\/game\/(\d+)/u.exec(globalThis.location.pathname);
  if (gameMatch !== null) {
    const tableIdString = gameMatch[1];
    if (tableIdString !== undefined) {
      const tableId = parseIntSafe(tableIdString);
      if (tableId !== undefined && tableId > 0) {
        if (data.playingAtTables.includes(tableIdSchema.parse(tableId))) {
          globals.conn!.send("tableReattend", {
            tableId,
          });
          return true;
        }

        const shadowMatch = /\/shadow\/(\d+)/u.exec(
          globalThis.location.pathname,
        );
        let shadowingPlayerIndex: PlayerIndex | undefined;
        const shadowingPlayerIndexString = shadowMatch?.[1];
        if (shadowingPlayerIndexString !== undefined) {
          const shadowingPlayerIndexInt = parseIntSafe(
            shadowingPlayerIndexString,
          );
          if (isValidPlayerIndex(shadowingPlayerIndexInt)) {
            shadowingPlayerIndex = shadowingPlayerIndexInt;
          }
        }
        globals.conn!.send("tableSpectate", {
          tableId,
          shadowingPlayerIndex,
        });
        return true;
      }
    }
  }

  // Automatically go into a replay if we are using a "/(shared-)?replay/123" URL.
  const replayMatch = /\/(?:shared-)?replay\/(\d+)/u.exec(
    globalThis.location.pathname,
  );
  if (replayMatch !== null) {
    const gameIdString = replayMatch[1];
    if (gameIdString !== undefined) {
      const gameId = parseIntSafe(gameIdString);
      if (gameId !== undefined && gameId > 0) {
        const visibility = globalThis.location.pathname.includes("shared-")
          ? "shared"
          : "solo";
        globals.conn!.send("replayCreate", {
          source: { type: "saved", gameId },
          // A link to a shared replay should join the one that people are already watching.
          visibility: replayVisibility(visibility === "shared", {
            joinExisting: true,
          }),
        });
        return true;
      }
    }
  }

  // Automatically go into a replay if we are using a "/replay-json/string" or
  // "/shared-replay-json/string" URL.
  const replayJsonMatch = /\/(?:shared-)?replay-json\/([\d,\-A-Za-z]+)$/u.exec(
    globalThis.location.pathname,
  );
  if (replayJsonMatch !== null) {
    const gameJsonStringCompressed = replayJsonMatch[1];
    if (gameJsonStringCompressed !== undefined) {
      // The server expects the uncompressed JSON.
      const gameJsonString = expand(gameJsonStringCompressed);
      if (gameJsonString === undefined) {
        return false;
      }

      const parsed = parseGameJson(gameJsonString);
      if ("error" in parsed) {
        return false;
      }
      const { gameJson } = parsed;

      const visibility = globalThis.location.pathname.includes("shared-")
        ? "shared"
        : "solo";

      localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON, gameJsonString);
      localStorage.setItem(
        LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY,
        visibility,
      );

      globals.conn!.send("replayCreate", {
        source: { type: "imported", game: gameJson },
        visibility: replayVisibility(visibility === "shared"),
      });
      return true;
    }
  }

  return false;
}

/** Replaces a "/game/123" or "/pre-game/123" path for the given table with the lobby path. */
export function leaveTableLink(tableId: number): void {
  const match = /^(?:\/game|\/pre-game)\/(\d+)(?:\/|$)/u.exec(
    globalThis.location.pathname,
  );
  if (match?.[1] !== undefined && parseIntSafe(match[1]) === tableId) {
    setBrowserAddressBarPath(PATH.LOBBY);
  }
}

function restoreLobbyHistoryView(): boolean {
  if (globalThis.location.pathname !== PATH.LOBBY) {
    return false;
  }

  const seed = getOtherScoresSeed(globalThis.location.hash);
  if (seed !== undefined) {
    history.show(false);
    history.showOtherScores(seed);
    return true;
  }

  if (globalThis.location.hash === HISTORY_HASH) {
    history.show();
    return true;
  }

  return false;
}
