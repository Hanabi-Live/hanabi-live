import { DEFAULT_VARIANT_NAME } from "@hanabi/data";
import { parseIntSafe } from "isaacscript-common-ts";
import { globals } from "../Globals";
import { setBrowserAddressBarPath } from "../utils";
import type { GameJSON } from "./hypoCompress";
import { expand } from "./hypoCompress";
import type { WelcomeData } from "./types/WelcomeData";

export function parseAndGoto(data: WelcomeData): void {
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
    // The server expects the game ID as an integer.
    const tableID = parseIntSafe(preGameMatch[1]!);
    globals.conn!.send("tableJoin", {
      tableID,
    });
    return;
  }

  // Automatically spectate a game if we are using a "/game/123" URL. We can also shadow a player in
  // a seat with "/game/123/shadow/0" (We want to spectate it instead of reattend it because if we
  // are at this point, it is assumed that if we were in the respective game, we would have already
  // tried to join it.)
  const gameMatch = /\/game\/(\d+)/.exec(window.location.pathname);
  if (gameMatch !== null) {
    const tableID = parseIntSafe(gameMatch[1]!); // The server expects the game ID as an integer.
    const shadowMatch = /\/shadow\/(\d+)/.exec(window.location.pathname);
    const shadowID = shadowMatch === null ? -1 : parseIntSafe(shadowMatch[1]!); // The server expects the game ID as an integer.
    globals.conn!.send("tableSpectate", {
      tableID,
      shadowingPlayerIndex: shadowID,
    });
    return;
  }

  // Automatically go into a replay if we are using a "/(shared-)?replay/123" URL.
  const replayMatch = /\/(?:shared-)?replay\/(\d+)/.exec(
    window.location.pathname,
  );
  if (replayMatch !== null) {
    const visibility = window.location.pathname.includes("shared-")
      ? "shared"
      : "solo";
    // The server expects the game ID as an integer.
    const databaseID = parseIntSafe(replayMatch[1]!);
    globals.conn!.send("replayCreate", {
      databaseID,
      source: "id",
      visibility,
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically go into a replay if we are using a "/replay-json/string" or
  // "/shared-replay-json/string" URL.
  const replayJSONMatch = /\/(?:shared-)?replay-json\/([\d,A-Za-z-]+)$/.exec(
    window.location.pathname,
  );
  if (replayJSONMatch !== null) {
    const visibility = window.location.pathname.includes("shared-")
      ? "solo"
      : "shared";
    // The server expects the uncompressed JSON.
    const gameJSONString = expand(replayJSONMatch[1]!);
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

  // Otherwise, we will stay in the lobby.
  setBrowserAddressBarPath("/lobby");
}
