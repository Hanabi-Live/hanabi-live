import { HYPO_PLAYER_NAMES, shrink, SITE_URL } from "@hanabi/data";
import * as chat from "../chat";
import ActionType from "../game/types/ActionType";
import ClientAction from "../game/types/ClientAction";
import ClueType from "../game/types/ClueType";
import { LogEntry } from "../game/types/GameState";
import { JSONGame } from "../game/types/JSONGame";
import ReplayState from "../game/types/ReplayState";
import globals from "../game/ui/globals";

export default function createJSONFromReplay(room: string) {
  if (
    globals === null ||
    globals.store === null ||
    !globals.state.finished ||
    globals.state.replay === null
  ) {
    chat.addSelf(
      '<span class="red">Error:</span> You can only use that command during the review of a game.',
      room,
    );
    return;
  }

  // Anonymize the players
  const game: JSONGame = {
    players: HYPO_PLAYER_NAMES.slice(0, globals.metadata.playerNames.length),
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

  // Copy the entire Deck
  globals.state.cardIdentities.forEach((el) => {
    game.deck.push({
      suitIndex: el.suitIndex,
      rank: el.rank,
    });
  });

  // Copy actions up to current segment
  const replay = globals.state.replay;
  game.actions = getGameActionsFromState(replay);

  // Add the hypothesis from log, after current segment
  if (replay.hypothetical !== null) {
    const states = replay.hypothetical.states;
    const log = states[states.length - 1].log;
    if (replay.segment < log.length) {
      const slice = log.slice(replay.segment + 1);
      const actions = getGameActionsFromLog(slice);
      game.actions.push(...actions);
    }
  }

  // Enforce at least one action
  if (game.actions.length === 0) {
    chat.addSelf(
      '<span class="red">Error</span>: There are no actions in your hypo.',
      room,
    );
    return;
  }

  const json = JSON.stringify(game);
  const URLData = shrink(json);
  if (URLData === null || URLData === "") {
    chat.addSelf(
      '<span class="red">Error</span>: Failed to compress the JSON data.',
      room,
    );
    return;
  }

  const URL = `${SITE_URL}/shared-replay-json/${URLData}`;
  navigator.clipboard
    .writeText(URL)
    .then(() => {
      chat.addSelf(
        '<span class="green">Info</span>: The URL for this hypothetical is copied to your clipboard.',
        room,
      );
      const urlFix = json.replace(/"/g, "\\'");
      const here = `<button href="#" onclick="navigator.clipboard.writeText(${urlFix}.replace(/\\'/g, String.fromCharCode(34))).then(()=>{},()=>{});return false;"><strong>here</strong></button>`;
      chat.addSelf(
        `<span class="green">Info</span>: Click ${here} to copy the raw JSON data to your clipboard.`,
        room,
      );
    })
    .catch((err) => {
      chat.addSelf(
        `<span class="red">Error</span>: Failed to copy the URL to your clipboard: ${err}`,
        room,
      );
      chat.addSelf(URL, room);
    });
}

function getGameActionsFromState(source: ReplayState): ClientAction[] {
  let currentSegment = 0;
  const maxSegment = source.segment;
  const actions: ClientAction[] = [];
  for (
    let i = 0;
    i < source.actions.length && currentSegment < maxSegment;
    i++
  ) {
    const action = source.actions[i];
    switch (action.type) {
      case "play": {
        actions.push({
          type: ActionType.Play,
          target: action.order,
        });
        currentSegment += 1;
        continue;
      }

      case "discard": {
        actions.push({
          type: ActionType.Discard,
          target: action.order,
        });
        currentSegment += 1;
        continue;
      }

      case "clue": {
        if (action.clue.type === ClueType.Color) {
          actions.push({
            type: ActionType.ColorClue,
            target: action.target,
            value: action.clue.value,
          });
        } else if (action.clue.type === ClueType.Rank) {
          actions.push({
            type: ActionType.RankClue,
            target: action.target,
            value: action.clue.value,
          });
        }
        currentSegment += 1;
        continue;
      }

      default: {
        continue;
      }
    }
  }

  return actions;
}

function getGameActionsFromLog(log: readonly LogEntry[]): ClientAction[] {
  const actions: ClientAction[] = [];
  const regexPlay = /^(.*)(?: plays | fails to play ).* from slot #(\d).*$/;
  const regexDiscard = /^(.*) discards .* slot #(\d).*$/;
  const regexClue = /^(?:.+) tells (.*) about \w+ ([a-zA-Z]+|\d)s?$/;

  log.forEach((line, index) => {
    const foundPlay = line.text.match(regexPlay);
    const foundDiscard = line.text.match(regexDiscard);
    const foundClue = line.text.match(regexClue);

    let action: ClientAction | null = null;
    if (foundPlay !== null && foundPlay.length > 2) {
      const target = parseInt(foundPlay[2], 10);
      action = getActionFromHypoPlayOrDiscard(
        index,
        ActionType.Play,
        foundPlay[1],
        target,
      );
    } else if (foundDiscard !== null && foundDiscard.length > 2) {
      const target = parseInt(foundDiscard[2], 10);
      action = getActionFromHypoPlayOrDiscard(
        index,
        ActionType.Discard,
        foundDiscard[1],
        target,
      );
    } else if (foundClue !== null && foundClue.length > 2) {
      action = getActionFromHypoClue(foundClue[1], foundClue[2]);
    }

    if (action !== null) {
      actions.push(action);
    }
  });
  return actions;
}

function getActionFromHypoPlayOrDiscard(
  entry_number: number,
  action_type: number,
  player: string,
  slot: number,
): ClientAction | null {
  const playerIndex = getPlayerIndexFromName(player);
  // Go to previous hypo state to find the card
  // Cards are stored in reverse order than the one perceived
  const cardsPerPlayer = getCardsPerPlayer();
  const slotIndex = cardsPerPlayer - slot;
  const cardID = getCardFromHypoState(entry_number - 1, playerIndex, slotIndex);
  return {
    type: action_type,
    target: cardID,
  };
}

function getActionFromHypoClue(
  player: string,
  clue: string,
): ClientAction | null {
  const playerIndex = getPlayerIndexFromName(player);
  let parsedClue = parseInt(clue, 10);

  // "Odds and Evens" give "Odd"/"Even" as rank clues
  if (clue.startsWith("Odd")) {
    parsedClue = 1;
  } else if (clue.startsWith("Even")) {
    parsedClue = 2;
  }

  if (Number.isNaN(parsedClue)) {
    // It's a color clue
    return {
      type: ActionType.ColorClue,
      target: playerIndex,
      value: getColorIdFromString(clue),
    };
  }
  // It's a rank clue
  return {
    type: ActionType.RankClue,
    target: playerIndex,
    value: parsedClue,
  };
}

function getPlayerIndexFromName(name: string): number {
  return globals.metadata.playerNames.indexOf(name);
}

function getCardFromHypoState(
  previousStateIndex: number,
  playerIndex: number,
  slotIndex: number,
): number {
  if (globals.state.replay.hypothetical === null) {
    return 0;
  }
  const stateIndex = Math.max(previousStateIndex, 0);
  const stateOnHypoTurn = globals.state.replay.hypothetical.states[stateIndex];
  const playerHand = stateOnHypoTurn.hands[playerIndex];
  return playerHand[slotIndex];
}

function getColorIdFromString(clue: string): number {
  let suitIndex = 0;
  globals.variant.clueColors.forEach((color, index) => {
    if (clue.startsWith(color.name)) {
      suitIndex = index;
    }
  });
  return suitIndex;
}

function getCardsPerPlayer(): number {
  return globals.state.replay.states[0].hands[0].length;
}
