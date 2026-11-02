import {
  rank as cardRankSchema,
  EndCondition,
  getVariant,
  options,
} from "@hanabi-live/game";
import {
  characterPostAction,
  characterPostClue,
  checkCharacterSoftlock,
  hasTakenLastTurn,
  needsSecondAction,
  validateCharacterAction,
  validateCharacterClue,
  validateCharacterDiscard,
  validateCharacterPlay,
} from "./characters";
import {
  at,
  calculateMaxScore,
  clueCost,
  drawCard,
  followerMisplays,
  hasRemainingPlay,
  hasReversedSuits,
  removeCard,
  seesCard,
  touchedOrders,
  tryPlay,
  variantFor,
} from "./rules";
import { assignCharacters, createShuffledDeck } from "./setup";
import type {
  CompletionTiming,
  EngineState,
  GameSetup,
  MutableCard,
  MutableEngineState,
  MutablePlayer,
  PlayerAction,
  RecordedAction,
  Termination,
  Transition,
} from "./types";
import { ActionRejected } from "./types";

export function createGame(setup: GameSetup): Transition {
  const parsedOptions = options.parse(setup.options);
  if (
    setup.playerNames.length !== parsedOptions.numPlayers
    || parsedOptions.startingPlayer < 0
    || parsedOptions.startingPlayer >= setup.playerNames.length
  ) {
    throw new RangeError("The game options do not match the ordered players.");
  }
  const variant = getVariant(parsedOptions.variantName);
  const identities = setup.deck ?? createShuffledDeck(variant, setup.seed);
  if (
    identities.length === 0
    || identities.some(
      (card) =>
        !Number.isSafeInteger(card.suitIndex)
        || card.suitIndex < 0
        || card.suitIndex >= variant.suits.length
        || !cardRankSchema.safeParse(card.rank).success,
    )
  ) {
    throw new RangeError("The prepared deck contains invalid card identities.");
  }
  const assigned = parsedOptions.detrimentalCharacters
    ? (setup.characters
      ?? assignCharacters(variant, setup.seed, setup.playerNames))
    : setup.playerNames.map(() => ({ name: "", metadata: -1 }));
  if (
    assigned.length !== setup.playerNames.length
    || assigned.some((character) => !Number.isSafeInteger(character.metadata))
  ) {
    throw new RangeError("Invalid prepared character assignments.");
  }
  const state: MutableEngineState = {
    options: parsedOptions,
    seed: setup.seed,
    interpretation: setup.interpretation ?? "live",
    players: setup.playerNames.map((name, index) => {
      const character = at(assigned, index);
      return {
        name,
        index,
        character: character.name,
        characterMetadata: character.metadata,
        hand: [],
      };
    }),
    deck: identities.map((card, order) => ({
      ...card,
      order,
      slot: 0,
      touched: false,
      discarded: false,
      played: false,
      failed: false,
      cannotBePlayed: false,
      insistentTouched: false,
    })),
    deckIndex: 0,
    stacks: variant.suits.map(() => 0),
    stackStarts: variant.suits.map(() => 0),
    playStackDirections: variant.suits.map((suit) => {
      if (hasReversedSuits(variant) && !variant.upOrDown) {
        return suit.reversed ? 2 : 1;
      }
      return 0;
    }),
    turn: 0,
    turnsInverted: false,
    activePlayerIndex: parsedOptions.startingPlayer,
    clueTokens: variant.clueStarved ? 16 : 8,
    score: 0,
    maxScore: variant.maxScore,
    strikes: 0,
    lastClueTypeGiven: -1,
    endCondition: EndCondition.InProgress,
    endPlayer: -1,
    endTurn: -1,
    startedTimer: false,
    paused: false,
    events: [],
    actions: [],
  };
  const normalHandSize = at([0, 0, 5, 5, 4, 4, 3], state.players.length);
  const handSize =
    normalHandSize
    + (parsedOptions.oneExtraCard ? 1 : 0)
    - (parsedOptions.oneLessCard ? 1 : 0);
  for (const player of state.players) {
    for (let index = 0; index < handSize; index++) {
      drawCard(state, player);
    }
  }
  return { state, events: state.events };
}

function copyState(state: EngineState): MutableEngineState {
  return {
    ...state,
    options: { ...state.options },
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
    })),
    deck: state.deck.map((card) => ({ ...card })),
    stacks: [...state.stacks],
    stackStarts: [...state.stackStarts],
    playStackDirections: [...state.playStackDirections],
    events: [...state.events],
    actions: [...state.actions],
  };
}

function checkOngoing(state: EngineState) {
  if (state.endCondition !== EndCondition.InProgress) {
    throw new ActionRejected("The game is already ending.");
  }
}

export function validateAction(
  state: EngineState,
  actorIndex: number,
  action: PlayerAction,
): void {
  checkOngoing(state);
  if (
    !Number.isSafeInteger(actorIndex)
    || actorIndex < 0
    || actorIndex >= state.players.length
  ) {
    throw new ActionRejected("You are not playing in this game.");
  }
  if (actorIndex !== state.activePlayerIndex) {
    throw new ActionRejected(
      "It is not your turn, so you cannot perform an action.",
    );
  }
  if (state.paused) {
    throw new ActionRejected(
      "You cannot perform a game action when the game is paused.",
    );
  }
  if (
    ![0, 1, 2, 3].includes(action.type)
    || !Number.isSafeInteger(action.target)
    || !Number.isSafeInteger(action.value)
  ) {
    throw new ActionRejected("That is not a valid action type.");
  }
  const player = at(state.players, actorIndex);
  validateCharacterAction(state, player, action);
  const variant = variantFor(state);
  const deckMove =
    state.options.deckPlays
    && state.deckIndex === state.deck.length - 1
    && action.target === state.deckIndex;
  if (action.type === 0) {
    validateCharacterPlay(state, player, action);
    if (!deckMove && !player.hand.includes(action.target)) {
      throw new ActionRejected(
        "You cannot play a card that is not in your hand.",
      );
    }
  } else if (action.type === 1) {
    if (deckMove) {
      if (!variant.hasInverted) {
        throw new ActionRejected(
          "You cannot discard the last card in non-Inverted games",
        );
      }
      return;
    }
    if (!player.hand.includes(action.target)) {
      throw new ActionRejected(
        "You cannot discard a card that is not in your hand.",
      );
    }
    if (state.clueTokens >= 8 * clueCost(state) && !variant.hasInverted) {
      throw new ActionRejected(
        "You cannot discard while the team has 8 clues.",
      );
    }
    validateCharacterDiscard(state, player);
  } else {
    if (action.target < 0 || action.target >= state.players.length) {
      throw new ActionRejected("That is an invalid clue target.");
    }
    if (action.target === actorIndex) {
      throw new ActionRejected("You cannot give a clue to yourself.");
    }
    if (state.clueTokens < clueCost(state)) {
      throw new ActionRejected(
        "You need at least 1 clue token available in order to give a clue.",
      );
    }
    if (
      action.type === 2
      && (action.value < 0 || action.value >= variant.clueColors.length)
    ) {
      throw new ActionRejected(
        `You cannot give a color clue with a value of "${action.value}".`,
      );
    }
    if (
      action.type === 3
      && variant.clueRanks.every((rank) => rank !== action.value)
    ) {
      throw new ActionRejected(
        `You cannot give a rank clue with a value of "${action.value}".`,
      );
    }
    if (
      variant.alternatingClues
      && state.lastClueTypeGiven === action.type - 2
    ) {
      throw new ActionRejected(
        "You cannot give two clues of the same time in a row in this variant.",
      );
    }
    validateCharacterClue(state, player, action);
    const target = at(state.players, action.target);
    if (
      touchedOrders(state, action).every(
        (order) => !seesCard(state, player, target, order),
      )
      && !state.options.emptyClues
      && !(action.type === 2 && variant.colorCluesTouchNothing)
      && !(action.type === 3 && variant.rankCluesTouchNothing)
    ) {
      throw new ActionRejected(
        "You cannot give a clue that touches 0 cards in the hand.",
        { silent: state.options.speedrun },
      );
    }
  }
}

function discard(
  draft: MutableEngineState,
  player: MutablePlayer,
  discarded: MutableCard,
) {
  const state = draft;
  const card = discarded;
  if (!card.failed) {
    state.actions.push({ type: 1, target: card.order, value: 0 });
  }
  card.discarded = true;
  state.events.push({
    type: "discard",
    playerIndex: player.index,
    order: card.order,
    suitIndex: card.suitIndex,
    rank: card.rank,
    failed: card.failed,
  });
  state.maxScore = Math.min(state.maxScore, calculateMaxScore(state));
}

function play(
  draft: MutableEngineState,
  player: MutablePlayer,
  played: MutableCard,
) {
  const state = draft;
  const card = played;
  state.actions.push({ type: 0, target: card.order, value: 0 });
  const playable = tryPlay(state, card);
  if (!playable || followerMisplays(state, player, card)) {
    card.failed = true;
    state.strikes++;
    state.events.push({
      type: "strike",
      num: state.strikes,
      turn: state.turn,
      order: card.order,
    });
    discard(state, player, card);
    return;
  }
  card.played = true;
  state.score++;
  state.stacks[card.suitIndex] = card.rank;
  state.events.push({
    type: "play",
    playerIndex: player.index,
    order: card.order,
    suitIndex: card.suitIndex,
    rank: card.rank,
  });
  const variant = variantFor(state);
  let finished = card.rank === 5;
  if (hasReversedSuits(variant)) {
    finished =
      (card.rank === 1 || card.rank === 5)
      && at(state.playStackDirections, card.suitIndex) === 3;
  } else if (variant.sudoku) {
    finished = at(state.playStackDirections, card.suitIndex) === 3;
  }
  if (finished && !variant.throwItInAHole) {
    state.clueTokens = Math.min(state.clueTokens + 1, 8 * clueCost(state));
  }
  state.maxScore = Math.min(state.maxScore, calculateMaxScore(state));
}

function giveClue(
  draft: MutableEngineState,
  player: MutablePlayer,
  action: PlayerAction,
) {
  const state = draft;
  const touched = touchedOrders(state, action);
  state.actions.push({
    type: action.type,
    target: action.target,
    value: action.value,
  });
  state.clueTokens -= clueCost(state);
  state.lastClueTypeGiven = action.type - 2;
  for (const order of touched) {
    at(state.deck, order).touched = true;
  }
  state.events.push({
    type: "clue",
    clue: { type: action.type === 2 ? 0 : 1, value: action.value },
    giver: player.index,
    target: action.target,
    list: touched,
    turn: state.turn,
  });
  characterPostClue(state, player, action, touched);
  if (state.options.cardCycle && player.hand.length > 1) {
    const chop = player.hand.findIndex(
      (order) => !at(state.deck, order).touched,
    );
    if (chop !== -1 && chop !== player.hand.length - 1) {
      const order = at(player.hand, chop);
      player.hand.splice(chop, 1);
      player.hand.push(order);
    }
  }
}

function checkEnd(draft: MutableEngineState): boolean {
  const state = draft;
  if (
    state.endCondition === EndCondition.Timeout
    || state.endCondition === EndCondition.TerminatedByPlayer
    || state.endCondition === EndCondition.TerminatedByVote
    || state.endCondition === EndCondition.IdleTimeout
    || state.endCondition === EndCondition.CharacterSoftlock
  ) {
    return true;
  }
  const variant = variantFor(state);
  if (state.strikes === 3) {
    state.endCondition = EndCondition.Strikeout;
  } else if (state.options.speedrun && state.maxScore < variant.maxScore) {
    state.endCondition = EndCondition.SpeedrunFail;
  } else if (state.options.allOrNothing && state.maxScore < variant.maxScore) {
    state.endCondition = EndCondition.AllOrNothingFail;
  } else if (
    state.options.allOrNothing
    && at(state.players, state.activePlayerIndex).hand.length === 0
    && state.clueTokens < clueCost(state)
  ) {
    state.endCondition = EndCondition.AllOrNothingSoftlock;
    state.endPlayer = state.activePlayerIndex;
  } else if (
    state.turn === state.endTurn
    || state.score === state.maxScore
    || !hasRemainingPlay(state)
  ) {
    state.endCondition = EndCondition.Normal;
  } else {
    return false;
  }
  return true;
}

function finishAction(
  draft: MutableEngineState,
  player: MutablePlayer,
  action: RecordedAction,
  timing: CompletionTiming | undefined,
  votes: readonly number[] | undefined,
) {
  const state = draft;
  characterPostAction(state, player, action);
  state.events.push({
    type: "status",
    clues: state.clueTokens,
    score: state.score,
    maxScore: state.maxScore,
  });
  if (hasTakenLastTurn(state)) {
    for (const order of player.hand) {
      at(state.deck, order).cannotBePlayed = true;
    }
  }
  if (!needsSecondAction(state, player, action)) {
    state.turn++;
    state.activePlayerIndex =
      (state.activePlayerIndex
        + state.players.length
        + (state.turnsInverted ? -1 : 1))
      % state.players.length;
  }
  checkCharacterSoftlock(state);
  const gameOver = checkEnd(state);
  const ended = state.endCondition !== EndCondition.InProgress;
  if (gameOver) {
    state.events.push({
      type: "gameOver",
      endCondition: state.endCondition,
      playerIndex: state.endPlayer,
      // Go's wire action distinguishes absent votes as JSON null.
      // eslint-disable-next-line unicorn/no-null
      votes: votes === undefined ? null : [...votes],
    });
  }
  state.events.push({
    type: "turn",
    num: state.turn,
    currentPlayerIndex: ended ? -1 : state.activePlayerIndex,
  });
  if (ended) {
    if (state.endCondition > EndCondition.Normal) {
      state.score = 0;
    }
    if (timing !== undefined && state.interpretation === "live") {
      state.events.push({
        type: "playerTimes",
        playerTimes: [...timing.playerTimes],
        duration: timing.duration,
      });
    }
  }
}

function validateTiming(
  state: EngineState,
  timing: CompletionTiming | undefined,
) {
  if (
    timing !== undefined
    && (timing.playerTimes.length !== state.players.length
      || !Number.isSafeInteger(timing.duration)
      || timing.duration < 0
      || !timing.playerTimes.every(Number.isSafeInteger))
  ) {
    throw new RangeError("Invalid completion timing.");
  }
}

export function applyAction(
  previous: EngineState,
  actorIndex: number,
  action: PlayerAction,
  timing?: CompletionTiming,
): Transition {
  validateAction(previous, actorIndex, action);
  validateTiming(previous, timing);
  const state = copyState(previous);
  const player = at(state.players, actorIndex);
  if (action.type === 2 || action.type === 3) {
    giveClue(state, player, action);
  } else {
    const deckMove =
      state.options.deckPlays
      && state.deckIndex === state.deck.length - 1
      && action.target === state.deckIndex;
    const identity = at(state.deck, action.target);
    const inverted =
      state.interpretation === "live"
      && at(variantFor(state).suits, identity.suitIndex).inverted;
    const isPlay = inverted ? action.type === 1 : action.type === 0;
    if (!isPlay && state.clueTokens < 8 * clueCost(state)) {
      state.clueTokens++;
    }
    if (deckMove) {
      drawCard(state, player);
    }
    const card = removeCard(state, player, action.target);
    if (deckMove) {
      card.slot = -1;
    }
    if (isPlay) {
      play(state, player, card);
    } else {
      discard(state, player, card);
    }
    if (!deckMove) {
      drawCard(state, player);
    }
  }
  state.startedTimer = true;
  finishAction(state, player, action, timing, undefined);
  return { state, events: state.events.slice(previous.events.length) };
}

/** Trusted server operation; never dispatch this from a player action payload. */
export function terminateGame(
  previous: EngineState,
  termination: Termination,
  timing?: CompletionTiming,
): Transition {
  checkOngoing(previous);
  validateTiming(previous, timing);
  if (
    !Number.isSafeInteger(termination.actorIndex)
    || termination.actorIndex < 0
    || termination.actorIndex >= previous.players.length
  ) {
    throw new ActionRejected("You are not playing in this game.");
  }
  if (
    ![
      EndCondition.AllOrNothingFail,
      EndCondition.IdleTimeout,
      EndCondition.TerminatedByPlayer,
      EndCondition.TerminatedByVote,
      EndCondition.Timeout,
    ].includes(termination.condition)
  ) {
    throw new ActionRejected(
      "That is not a valid value for the end game action.",
    );
  }
  if (
    !Number.isSafeInteger(termination.playerIndex)
    || termination.playerIndex < -1
    || termination.playerIndex >= previous.players.length
    || (termination.condition === EndCondition.Timeout
      && termination.playerIndex === -1)
  ) {
    throw new ActionRejected("That is not a valid player for a timeout.");
  }
  const state = copyState(previous);
  state.endCondition = termination.condition;
  state.endPlayer = termination.playerIndex;
  const action: RecordedAction = {
    type: termination.condition === EndCondition.TerminatedByVote ? 5 : 4,
    target:
      termination.condition === EndCondition.TerminatedByVote
      || termination.condition === EndCondition.IdleTimeout
        ? -1
        : termination.playerIndex,
    value: termination.condition,
  };
  if (termination.condition !== EndCondition.AllOrNothingFail) {
    state.actions.push(action);
  }
  const player = at(state.players, termination.actorIndex);
  const completionTiming =
    timing !== undefined && termination.condition === EndCondition.Timeout
      ? {
          ...timing,
          playerTimes: timing.playerTimes.map((remaining, index) =>
            index === termination.playerIndex ? 0 : remaining,
          ),
        }
      : timing;
  finishAction(state, player, action, completionTiming, termination.votes);
  return { state, events: state.events.slice(previous.events.length) };
}
