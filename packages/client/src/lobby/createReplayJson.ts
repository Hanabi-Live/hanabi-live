import type { TableId } from "@hanabi-live/data";
import { SITE_URL } from "@hanabi-live/data";
import type {
  CardOrder,
  ColorIndex,
  GameState,
  LogEntry,
  Options,
  PlayerIndex,
  Variant,
} from "@hanabi-live/game";
import {
  DEFAULT_PLAYER_NAMES,
  EVEN_RANK_CLUE,
  ODD_RANK_CLUE,
} from "@hanabi-live/game";
import { assertDefined, includes, parseIntSafe } from "complete-common";
import { SelfChatMessageType, sendSelfPmFromServer } from "../chat.ts";
import { currentState, currentVariant } from "../game/gameSession.ts";
import type {
  ClientAction,
  ClientActionClue,
} from "../game/types/ClientAction.ts";
import type { ReplayState } from "../game/types/ReplayState.ts";
import { store } from "../store.ts";
import type { GameJson } from "./hypoCompress.ts";
import { shrink } from "./hypoCompress.ts";

const PLAY_REGEX =
  /^(?:\[Hypo\] )?(?<playerName>.*)(?: fails to play | plays ).* from slot #(?<slot>\d).*$/u;
const DISCARD_REGEX =
  /^(?:\[Hypo\] )?(?<playerName>.*) discards .* slot #(?<slot>\d).*$/u;
const CLUE_REGEX =
  /^.+ tells (?<playerName>.*) about \w+ (?<clueWord>[A-Za-z]+|\d)s?$/u;

/**
 * The options that change how a game plays, which a copied game keeps. For example, "One Extra
 * Card" changes the hands that the deck deals. The clock options do not matter in a replay.
 */
export function getReplayOptions(
  options: Options,
): NonNullable<GameJson["options"]> {
  return {
    variantId: options.variantId,
    deckPlays: options.deckPlays,
    emptyClues: options.emptyClues,
    oneExtraCard: options.oneExtraCard,
    oneLessCard: options.oneLessCard,
    allOrNothing: options.allOrNothing,
  };
}

/**
 * The card in a slot of a hand, as the game log counts slots: slot 1 is the newest card, which is
 * the last one of the hand. A hand can be short when the deck is empty.
 */
export function getCardOrderInSlot(
  hand: readonly CardOrder[],
  slot: number,
): CardOrder | undefined {
  return hand[hand.length - slot];
}

export function createJsonFromReplay(tableId: TableId | undefined): void {
  const state = store.getState().game.current;
  const segment = state?.replay.segment;
  if (state === undefined || segment === undefined || !state.finished) {
    sendSelfPmFromServer(
      [
        "You can only use the ",
        { code: "/copy" },
        " command during the review of a game.",
      ],
      tableId,
      SelfChatMessageType.Error,
    );
    return;
  }
  // Copy the entire deck.
  const deck: Array<NonNullable<GameJson["deck"]>[number]> = [];
  for (const [i, cardIdentity] of currentState().cardIdentities.entries()) {
    const morph = currentState().replay.hypothetical?.morphedIdentities[i];
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
        tableId,
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
    const original = currentState().cardIdentities[i];
    return (
      original !== undefined
      && card.suitIndex === original.suitIndex
      && card.rank === original.rank
    );
  });

  // Copy actions up to current segment, then add the hypothetical from the log, after the current
  // segment.
  const { replay } = currentState();
  const actions = [...getGameActionsFromState(replay, segment)];
  if (replay.hypothetical !== undefined) {
    actions.push(...getGameActionsFromLog(replay.hypothetical.states));
  }

  // Anonymize the players
  const game: GameJson = {
    playerNames: DEFAULT_PLAYER_NAMES.slice(
      0,
      currentState().metadata.playerNames.length,
    ),
    deck,
    actions,
    options: getReplayOptions(currentState().metadata.options),
    notes: [],
    characters: [],
    ...(unchanged
      && currentState().metadata.seed !== undefined && {
        seed: currentState().metadata.seed,
      }),
  };

  const json = JSON.stringify(game);
  // A link cannot hold every game. If it cannot hold this one, we copy the JSON data instead.
  const UrlData = shrink(json);
  if (UrlData === undefined || UrlData === "") {
    navigator.clipboard
      .writeText(json)
      .then(() => {
        sendSelfPmFromServer(
          'A link cannot hold this game, so its JSON data is copied to your clipboard instead. Paste it into "Watch Specific Replay".',
          tableId,
          SelfChatMessageType.Info,
        );
      })
      .catch((error: unknown) => {
        sendSelfPmFromServer(
          `Failed to copy the JSON data to your clipboard: ${error}`,
          tableId,
          SelfChatMessageType.Error,
        );
      });
    return;
  }

  const URL = `${SITE_URL}/shared-replay-json/${UrlData}`;
  navigator.clipboard
    .writeText(URL)
    .then(() => {
      sendSelfPmFromServer(
        "The URL for this hypothetical is copied to your clipboard.",
        tableId,
        SelfChatMessageType.Info,
      );
      sendSelfPmFromServer(
        [
          "Click ",
          {
            copy: json,
            label: "here",
          },
          " to copy the raw JSON data to your clipboard.",
        ],
        tableId,
        SelfChatMessageType.Info,
      );
    })
    .catch((error: unknown) => {
      sendSelfPmFromServer(
        `Failed to copy the URL to your clipboard: ${error}`,
        tableId,
        SelfChatMessageType.Error,
      );
      sendSelfPmFromServer(URL, tableId);
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
        actions.push({
          type: "play",
          order: action.order,
        });
        currentSegment++;
        continue;
      }

      case "discard": {
        actions.push({
          type: "discard",
          order: action.order,
        });
        currentSegment++;
        continue;
      }

      case "misplay": {
        actions.push({
          type: "play",
          order: action.order,
        });
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

/**
 * Reads the moves of a hypothetical from the log. Each move adds one state and one line to the log,
 * so the lines after those of the first state are the moves, and each move starts from the state
 * with its number.
 */
function getGameActionsFromLog(
  states: readonly GameState[],
): readonly ClientAction[] {
  const firstState = states[0];
  const lastState = states.at(-1);
  if (firstState === undefined || lastState === undefined) {
    return [];
  }

  const actions: ClientAction[] = [];
  const moves = lastState.log.slice(firstState.log.length);
  for (const [i, logEntry] of moves.entries()) {
    const stateBefore = states[i];
    const action =
      stateBefore === undefined
        ? undefined
        : getActionFromLogEntry(stateBefore, logEntry);

    if (action !== undefined) {
      actions.push(action);
    }
  }

  return actions;
}

function getActionFromLogEntry(
  stateBefore: GameState,
  logEntry: LogEntry,
): ClientAction | undefined {
  const foundPlay = PLAY_REGEX.exec(logEntry.text);
  if (foundPlay?.groups !== undefined) {
    const { playerName, slot: slotString } = foundPlay.groups;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(
          stateBefore,
          "play",
          playerName,
          slot,
        );
      }
    }
  }

  const foundDiscard = DISCARD_REGEX.exec(logEntry.text);
  if (foundDiscard?.groups !== undefined) {
    const { playerName, slot: slotString } = foundDiscard.groups;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(
          stateBefore,
          "discard",
          playerName,
          slot,
        );
      }
    }
  }

  const foundClue = CLUE_REGEX.exec(logEntry.text);
  if (foundClue?.groups !== undefined) {
    const { playerName, clueWord } = foundClue.groups;
    if (playerName !== undefined && clueWord !== undefined) {
      return getActionFromHypoClue(playerName, clueWord);
    }
  }

  return undefined;
}

function getActionFromHypoPlayOrDiscard(
  stateBefore: GameState,
  actionType: "play" | "discard",
  playerName: string,
  slot: number,
): ClientAction {
  const playerIndex = getPlayerIndexFromPlayerName(playerName);
  assertDefined(
    playerIndex,
    `Failed to find the player index corresponding to: ${playerName}`,
  );

  // Find the card in the hand before the move.
  const cardOrder = getCardOrderInSlot(
    stateBefore.hands[playerIndex] ?? [],
    slot,
  );
  assertDefined(
    cardOrder,
    "Failed to get the card order from the last hypothetical state.",
  );

  return {
    type: actionType,
    order: cardOrder,
  };
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
    const colorIndex = getColorIndexFromColorName(clueWord, currentVariant());
    assertDefined(
      colorIndex,
      `The clue color name of ${clueWord} is not valid for this variant.`,
    );

    return {
      type: "clue",
      receiverIndex: playerIndex,
      clue: {
        type: "color",
        color: colorIndex,
      },
    };
  }

  if (!includes(currentVariant().clueRanks, clueNumber)) {
    throw new Error(
      `The clue rank of ${clueNumber} is not valid for this variant.`,
    );
  }

  // It is a rank clue.
  return {
    type: "clue",
    receiverIndex: playerIndex,
    clue: {
      type: "rank",
      rank: clueNumber,
    },
  };
}

function getPlayerIndexFromPlayerName(
  playerName: string,
): PlayerIndex | undefined {
  const playerIndex = currentState().metadata.playerNames.indexOf(playerName);
  return playerIndex === -1 ? undefined : (playerIndex as PlayerIndex);
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
