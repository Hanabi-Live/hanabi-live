/* eslint-disable import/prefer-default-export */

import { DEFAULT_VARIANT_NAME } from "../game/types/constants";
import globals from "../globals";
import { parseIntSafe, setBrowserAddressBarPath } from "../misc";
import WelcomeData from "./types/WelcomeData";

export function parseAndGoto(data: WelcomeData): void {
  // Disable custom path functionality for first time users
  if (data.firstTimeUser) {
    return;
  }

  // Automatically create a table if we are using a "/create-table" URL
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

  // Automatically join a pre-game if we are using a "/pre-game/123" URL
  const preGameMatch = /\/pre-game\/(\d+)/.exec(window.location.pathname);
  if (preGameMatch) {
    // The server expects the game ID as an integer
    const tableID = parseIntSafe(preGameMatch[1]);
    globals.conn!.send("tableJoin", {
      tableID,
    });
    return;
  }

  // Automatically spectate a game if we are using a "/game/123" URL
  const gameMatch = /\/game\/(\d+)/.exec(window.location.pathname);
  if (gameMatch) {
    const tableID = parseIntSafe(gameMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("tableSpectate", {
      tableID,
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically go into a replay if we are using a "/replay/123" URL
  const replayMatch = /\/replay\/(\d+)/.exec(window.location.pathname);
  if (replayMatch) {
    // The server expects the game ID as an integer
    const databaseID = parseIntSafe(replayMatch[1]);
    globals.conn!.send("replayCreate", {
      databaseID,
      source: "id",
      visibility: "solo",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically go into a shared replay if we are using a "/shared-replay/123" URL
  const sharedReplayMatch = /\/shared-replay\/(\d+)/.exec(
    window.location.pathname,
  );
  if (sharedReplayMatch) {
    // The server expects the game ID as an integer
    const databaseID = parseIntSafe(sharedReplayMatch[1]);
    globals.conn!.send("replayCreate", {
      databaseID,
      source: "id",
      visibility: "shared",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Otherwise, we will stay in the lobby
  setBrowserAddressBarPath("/lobby");
}
