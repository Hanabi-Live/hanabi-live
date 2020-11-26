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

  // Automatically join a pre-game if we are using a "/pre-game/123" URL
  // (this should override rejoining a shared replay but not rejoining a game,
  // because users are not allowed to be in two games at once)
  if (data.playingInOngoingGameTableID === 0) {
    const preGameMatch = /\/pre-game\/(\d+)/.exec(window.location.pathname);
    if (preGameMatch) {
      const tableID = parseIntSafe(preGameMatch[1]); // The server expects the game ID as an integer
      globals.conn!.send("tableJoin", {
        tableID,
      });
      return;
    }
  }

  // Automatically go into a replay if we are using a "/replay/123" URL
  // (this should override both rejoining a game and rejoining a shared replay)
  const replayMatch = /\/replay\/(\d+)/.exec(window.location.pathname);
  if (replayMatch) {
    const gameID = parseIntSafe(replayMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("replayCreate", {
      gameID,
      source: "id",
      visibility: "solo",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically go into a shared replay if we are using a "/shared-replay/123" URL
  // (this should override both rejoining a game and rejoining a shared replay)
  const sharedReplayMatch = /\/shared-replay\/(\d+)/.exec(
    window.location.pathname,
  );
  if (sharedReplayMatch) {
    const gameID = parseIntSafe(sharedReplayMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("replayCreate", {
      gameID,
      source: "id",
      visibility: "shared",
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Automatically create a table if we are using a "/create-table" URL
  // (this should override rejoining a shared replay but not rejoining a game,
  // because users are not allowed to be in two games at once)
  if (
    data.playingInOngoingGameTableID === 0 &&
    window.location.pathname === "/create-table"
  ) {
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

  // If the server has informed us that we are currently playing in an ongoing game,
  // automatically reconnect to that game
  if (data.playingInOngoingGameTableID !== 0) {
    globals.conn!.send("tableReattend", {
      tableID: data.playingInOngoingGameTableID,
    });
    return;
  }

  // Automatically spectate a game if we are using a "/game/123" URL
  // (this should override rejoining a shared replay but not rejoining a game,
  // because we assume at this point that we need to send a "tableSpectate" command instead of a
  // "tableReattend" command)
  const gameMatch = /\/game\/(\d+)/.exec(window.location.pathname);
  if (gameMatch) {
    const tableID = parseIntSafe(gameMatch[1]); // The server expects the game ID as an integer
    globals.conn!.send("tableSpectate", {
      tableID,
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // If the server has informed us that were previously spectating an ongoing shared replay,
  // automatically spectate that table
  if (data.spectatingTableID !== 0) {
    globals.conn!.send("tableSpectate", {
      tableID: data.spectatingTableID,
      shadowingPlayerIndex: -1,
    });
    return;
  }

  // Otherwise, we will stay in the lobby
  setBrowserAddressBarPath("/lobby");
}
