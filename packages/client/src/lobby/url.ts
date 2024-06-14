import type { ServerCommandWelcomeData } from "@hanabi/data";
import { DEFAULT_VARIANT_NAME } from "@hanabi/game";
import { parseIntSafe } from "isaacscript-common-ts";
import { globals } from "../Globals";
import { setBrowserAddressBarPath } from "../utils";
import type { GameJSON } from "./hypoCompress";
import { expand } from "./hypoCompress";

export function parseAndGoto(data: ServerCommandWelcomeData): void {
  // Disable custom path functionality for first time users.
  if (data.firstTimeUser) {
    return;
  }

  // Automatically create a table if we are using a "/create-table" URL.
  if (window.location.pathname === "/create-table") {
    const urlParams = new URLSearchParams(window.location.search);
    const name = urlParams.get("name") ?? globals.randomTableName;
    const variantName = urlParams.get("variantName") ?? DEFAULT_VARIANT_NAME;
    const timed = urlParams.get("timed") === "true";
    const timeBaseString = urlParams.get("timeBase") ?? "120";
    const timeBase = parseIntSafe(timeBaseString);
    const timePerTurnString = urlParams.get("timePerTurn") ?? "20";
    const timePerTurn = parseIntSafe(timePerTurnString);
    const speedrun = urlParams.get("speedrun") === "true";
    const cardCycle = urlParams.get("cardCycle") === "true";
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
        cardCycle,
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
  const preGameMatch = /\/pre-game\/(\d+)/.exec(window.location.pathname);
  if (preGameMatch !== null) {
    const tableIDString = preGameMatch[1];
    if (tableIDString !== undefined) {
      const tableID = parseIntSafe(tableIDString);
      if (tableID !== undefined && tableID > 0) {
        globals.conn!.send("tableJoin", {
          tableID,
        });
        return;
      }
    }
  }

  // Automatically spectate a game if we are using a "/game/123" URL. We can also shadow a player in
  // a seat with "/game/123/shadow/0" (We want to spectate it instead of reattend it because if we
  // are at this point, it is assumed that if we were in the respective game, we would have already
  // tried to join it.)
  const gameMatch = /\/game\/(\d+)/.exec(window.location.pathname);
  if (gameMatch !== null) {
    const tableIDString = gameMatch[1];
    if (tableIDString !== undefined) {
      const tableID = parseIntSafe(tableIDString);
      if (tableID !== undefined && tableID > 0) {
        const shadowMatch = /\/shadow\/(\d+)/.exec(window.location.pathname);
        let shadowingPlayerIndex = -1;
        if (shadowMatch !== null) {
          const shadowingPlayerIndexString = shadowMatch[1];
          if (shadowingPlayerIndexString !== undefined) {
            const shadowingPlayerIndexInt = parseIntSafe(
              shadowingPlayerIndexString,
            );
            if (
              shadowingPlayerIndexInt !== undefined &&
              shadowingPlayerIndex >= 0
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
  const replayMatch = /\/(?:shared-)?replay\/(\d+)/.exec(
    window.location.pathname,
  );
  if (replayMatch !== null) {
    const databaseIDString = replayMatch[1];
    if (databaseIDString !== undefined) {
      const databaseID = parseIntSafe(databaseIDString);
      if (databaseID !== undefined && databaseID > 0) {
        const visibility = window.location.pathname.includes("shared-")
          ? "shared"
          : "solo";
        globals.conn!.send("replayCreate", {
          databaseID,
          source: "id",
          visibility,
          shadowingPlayerIndex: -1,
        });
        return;
      }
    }
  }

  // Automatically go into a replay if we are using a "/replay-json/string" or
  // "/shared-replay-json/string" URL.
  const replayJSONMatch = /\/(?:shared-)?replay-json\/([\d,A-Za-z-]+)$/.exec(
    window.location.pathname,
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

      let gameJSON: GameJSON;
      try {
        gameJSON = JSON.parse(gameJSONString) as GameJSON;
      } catch {
        setBrowserAddressBarPath("/lobby");
        return;
      }
      if (typeof gameJSON !== "object") {
        setBrowserAddressBarPath("/lobby");
        return;
      }

      const visibility = window.location.pathname.includes("shared-")
        ? "solo"
        : "shared";

      const source = "json";
      localStorage.setItem("watchReplayJSON", gameJSONString);
      localStorage.setItem("watchReplayVisibility", visibility);

      globals.conn!.send("replayCreate", {
        source,
        gameJSON,
        visibility,
        shadowingPlayerIndex: -1,
      });
      return;
    }
  }

  // Otherwise, we will stay in the lobby.
  setBrowserAddressBarPath("/lobby");
}
