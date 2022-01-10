import * as chat from "../chat";
import ActionType from "../game/types/ActionType";
import ClientAction from "../game/types/ClientAction";
import ClueType from "../game/types/ClueType";
import { LogEntry } from "../game/types/GameState";
import { JSONGame } from "../game/types/JSONGame";
import ReplayState from "../game/types/ReplayState";
import globals from "../game/ui/globals";

export default function createJSONFromReplay(room: string) {
  if (globals === null || globals.state.replay.hypothetical === null) {
    chat.addSelf(
      '<span class="red">Error!</span>: You can only use that command during the review of a hypo.',
      room,
    );
    return;
  }

  // Anonymize the players
  const fakePlayers = ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"];
  const game: JSONGame = {
    players: fakePlayers.slice(0, globals.metadata.playerNames.length),
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
  const rePlay = /^(.*)(?: plays | fails to play ).* from slot #(\d).*$/;
  const reDiscard = /^(.*) discards .* slot #(\d).*$/;
  const reClue = /^(?:.+) tells (.*) about \w+ ([a-zA-Z]+|\d).*$/;

  log.forEach((line, index) => {
    const foundPlay = line.text.match(rePlay);
    const foundDiscard = line.text.match(reDiscard);
    const foundClue = line.text.match(reClue);

    let action: ClientAction | null = null;
    if (foundPlay !== null && foundPlay.length > 2) {
      const target = parseInt(foundPlay[2], 10);
      action = getTargetCardFromPlayOrDiscard(
        index,
        ActionType.Play,
        foundPlay[1],
        target,
      );
    } else if (foundDiscard !== null && foundDiscard.length > 2) {
      const target = parseInt(foundDiscard[2], 10);
      action = getTargetCardFromPlayOrDiscard(
        index,
        ActionType.Discard,
        foundDiscard[1],
        target,
      );
    } else if (foundClue !== null && foundClue.length > 2) {
      action = getTargetCardFromClue(
        index,
        ActionType.ColorClue,
        foundClue[1],
        foundClue[2],
      );
    }

    if (action !== null) {
      actions.push(action);
    }
  });
  return actions;
}

function getTargetCardFromPlayOrDiscard(
  entry_number: number,
  action_type: number,
  player: string,
  card_target: number,
): ClientAction | null {
  const playerIndex = getPlayerIndexFromName(player);
  return {
    type: action_type,
    target: playerIndex,
    value: card_target,
  };
}

function getTargetCardFromClue(
  entry_number: number,
  action_type: number,
  player: string,
  slot: string,
): ClientAction | null {
  const playerIndex = getPlayerIndexFromName(player);
  return {
    type: action_type,
    target: playerIndex,
    value: parseInt(slot, 10),
  };
}

function getPlayerIndexFromName(name: string): number {
  return globals.metadata.playerNames.indexOf(name);
}
