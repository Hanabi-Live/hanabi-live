import { ActionType, RecordedActionType, SITE_URL } from "@hanabi-live/data";
import type {
  CardOrder,
  ColorIndex,
  LogEntry,
  PlayerIndex,
  RankClueNumber,
  Variant,
} from "@hanabi-live/game";
import {
  ClueType,
  DEFAULT_PLAYER_NAMES,
  EVEN_RANK_CLUE,
  getCardsPerHand,
  NO_VALUE,
  ODD_RANK_CLUE,
} from "@hanabi-live/game";
import { assertDefined, parseIntSafe } from "complete-common";
import { includes } from "lodash";
import { SelfChatMessageType, sendSelfPMFromServer } from "../chat";
import type {
  ClientAction,
  ClientActionClue,
} from "../game/types/ClientAction";
import type { ReplayState } from "../game/types/ReplayState";
import { globals } from "../game/ui/UIGlobals";
import type { GameJSON } from "./hypoCompress";
import { shrink } from "./hypoCompress";

const PLAY_REGEX =
  /^(?:\[Hypo\] )?(.*)(?: fails to play | plays ).* from slot #(\d).*$/u;
const DISCARD_REGEX = /^(?:\[Hypo\] )?(.*) discards .* slot #(\d).*$/u;
const CLUE_REGEX = /^.+ tells (.*) about \w+ ([A-Za-z]+|\d)s?$/u;

export function createJSONFromReplay(room: string): void {
  if (globals.store === undefined || !globals.state.finished) {
    sendSelfPMFromServer(
      "You can only use the <code>/copy</code> command during the review of a game.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  if (
    globals.state.replay.actions.some(
      (action) => action.type === "clue" && action.clue.type === NO_VALUE,
    )
  ) {
    sendSelfPMFromServer(
      "The completed clue history is still loading. Please try again after it loads.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Anonymize the players
  const game: GameJSON = {
    playerNames: DEFAULT_PLAYER_NAMES.slice(
      0,
      globals.metadata.playerNames.length,
    ),
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
      morph !== undefined
      && morph.suitIndex !== undefined
      && morph.rank !== undefined
    ) {
      game.deck.push({
        suitIndex: morph.suitIndex,
        rank: morph.rank,
      });
    } else if (
      cardIdentity.suitIndex === undefined
      || cardIdentity.rank === undefined
    ) {
      sendSelfPMFromServer(
        "The deck is still loading. Please try again after it loads.",
        room,
        SelfChatMessageType.Error,
      );
      return;
    } else {
      game.deck.push({
        suitIndex: cardIdentity.suitIndex,
        rank: cardIdentity.rank,
      });
    }
  }

  // A morphed deck no longer necessarily matches its original seed. Preserve seed metadata only
  // when every exported identity is unchanged.
  if (
    globals.metadata.seed !== "JSON"
    && game.deck.every((card, i) => {
      const original = globals.state.cardIdentities[i];
      return (
        card.suitIndex === original?.suitIndex && card.rank === original.rank
      );
    })
  ) {
    game.seed = globals.metadata.seed;
  }

  // Copy actions up to current segment.
  const { replay } = globals.state;
  game.actions = getGameActionsFromState(replay).map(toRecordedAction);

  // Add the hypothetical from the log, after the current segment.
  if (replay.hypothetical !== undefined) {
    const { states } = replay.hypothetical;
    const { log } = states.at(-1)!;
    if (replay.segment < log.length) {
      const logLines = log.slice(replay.segment + 1);
      const actions = getGameActionsFromLog(logLines).map(toRecordedAction);
      const newActions = [...game.actions, ...actions];
      game.actions = newActions;
    }
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
      const urlFix = json.replaceAll('"', String.raw`\'`);
      const here = String.raw`<button href="#" onclick="navigator.clipboard.writeText('${urlFix}'.replace(/\'/g, String.fromCharCode(34)));return false;"><strong>here</strong></button>`;
      sendSelfPMFromServer(
        `Click ${here} to copy the raw JSON data to your clipboard.`,
        room,
        SelfChatMessageType.Info,
      );
    })
    .catch((error: unknown) => {
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
          case NO_VALUE: {
            throw new Error(
              "Cannot export a replay with concealed clue identities.",
            );
          }

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
  const foundPlay = PLAY_REGEX.exec(logEntry.text);
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

  const foundDiscard = DISCARD_REGEX.exec(logEntry.text);
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

/** Each turn's type in a game's record. */
const RECORDED_ACTION_TYPES = {
  [ActionType.Play]: RecordedActionType.Play,
  [ActionType.Discard]: RecordedActionType.Discard,
  [ActionType.ColorClue]: RecordedActionType.ColorClue,
  [ActionType.RankClue]: RecordedActionType.RankClue,
} as const satisfies Record<ActionType, RecordedActionType>;

/** A turn as an exported game records it. */
function toRecordedAction(action: ClientAction): {
  readonly type: RecordedActionType;
  readonly target: number;
  readonly value?: number;
} {
  const { type, ...rest } = action;
  return { ...rest, type: RECORDED_ACTION_TYPES[type] };
}
