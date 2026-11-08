import type { ServerCommandData } from "@hanabi-live/data";
import { defaultSettings, SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { DEFAULT_VARIANT_NAME, NO_VALUE } from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import { globals } from "../Globals";
import { setBrowserAddressBarPath } from "../utils";
import { parseGameJSON } from "./gameJSON";
import * as history from "./history";
import { expand } from "./hypoCompress";

export function parseAndGoto(data: ServerCommandData["welcome"]): void {
  // Disable custom path functionality for first time users, and do nothing else when we restore a
  // lobby history view.
  if (data.firstTimeUser || restoreLobbyHistoryView()) {
    return;
  }

  // Automatically create a table if we are using a "/create-table" URL.
  if (globalThis.location.pathname === "/create-table") {
    const urlParams = new URLSearchParams(globalThis.location.search);
    const name = urlParams.get("name") ?? `${globals.username}'s table`;
    const variantName = urlParams.get("variantName") ?? DEFAULT_VARIANT_NAME;
    const timed = urlParams.get("timed") === "true";
    const timeBaseString =
      urlParams.get("timeBase")
      ?? (
        defaultSettings.createTableTimeBaseMinutes * SECONDS_PER_MINUTE
      ).toString();
    const timeBase = parseIntSafe(timeBaseString);
    const timePerTurnString =
      urlParams.get("timePerTurn")
      ?? defaultSettings.createTableTimePerTurnSeconds.toString();
    const timePerTurn = parseIntSafe(timePerTurnString);
    const speedrun = urlParams.get("speedrun") === "true";
    const deckPlays = urlParams.get("deckPlays") === "true";
    const emptyClues = urlParams.get("emptyClues") === "true";
    const oneExtraCard = urlParams.get("oneExtraCard") === "true";
    const oneLessCard = urlParams.get("oneLessCard") === "true";
    const allOrNothing = urlParams.get("allOrNothing") === "true";
    const detrimentalCharacters =
      urlParams.get("detrimentalCharacters") === "true";
    const password = urlParams.get("password") ?? "";

    globals.conn!.send("tableCreate", {
      name,
      options: {
        variantName,
        timed,
        timeBase,
        timePerTurn,
        speedrun,
        deckPlays,
        emptyClues,
        oneExtraCard,
        oneLessCard,
        allOrNothing,
        detrimentalCharacters,
      },
      password,
    });
    return;
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
        const password = localStorage.getItem("joinTablePassword") ?? "";
        globals.conn!.send("tableJoin", {
          tableID,
          password,
        });
        return;
      }
    }
  }

  // Automatically spectate a game if we are using a "/game/123" URL. We can also shadow a player in
  // a seat with "/game/123/shadow/0" (We want to spectate it instead of reattend it because if we
  // are at this point, it is assumed that if we were in the respective game, we would have already
  // tried to join it.)
  const gameMatch = /\/game\/(\d+)/u.exec(globalThis.location.pathname);
  if (gameMatch !== null) {
    const tableIDString = gameMatch[1];
    if (tableIDString !== undefined) {
      const tableID = parseIntSafe(tableIDString);
      if (tableID !== undefined && tableID > 0) {
        const shadowMatch = /\/shadow\/(\d+)/u.exec(
          globalThis.location.pathname,
        );
        let shadowingPlayerIndex = NO_VALUE;
        if (shadowMatch !== null) {
          const shadowingPlayerIndexString = shadowMatch[1];
          if (shadowingPlayerIndexString !== undefined) {
            const shadowingPlayerIndexInt = parseIntSafe(
              shadowingPlayerIndexString,
            );
            if (
              shadowingPlayerIndexInt !== undefined
              && shadowingPlayerIndexInt >= 0
            ) {
              shadowingPlayerIndex = shadowingPlayerIndexInt;
            }
          }
        }
        globals.conn!.send("tableSpectate", {
          tableID,
          shadowingPlayerIndex,
        });
        return;
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
          shadowingPlayerIndex: NO_VALUE,
          // A link to a shared replay should join the one that people are already watching.
          joinExisting: true,
        });
        return;
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
        setBrowserAddressBarPath("/lobby");
        return;
      }

      const parsed = parseGameJSON(gameJSONString);
      if ("error" in parsed) {
        setBrowserAddressBarPath("/lobby");
        return;
      }
      const { gameJSON } = parsed;

      const visibility = globalThis.location.pathname.includes("shared-")
        ? "shared"
        : "solo";

      const source = "json";
      localStorage.setItem("watchReplayJSON", gameJSONString);
      localStorage.setItem("watchReplayVisibility", visibility);

      globals.conn!.send("replayCreate", {
        source,
        gameJSON,
        visibility,
        shadowingPlayerIndex: NO_VALUE,
      });
      return;
    }
  }

  // Otherwise, we will stay in the lobby.
  setBrowserAddressBarPath("/lobby");
}

function restoreLobbyHistoryView(): boolean {
  if (globalThis.location.pathname !== "/lobby") {
    return false;
  }

  const scoresMatch = /^#history-other-scores-(.+)$/u.exec(
    globalThis.location.hash,
  );
  if (scoresMatch !== null) {
    const seed = scoresMatch[1];
    if (seed !== undefined) {
      history.show(false);
      history.showOtherScoresFromURL(decodeURIComponent(seed));
      return true;
    }
  }

  switch (globalThis.location.hash) {
    case "#history": {
      history.show();
      return true;
    }

    default: {
      return false;
    }
  }
}
