import type {
  CardOrder,
  ColorIndex,
  PlayerIndex,
  RankClueNumber,
  Variant,
} from "@hanabi/data";
import { DEFAULT_PLAYER_NAMES, SITE_URL } from "@hanabi/data";
import type { LogEntry } from "@hanabi/game";
import { ClueType } from "@hanabi/game";
import { assertDefined, parseIntSafe } from "isaacscript-common-ts";
import { includes } from "lodash";
import { SelfChatMessageType, sendSelfPMFromServer } from "../chat";
import { getCardsPerHand } from "../game/rules/hand";
import { ActionType } from "../game/types/ActionType";
import type {
  ClientAction,
  ClientActionClue,
} from "../game/types/ClientAction";
import type { JSONGame } from "../game/types/JSONGame";
import type { ReplayState } from "../game/types/ReplayState";
import { globals } from "../game/ui/UIGlobals";
import { shrink } from "./hypoCompress";

const PLAY_REGEX =
  /^(?:\[Hypo] )?(.*)(?: plays | fails to play ).* from slot #(\d).*$/;
const DISCARD_REGEX = /^(?:\[Hypo] )?(.*) discards .* slot #(\d).*$/;
const CLUE_REGEX = /^(?:\[Hypo] )?.+ tells (.*) about \w+ ([A-Za-z]+|\d)s?$/;

export function createJSONFromReplay(room: string): void {
  if (globals.store === null || !globals.state.finished) {
    sendSelfPMFromServer(
      "You can only use the <code>/copy</code> command during the review of a game.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Anonymize the players
  const game: JSONGame = {
    players: DEFAULT_PLAYER_NAMES.slice(0, globals.metadata.playerNames.length),
    deck: [],
    actions: [],
    options: {
      variant: globals.options.variantName,
    },
    notes: [],
    characters: [],
    id: 0,
    seed: "",
  };

  // Copy the entire deck.
  for (const [i, cardIdentity] of globals.state.cardIdentities.entries()) {
    const morph = globals.state.replay.hypothetical?.morphedIdentities[i];
    if (
      morph !== undefined &&
      morph.suitIndex !== null &&
      morph.rank !== null
    ) {
      game.deck.push({
        suitIndex: morph.suitIndex,
        rank: morph.rank,
      });
    } else {
      game.deck.push({
        suitIndex: cardIdentity.suitIndex,
        rank: cardIdentity.rank,
      });
    }
  }

  // Copy actions up to current segment.
  const { replay } = globals.state;
  game.actions = getGameActionsFromState(replay);

  // Add the hypothesis from log, after current segment.
  if (replay.hypothetical !== null) {
    const { states } = replay.hypothetical;
    const { log } = states.at(-1)!;
    if (replay.segment < log.length) {
      const logLines = log.slice(replay.segment + 1);
      const actions = getGameActionsFromLog(logLines);
      const newActions = [...game.actions, ...actions];
      game.actions = newActions;
    }
  }

  // Enforce at least one action.
  if (game.actions.length === 0) {
    sendSelfPMFromServer(
      "There are no actions in your hypothetical.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const json = JSON.stringify(game);
  const URLData = shrink(json);
  if (URLData === undefined || URLData === "") {
    sendSelfPMFromServer(
      "Failed to compress the JSON data.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const URL = `${SITE_URL}/shared-replay-json/${URLData}`;
  navigator.clipboard
    .writeText(URL)
    .then(() => {
      sendSelfPMFromServer(
        "The URL for this hypothetical is copied to your clipboard.",
        room,
        SelfChatMessageType.Info,
      );
      const urlFix = json.replaceAll('"', "\\'");
      const here = `<button href="#" onclick="navigator.clipboard.writeText('${urlFix}'.replace(/\\'/g, String.fromCharCode(34)));return false;"><strong>here</strong></button>`;
      sendSelfPMFromServer(
        `Click ${here} to copy the raw JSON data to your clipboard.`,
        room,
        SelfChatMessageType.Info,
      );
    })
    .catch((error) => {
      sendSelfPMFromServer(
        `Failed to copy the URL to your clipboard: ${error}`,
        room,
        SelfChatMessageType.Error,
      );
      sendSelfPMFromServer(URL, room);
    });
}

function getGameActionsFromState(source: ReplayState): readonly ClientAction[] {
  let currentSegment = 0;
  const maxSegment = source.segment;
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
          type: ActionType.Play,
          target: action.order,
        });
        currentSegment++;
        continue;
      }

      case "discard": {
        actions.push({
          type: action.failed ? ActionType.Play : ActionType.Discard,
          target: action.order,
        });
        currentSegment++;
        continue;
      }

      case "clue": {
        switch (action.clue.type) {
          case ClueType.Color: {
            actions.push({
              type: ActionType.ColorClue,
              target: action.target,
              value: action.clue.value,
            });
            break;
          }

          case ClueType.Rank: {
            actions.push({
              type: ActionType.RankClue,
              target: action.target,
              value: action.clue.value,
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
  const foundPlay = logEntry.text.match(PLAY_REGEX);
  if (foundPlay !== null) {
    const [, playerName, slotString] = foundPlay;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(
          i,
          ActionType.Play,
          playerName,
          slot,
        );
      }
    }
  }

  const foundDiscard = logEntry.text.match(DISCARD_REGEX);
  if (foundDiscard !== null) {
    const [, playerName, slotString] = foundDiscard;
    if (playerName !== undefined && slotString !== undefined) {
      const slot = parseIntSafe(slotString);
      if (slot !== undefined) {
        return getActionFromHypoPlayOrDiscard(
          i,
          ActionType.Discard,
          playerName,
          slot,
        );
      }
    }
  }

  const foundClue = logEntry.text.match(CLUE_REGEX);
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
  actionType: ActionType.Play | ActionType.Discard,
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

  return {
    type: actionType,
    target: cardOrder,
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
    clueNumber = 1;
  } else if (clueWord === "Even") {
    clueNumber = 2;
  }

  if (clueNumber === undefined) {
    // It is a color clue.
    const colorIndex = getColorIndexFromColorName(clueWord, globals.variant);
    assertDefined(
      colorIndex,
      `The clue color name of ${clueWord} is not valid for this variant.`,
    );

    return {
      type: ActionType.ColorClue,
      target: playerIndex,
      value: colorIndex,
    };
  }

  if (!includes(globals.variant.clueRanks, clueNumber)) {
    throw new Error(
      `The clue rank of ${clueNumber} is not valid for this variant.`,
    );
  }
  const rankClueNumber = clueNumber as RankClueNumber;

  // It is a rank clue.
  return {
    type: ActionType.RankClue,
    target: playerIndex,
    value: rankClueNumber,
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
  if (globals.state.replay.hypothetical === null) {
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
  const colorIndex = variant.clueColors.findIndex(
    (clueColor) => clueColor.name === colorName,
  );

  return colorIndex === -1 ? undefined : (colorIndex as ColorIndex);
}
