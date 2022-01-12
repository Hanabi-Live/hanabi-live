import { HYPO_PLAYER_NAMES } from "@hanabi/data";
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
    globals.state.replay === null ||
    globals.state.replay.hypothetical === null
  ) {
    chat.addSelf(
      '<span class="red">Error:</span> You can only use that command during the review of a hypothetical.',
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
  const states = replay.hypothetical!.states;
  const log = states[states.length - 1].log;
  if (replay.segment < log.length) {
    game.actions.push(...getGameActionsFromLog(log.slice(replay.segment + 1)));
  }

  const json = JSON.stringify(game);
  navigator.clipboard.writeText(json).then(
    () => {},
    () => {},
  );
  chat.addSelf(
    '<span class="green">Info</span>: Your hypo is copied on your clipboard.',
    room,
  );
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
      case "play":
        actions.push({
          type: ActionType.Play,
          target: action.order,
        });
        currentSegment += 1;
        continue;
      case "discard":
        actions.push({
          type: ActionType.Discard,
          target: action.order,
        });
        currentSegment += 1;
        continue;
      case "clue":
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
      default:
        continue;
    }
  }
  return actions;
}

function getGameActionsFromLog(log: readonly LogEntry[]): ClientAction[] {
  const actions: ClientAction[] = [];
  const regexPlay = /^(.*)(?: plays | fails to play ).* from slot #(\d).*$/;
  const regexDiscard = /^(.*) discards .* slot #(\d).*$/;
  const regexClue = /^(?:.+) tells (.*) about \w+ ([a-zA-Z]+|\d).*$/;

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
  const parsedClue = parseInt(clue, 10);

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
  stateIndex: number,
  playerIndex: number,
  slotIndex: number,
): number {
  if (globals.state.replay.hypothetical === null) {
    return 0;
  }
  return globals.state.replay.hypothetical.states[Math.max(stateIndex, 0)]
    .hands[playerIndex][slotIndex];
}

function getColorIdFromString(clue: string): number {
  let suitIndex = 0;
  globals.variant.suits.forEach((el, index) => {
    if (el.name === clue) {
      suitIndex = index;
    }
  });
  return suitIndex;
}

function getCardsPerPlayer(): number {
  return globals.state.replay.states[0].hands[0].length;
}
