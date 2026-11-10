import type { ServerCommandData } from "@hanabi-live/data";
import {
  defaultSettings,
  SECONDS_PER_MINUTE,
  tableIdSchema,
} from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { DEFAULT_VARIANT_NAME, isValidPlayerIndex } from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import { HISTORY_HASH, LOCAL_STORAGE_KEY, PATH } from "../constants";
import { globals } from "../Globals";
import { setBrowserAddressBarPath } from "../utils";
import { parseGameJSON } from "./gameJSON";
import * as history from "./history";
import { getOtherScoresSeed } from "./historyHash";
import { expand } from "./hypoCompress";

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
  const firstTableID = data.playingAtTables[0];
  if (firstTableID !== undefined) {
    globals.conn!.send("tableReattend", {
      tableID: firstTableID,
    });
    return true;
  }

  // If the server has informed us that were previously spectating an ongoing shared replay,
  // automatically spectate that table.
  if (data.spectatingAtTable !== undefined) {
    globals.conn!.send("tableSpectate", data.spectatingAtTable);
    return true;
  }

  return false;
}

/** Returns whether the URL path specifies somewhere to go and we went there. */
function gotoPath(data: ServerCommandData["welcome"]): boolean {
  // Automatically create a table if we are using a "/create-table" URL.
  if (globalThis.location.pathname === PATH.CREATE_TABLE) {
    const urlParams = new URLSearchParams(globalThis.location.search);
    // Without a name, the server names the table after us.
    const name = urlParams.get("name") ?? "";
    const variantName = urlParams.get("variantName") ?? DEFAULT_VARIANT_NAME;
    const timed = urlParams.get("timed") === "true";
    const timeBaseString =
      urlParams.get("timeBase")
      ?? (
        defaultSettings.createTableTimeBaseMinutes * SECONDS_PER_MINUTE
      ).toString();
    const timeBaseSeconds = parseIntSafe(timeBaseString);
    const timePerTurnString =
      urlParams.get("timePerTurn")
      ?? defaultSettings.createTableTimePerTurnSeconds.toString();
    const timePerTurnSeconds = parseIntSafe(timePerTurnString);
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
    const seed = urlParams.get("seed") ?? "";
    const replayGameID = parseIntSafe(urlParams.get("replayGameID") ?? "");
    const replayTurn = parseIntSafe(urlParams.get("replayTurn") ?? "");

    globals.conn!.send("tableCreate", {
      name,
      options: {
        variantName,
        timed,
        timeBaseSeconds,
        timePerTurnSeconds,
        speedrun,
        deckPlays,
        emptyClues,
        oneExtraCard,
        oneLessCard,
        allOrNothing,
        detrimentalCharacters,
        ...(seed !== "" && { seed }),
        ...(replayGameID !== undefined && { replayGameID }),
        ...(replayTurn !== undefined && { replayTurn }),
      },
      password,
    });
    return true;
  }

  // Automatically join a pre-game if we are using a "/pre-game/123" URL.
  const preGameMatch = /\/pre-game\/(\d+)/u.exec(globalThis.location.pathname);
  if (preGameMatch !== null) {
    const tableIDString = preGameMatch[1];
    if (tableIDString !== undefined) {
      const tableID = parseIntSafe(tableIDString);
      if (tableID !== undefined && tableID > 0) {
        // Here we unconditionally send password from cookies. If the game has no password, the
        // server will ignore it.
        const password =
          localStorage.getItem(LOCAL_STORAGE_KEY.JOIN_TABLE_PASSWORD) ?? "";
        globals.conn!.send("tableJoin", {
          tableID,
          password,
        });
        return true;
      }
    }
  }

  // Automatically spectate a game if we are using a "/game/123" URL (or reattend it if we are one
  // of its players). We can also shadow a player in a seat with "/game/123/shadow/0".
  const gameMatch = /\/game\/(\d+)/u.exec(globalThis.location.pathname);
  if (gameMatch !== null) {
    const tableIDString = gameMatch[1];
    if (tableIDString !== undefined) {
      const tableID = parseIntSafe(tableIDString);
      if (tableID !== undefined && tableID > 0) {
        if (data.playingAtTables.includes(tableIdSchema.parse(tableID))) {
          globals.conn!.send("tableReattend", {
            tableID,
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
          tableID,
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
    const databaseIDString = replayMatch[1];
    if (databaseIDString !== undefined) {
      const databaseID = parseIntSafe(databaseIDString);
      if (databaseID !== undefined && databaseID > 0) {
        const visibility = globalThis.location.pathname.includes("shared-")
          ? "shared"
          : "solo";
        globals.conn!.send("replayCreate", {
          databaseID,
          source: "id",
          visibility,
          // A link to a shared replay should join the one that people are already watching.
          joinExisting: true,
        });
        return true;
      }
    }
  }

  // Automatically go into a replay if we are using a "/replay-json/string" or
  // "/shared-replay-json/string" URL.
  const replayJSONMatch = /\/(?:shared-)?replay-json\/([\d,\-A-Za-z]+)$/u.exec(
    globalThis.location.pathname,
  );
  if (replayJSONMatch !== null) {
    const gameJSONStringCompressed = replayJSONMatch[1];
    if (gameJSONStringCompressed !== undefined) {
      // The server expects the uncompressed JSON.
      const gameJSONString = expand(gameJSONStringCompressed);
      if (gameJSONString === undefined) {
        return false;
      }

      const parsed = parseGameJSON(gameJSONString);
      if ("error" in parsed) {
        return false;
      }
      const { gameJSON } = parsed;

      const visibility = globalThis.location.pathname.includes("shared-")
        ? "shared"
        : "solo";

      const source = "json";
      localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON, gameJSONString);
      localStorage.setItem(
        LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY,
        visibility,
      );

      globals.conn!.send("replayCreate", {
        source,
        gameJSON,
        visibility,
      });
      return true;
    }
  }

  return false;
}

/** Replaces a "/game/123" or "/pre-game/123" path for the given table with the lobby path. */
export function leaveTableLink(tableID: number): void {
  const match = /^(?:\/game|\/pre-game)\/(\d+)(?:\/|$)/u.exec(
    globalThis.location.pathname,
  );
  if (match?.[1] !== undefined && parseIntSafe(match[1]) === tableID) {
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
