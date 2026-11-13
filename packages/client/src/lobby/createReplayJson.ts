import { SITE_URL } from "@hanabi-live/data";
import type {
  CardOrder,
  ColorIndex,
  LogEntry,
  PlayerIndex,
  Variant,
} from "@hanabi-live/game";
import {
  DEFAULT_PLAYER_NAMES,
  EVEN_RANK_CLUE,
  getCardsPerHand,
  ODD_RANK_CLUE,
} from "@hanabi-live/game";
import { assertDefined, includes, parseIntSafe } from "complete-common";
import { SelfChatMessageType, sendSelfPmFromServer } from "../chat.ts";
import type {
  ClientAction,
  ClientActionClue,
} from "../game/types/ClientAction.ts";
import type { ReplayState } from "../game/types/ReplayState.ts";
import { globals } from "../game/ui/UiGlobals.ts";
import { store } from "../store.ts";
import type { GameJson } from "./hypoCompress.ts";
import { shrink } from "./hypoCompress.ts";

const PLAY_REGEX =
  /^(?:\[Hypo\] )?(.*)(?: fails to play | plays ).* from slot #(\d).*$/u;
const DISCARD_REGEX = /^(?:\[Hypo\] )?(.*) discards .* slot #(\d).*$/u;
const CLUE_REGEX = /^.+ tells (.*) about \w+ ([A-Za-z]+|\d)s?$/u;

export function createJsonFromReplay(room: string): void {
  const { segment } = globals.state.replay;
  if (
    store.getState().game.current === undefined
    || !globals.state.finished
    || segment === undefined
  ) {
    sendSelfPmFromServer(
      [
        "You can only use the ",
        { code: "/copy" },
        " command during the review of a game.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  // Copy the entire deck.
  const deck: Array<NonNullable<GameJson["deck"]>[number]> = [];
  for (const [i, cardIdentity] of globals.state.cardIdentities.entries()) {
    const morph = globals.state.replay.hypothetical?.morphedIdentities[i];
    if (
      morph !== undefined
      && morph.suitIndex !== undefined
      && morph.rank !== undefined
    ) {
      deck.push({
        suitIndex: morph.suitIndex,
        rank: morph.rank,
      });
    } else if (
      cardIdentity.suitIndex === undefined
      || cardIdentity.rank === undefined
    ) {
      sendSelfPmFromServer(
        "The deck is still loading. Please try again after it loads.",
        room,
        SelfChatMessageType.Error,
      );
      return;
    } else {
      deck.push({
        suitIndex: cardIdentity.suitIndex,
        rank: cardIdentity.rank,
      });
    }
  }

  // A morphed deck no longer necessarily matches its original seed. Preserve seed metadata only
  // when every exported identity is unchanged.
  const unchanged = deck.every((card, i) => {
    const original = globals.state.cardIdentities[i];
    return (
      original !== undefined
      && card.suitIndex === original.suitIndex
      && card.rank === original.rank
    );
  });

  // Copy actions up to current segment, then add the hypothetical from the log, after the current
  // segment.
  const { replay } = globals.state;
  const actions = [...getGameActionsFromState(replay, segment)];
  if (replay.hypothetical !== undefined) {
    const { states } = replay.hypothetical;
    const { log } = states.at(-1)!;
    if (segment < log.length) {
      const logLines = log.slice(segment + 1);
      actions.push(...getGameActionsFromLog(logLines));
    }
  }

  // Anonymize the players
  const game: GameJson = {
    playerNames: DEFAULT_PLAYER_NAMES.slice(
      0,
      globals.metadata.playerNames.length,
    ),
    deck,
    actions,
    options: {
      variantId: globals.options.variantId,
    },
    notes: [],
    characters: [],
    ...(unchanged
      && globals.metadata.seed !== undefined && {
        seed: globals.metadata.seed,
      }),
  };

  const json = JSON.stringify(game);
  const UrlData = shrink(json);
  if (UrlData === undefined || UrlData === "") {
    sendSelfPmFromServer(
      "Failed to compress the JSON data.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const URL = `${SITE_URL}/shared-replay-json/${UrlData}`;
  navigator.clipboard
    .writeText(URL)
    .then(() => {
      sendSelfPmFromServer(
        "The URL for this hypothetical is copied to your clipboard.",
        room,
        SelfChatMessageType.Info,
      );
      sendSelfPmFromServer(
        [
          "Click ",
          { copy: json, label: "here" },
          " to copy the raw JSON data to your clipboard.",
        ],
        room,
        SelfChatMessageType.Info,
      );
    })
    .catch((error: unknown) => {
      sendSelfPmFromServer(
        `Failed to copy the URL to your clipboard: ${error}`,
        room,
        SelfChatMessageType.Error,
      );
      sendSelfPmFromServer(URL, room);
    });
}

function getGameActionsFromState(
  source: ReplayState,
  maxSegment: number,
): readonly ClientAction[] {
  let currentSegment = 0;
  const actions: ClientAction[] = [];
  for (
    let i = 0;
    i < source.actions.length && currentSegment < maxSegment;
    i++
  ) {
    const action = source.actions[i]!;
    switch (action.type) {
      case "play": {
        actions.push({ type: "play", order: action.order });
        currentSegment++;
        continue;
      }

      case "discard": {
        actions.push({ type: "discard", order: action.order });
        currentSegment++;
        continue;
      }

      case "misplay": {
        actions.push({ type: "play", order: action.order });
        currentSegment++;
        continue;
      }

      case "clue": {
        switch (action.clue.type) {
          case undefined: {
            throw new Error(
              "Cannot export a replay with concealed clue identities.",
            );
          }

          case "color":
          case "rank": {
            actions.push({
              type: "clue",
              receiverIndex: action.receiverIndex,
              clue: action.clue,
            });
            break;
          }
        }

        currentSegment++;
        continue;
      }

      default: {
        continue;
      }
    }
  }

  return actions;
}

function getGameActionsFromLog(
  log: readonly LogEntry[],
): readonly ClientAction[] {
  const actions: ClientAction[] = [];

  for (const [i, logEntry] of log.entries()) {
    const action = getActionFromLogEntry(i, logEntry);

    if (action !== undefined) {
      actions.push(action);
    }
  }

  return actions;
}

function getActionFromLogEntry(
  i: number,
  logEntry: LogEntry,
): ClientAction | undefined {
  const foundPlay = PLAY_REGEX.exec(logEntry.text);
  if (foundPlay !== null) {
    const [, playerName, slotString] = foundPlay;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(i, "play", playerName, slot);
      }
    }
  }

  const foundDiscard = DISCARD_REGEX.exec(logEntry.text);
  if (foundDiscard !== null) {
    const [, playerName, slotString] = foundDiscard;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(i, "discard", playerName, slot);
      }
    }
  }

  const foundClue = CLUE_REGEX.exec(logEntry.text);
  if (foundClue !== null) {
    const [, playerName, clueWord] = foundClue;
    if (playerName !== undefined && clueWord !== undefined) {
      return getActionFromHypoClue(playerName, clueWord);
    }
  }

  return undefined;
}

function getActionFromHypoPlayOrDiscard(
  entryNumber: number,
  actionType: "play" | "discard",
  playerName: string,
  slot: number,
): ClientAction {
  const playerIndex = getPlayerIndexFromPlayerName(playerName);
  assertDefined(
    playerIndex,
    `Failed to find the player index corresponding to: ${playerName}`,
  );

  // Go to previous hypo state to find the card. Cards are stored in reverse order than the one
  // perceived.
  const numCards = getCardsPerHand(globals.options);
  const slotIndex = numCards - slot;
  const cardOrder = getCardOrderFromHypoState(
    entryNumber - 1,
    playerIndex,
    slotIndex,
  );
  assertDefined(
    cardOrder,
    "Failed to get the card order from the last hypothetical state.",
  );

  return { type: actionType, order: cardOrder };
}

function getActionFromHypoClue(
  playerName: string,
  clueWord: string,
): ClientActionClue {
  const playerIndex = getPlayerIndexFromPlayerName(playerName);
  assertDefined(
    playerIndex,
    `Failed to find the player index corresponding to: ${playerName}`,
  );

  let clueNumber = parseIntSafe(clueWord);

  // "Odds and Evens" give "Odd" or "Even" as rank clues.
  if (clueWord === "Odd") {
    clueNumber = ODD_RANK_CLUE;
  } else if (clueWord === "Even") {
    clueNumber = EVEN_RANK_CLUE;
  }

  if (clueNumber === undefined) {
    // It is a color clue.
    const colorIndex = getColorIndexFromColorName(clueWord, globals.variant);
    assertDefined(
      colorIndex,
      `The clue color name of ${clueWord} is not valid for this variant.`,
    );

    return {
      type: "clue",
      receiverIndex: playerIndex,
      clue: { type: "color", color: colorIndex },
    };
  }

  if (!includes(globals.variant.clueRanks, clueNumber)) {
    throw new Error(
      `The clue rank of ${clueNumber} is not valid for this variant.`,
    );
  }

  // It is a rank clue.
  return {
    type: "clue",
    receiverIndex: playerIndex,
    clue: { type: "rank", rank: clueNumber },
  };
}

function getPlayerIndexFromPlayerName(
  playerName: string,
): PlayerIndex | undefined {
  const playerIndex = globals.metadata.playerNames.indexOf(playerName);
  return playerIndex === -1 ? undefined : (playerIndex as PlayerIndex);
}

function getCardOrderFromHypoState(
  previousStateIndex: number,
  playerIndex: PlayerIndex,
  slotIndex: number,
): CardOrder | undefined {
  if (globals.state.replay.hypothetical === undefined) {
    return undefined;
  }

  const stateIndex = Math.max(previousStateIndex, 0);
  const stateOnHypoTurn = globals.state.replay.hypothetical.states[stateIndex];
  if (stateOnHypoTurn === undefined) {
    return undefined;
  }

  const playerHand = stateOnHypoTurn.hands[playerIndex];
  if (playerHand === undefined) {
    return undefined;
  }

  return playerHand[slotIndex];
}

function getColorIndexFromColorName(
  colorName: string,
  variant: Variant,
): ColorIndex | undefined {
  const colorIndex = variant.clueColors.findIndex((clueColor) =>
    colorName.startsWith(clueColor.name),
  );

  return colorIndex === -1 ? undefined : (colorIndex as ColorIndex);
}
