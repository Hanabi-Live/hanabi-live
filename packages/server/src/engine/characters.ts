import { EndCondition } from "@hanabi-live/game";
import { at, clueCost, touchedOrders } from "./rules";
import type {
  EnginePlayer,
  EngineState,
  MutableEngineState,
  MutablePlayer,
  PlayerAction,
  RecordedAction,
} from "./types";
import { ActionRejected } from "./types";

function reject(player: EnginePlayer, reason: string): never {
  throw new ActionRejected(`You are ${player.character}, ${reason}`);
}

export function validateCharacterAction(
  state: EngineState,
  player: EnginePlayer,
  action: PlayerAction,
): void {
  if (!state.options.detrimentalCharacters) {
    return;
  }
  const isClue = action.type === 2 || action.type === 3;
  const metadata = player.characterMetadata;
  switch (player.character) {
    case "Vindictive": {
      if (metadata === 0 && !isClue) {
        reject(
          player,
          "so you must give a clue if you have been given a clue on this go-around.",
        );
      }
      break;
    }

    case "Insistent": {
      if (metadata !== -1 && !isClue) {
        reject(
          player,
          "so you must continue to clue the same card until it is played or discarded.",
        );
      }
      break;
    }

    case "Impulsive": {
      if (
        metadata === 0
        && (action.type !== 0 || action.target !== player.hand.at(-1))
      ) {
        reject(
          player,
          "so you must play your slot 1 card after it has been clued.",
        );
      }
      break;
    }

    case "Indolent": {
      if (action.type === 0 && metadata === 0) {
        reject(
          player,
          "so you cannot play a card if you played one in the last round.",
        );
      }
      break;
    }

    case "Stubborn": {
      if (
        action.type === metadata
        || (isClue && (metadata === 2 || metadata === 3))
      ) {
        reject(
          player,
          "so you cannot perform the same kind of action that the previous player did.",
        );
      }
      break;
    }

    default: {
      break;
    }
  }
  if (metadata !== -1) {
    if (player.character === "Genius") {
      if (action.type !== 3) {
        reject(player, "so you must now give a rank clue.");
      }
      if (action.target !== metadata) {
        reject(player, "so you must give the second clue to the same player.");
      }
    } else if (player.character === "Panicky" && action.type !== 1) {
      reject(
        player,
        "so you must discard again since there are 4 or less clues available.",
      );
    }
  }
}

export function validateCharacterPlay(
  state: EngineState,
  player: EnginePlayer,
  action: PlayerAction,
): void {
  if (
    state.options.detrimentalCharacters
    && player.character === "Hesitant"
    && player.hand.at(-1) === action.target
  ) {
    throw new ActionRejected(
      "You cannot play that card since you are a Hesitant character.",
    );
  }
}

export function validateCharacterDiscard(
  state: EngineState,
  player: EnginePlayer,
): void {
  if (!state.options.detrimentalCharacters) {
    return;
  }
  if (player.character === "Anxious" && state.clueTokens % 2 === 0) {
    reject(
      player,
      "so you cannot discard when there is an even number of clues available.",
    );
  } else if (player.character === "Traumatized" && state.clueTokens % 2 === 1) {
    reject(
      player,
      "so you cannot discard when there is an odd number of clues available.",
    );
  } else if (
    player.character === "Wasteful"
    && state.clueTokens >= 2 * clueCost(state)
  ) {
    reject(
      player,
      "so you cannot discard if there are 2 or more clues available.",
    );
  }
}

export function validateCharacterClue(
  state: EngineState,
  player: EnginePlayer,
  action: PlayerAction,
): void {
  if (!state.options.detrimentalCharacters) {
    return;
  }
  const target = at(state.players, action.target);
  const touched = touchedOrders(state, action);
  const metadata = player.characterMetadata;
  const clueType = action.type - 2;
  switch (player.character) {
    case "Fuming": {
      if (clueType === 0 && action.value !== metadata) {
        reject(player, "so you can not give that type of clue.");
      }
      break;
    }

    case "Dumbfounded": {
      if (clueType === 1 && action.value !== metadata) {
        reject(player, "so you can not give that type of clue.");
      }
      break;
    }

    case "Inept": {
      if (
        touched.some((order) => at(state.deck, order).suitIndex === metadata)
      ) {
        reject(player, "so you cannot give clues that touch a specific suit.");
      }
      break;
    }

    case "Awkward": {
      if (touched.some((order) => at(state.deck, order).rank === metadata)) {
        reject(
          player,
          `so you cannot give clues that touch cards with a rank of ${metadata}.`,
        );
      }
      break;
    }

    case "Conservative": {
      if (touched.length !== 1) {
        reject(player, "so you can only give clues that touch a single card.");
      }
      break;
    }

    case "Greedy": {
      if (touched.length < 2) {
        reject(player, "so you can only give clues that touch 2+ cards.");
      }
      break;
    }

    case "Picky": {
      if ((action.value + (clueType === 0 ? 1 : 0)) % 2 === 0) {
        reject(player, "so you can only clue odd numbers or odd colors.");
      }
      break;
    }

    case "Spiteful": {
      if (action.target === (player.index + 1) % state.players.length) {
        reject(player, "so you cannot clue the player to your left.");
      }
      break;
    }

    case "Insolent": {
      if (
        action.target
        === (player.index + state.players.length - 1) % state.players.length
      ) {
        reject(player, "so you cannot clue the player to your right.");
      }
      break;
    }

    case "Miser": {
      if (state.clueTokens < 4 * clueCost(state)) {
        reject(
          player,
          "so you cannot give a clue unless there are 4 or more clues available.",
        );
      }
      break;
    }

    case "Compulsive": {
      if (
        touched.every(
          (order) =>
            !(order === target.hand[0] || order === target.hand.at(-1)),
        )
      ) {
        reject(
          player,
          "so you can only give a clue if it touches either the newest or oldest card in a hand.",
        );
      }
      break;
    }

    case "Mood Swings": {
      if (metadata === clueType) {
        reject(player, "so cannot give the same clue type twice in a row.");
      }
      break;
    }

    case "Insistent": {
      if (
        metadata !== -1
        && touched.every((order) => !at(state.deck, order).insistentTouched)
      ) {
        reject(
          player,
          "so you must continue to clue a card until it is played or discarded.",
        );
      }
      break;
    }

    case "Genius": {
      if (metadata === -1) {
        if (state.clueTokens < 2 * clueCost(state)) {
          reject(
            player,
            "so there needs to be at least two clues available for you to give a clue.",
          );
        }
        if (clueType !== 0) {
          reject(player, "so you must give a color clue first.");
        }
      }
      break;
    }

    default: {
      break;
    }
  }
  if (
    target.character === "Vulnerable"
    && clueType === 1
    && (action.value === 2 || action.value === 5)
  ) {
    throw new ActionRejected(
      "You cannot give a number 2 or number 5 clue to a Vulnerable character.",
    );
  }
  if (target.character === "Color-Blind" && clueType === 0) {
    throw new ActionRejected(
      "You cannot give that color clue to a Color-Blind character.",
    );
  }
}

export function characterPostClue(
  state: MutableEngineState,
  actor: MutablePlayer,
  action: PlayerAction,
  touched: readonly number[],
): void {
  const player = actor;
  if (!state.options.detrimentalCharacters) {
    return;
  }
  if (player.character === "Mood Swings") {
    player.characterMetadata = action.type - 2;
  } else if (
    player.character === "Insistent"
    && player.characterMetadata === -1
  ) {
    for (const order of touched) {
      at(state.deck, order).insistentTouched = true;
    }
    player.characterMetadata = 0;
  }
  const target = at(state.players, action.target);
  if (
    target.character === "Vindictive"
    || (target.character === "Impulsive"
      && target.hand.length > 0
      && touched.includes(at(target.hand, target.hand.length - 1)))
  ) {
    target.characterMetadata = 0;
  }
}

export function characterPostAction(
  draft: MutableEngineState,
  actor: MutablePlayer,
  action: RecordedAction,
): void {
  const state = draft;
  const player = actor;
  if (!state.options.detrimentalCharacters) {
    return;
  }
  switch (player.character) {
    case "Vindictive":
    case "Impulsive": {
      player.characterMetadata = -1;

      break;
    }

    case "Indolent": {
      player.characterMetadata = action.type === 0 ? 0 : -1;

      break;
    }

    case "Contrarian": {
      state.turnsInverted = !state.turnsInverted;

      break;
    }
    // No default
  }
  for (const other of state.players) {
    if (other.character === "Stubborn") {
      other.characterMetadata = action.type;
    }
  }
}

export function needsSecondAction(
  state: MutableEngineState,
  actor: MutablePlayer,
  action: RecordedAction,
): boolean {
  const player = actor;
  if (!state.options.detrimentalCharacters) {
    return false;
  }
  if (player.character === "Genius") {
    if (action.type === 2) {
      player.characterMetadata = action.target;
      return true;
    }
    if (action.type === 3) {
      player.characterMetadata = -1;
    }
  } else if (player.character === "Panicky" && action.type === 1) {
    if (
      player.characterMetadata === -1
      && state.clueTokens <= 4 * clueCost(state)
    ) {
      player.characterMetadata = 0;
      return true;
    }
    if (player.characterMetadata === 0) {
      player.characterMetadata = -1;
    }
  }
  return false;
}

export function hasTakenLastTurn(state: EngineState): boolean {
  if (state.endTurn === -1) {
    return false;
  }
  if (!state.options.detrimentalCharacters) {
    return state.endTurn !== state.turn + state.players.length + 1;
  }
  let active = state.activePlayerIndex;
  let inverted = state.turnsInverted;
  for (let turn = state.turn + 1; turn <= state.endTurn; turn++) {
    active =
      (active + state.players.length + (inverted ? -1 : 1))
      % state.players.length;
    if (active === state.activePlayerIndex) {
      return false;
    }
    if (at(state.players, active).character === "Contrarian") {
      inverted = !inverted;
    }
  }
  return true;
}

export function checkCharacterSoftlock(draft: MutableEngineState): void {
  const state = draft;
  const player = at(state.players, state.activePlayerIndex);
  if (
    state.options.detrimentalCharacters
    && state.clueTokens < clueCost(state)
    && player.characterMetadata === 0
    && (player.character === "Vindictive" || player.character === "Insistent")
  ) {
    state.endCondition = EndCondition.CharacterSoftlock;
    state.endPlayer = player.index;
  }
}
