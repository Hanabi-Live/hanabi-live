import { EndCondition, getVariant, options } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { z } from "zod";
import { applyAction, createGame, terminateGame, validateAction } from "./game";
import { at } from "./rules";
import { createShuffledDeck } from "./setup";
import type { EngineState, PlayerAction } from "./types";
import { ActionRejected, parseEngineState } from "./types";
import { eventsForRecipient } from "./visibility";

function standard(): EngineState {
  return createGame({
    options: options.parse({}),
    seed: "p2v0s1",
    playerNames: ["Alice", "Bob"],
  }).state;
}

function resourcePotential(state: EngineState): number {
  const remaining = state.deck.filter(
    (card) => !card.played && !card.discarded,
  ).length;
  const cost = getVariant(state.options.variantName).clueStarved ? 2 : 1;
  return 2 * remaining + state.clueTokens / cost;
}

function firstAcceptedAction(
  state: EngineState,
  candidates: readonly PlayerAction[],
  preferPerfect: boolean,
): EngineState {
  let losingMove: EngineState | undefined;
  for (const action of candidates) {
    try {
      const { state: next } = applyAction(
        state,
        state.activePlayerIndex,
        action,
        { playerTimes: state.players.map(() => 0), duration: 0 },
      );
      if (
        preferPerfect
        && (next.strikes !== state.strikes
          || next.maxScore !== getVariant(state.options.variantName).maxScore)
      ) {
        losingMove ??= next;
        continue;
      }
      return next;
    } catch (error) {
      if (!(error instanceof ActionRejected)) {
        throw error;
      }
    }
  }
  // An exhausted hand can force a losing move; it cannot invent a free pass.
  if (losingMove !== undefined) {
    return losingMove;
  }
  throw new Error(`No legal resource-consuming action at turn ${state.turn}.`);
}

describe("authoritative action boundary", () => {
  test("rejects a negative starting player before dealing", () => {
    expect(() =>
      createGame({
        // @ts-expect-error Reject malformed untyped setup rather than creating an invalid turn.
        options: { ...options.parse({}), startingPlayer: -1 },
        playerNames: ["Alice", "Bob"],
        seed: "p2v0s1",
      }),
    ).toThrow();
  });
  test("rejects untyped client termination and malformed numeric actions atomically", () => {
    const state = standard();
    const before = JSON.stringify(state);
    for (const type of [4, 5, -1, 0.5]) {
      expect(() =>
        // @ts-expect-error Untyped clients must not impersonate trusted server operations.
        applyAction(state, 0, { type, target: 0, value: EndCondition.Timeout }),
      ).toThrow(ActionRejected);
    }
    for (const value of [NaN, Infinity, 0.5]) {
      expect(() =>
        applyAction(state, 0, { type: 0, target: value, value: 0 }),
      ).toThrow(ActionRejected);
      expect(() =>
        applyAction(state, 0, { type: 2, target: 1, value }),
      ).toThrow(ActionRejected);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  test("does not mutate the source state, setup, or client command on success", () => {
    const state = standard();
    const before = JSON.stringify(state);
    const action = Object.freeze({ type: 3, target: 1, value: 1 } as const);
    validateAction(state, 0, action);
    expect(JSON.stringify(state)).toBe(before);
    const result = applyAction(state, 0, action);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.state.players[0]).not.toBe(state.players[0]);
    expect(result.state.deck[0]).not.toBe(state.deck[0]);
    expect(result.state.actions).toEqual([{ type: 3, target: 1, value: 1 }]);
  });

  test("paused and finished games reject ordinary actions without changing history", () => {
    const state = standard();
    expect(() =>
      applyAction({ ...state, paused: true }, 0, {
        type: 0,
        target: 0,
        value: 0,
      }),
    ).toThrow("when the game is paused");
    const ended = terminateGame(state, {
      actorIndex: 1,
      playerIndex: 1,
      condition: EndCondition.TerminatedByPlayer,
    }).state;
    expect(() =>
      applyAction(ended, 0, { type: 0, target: 0, value: 0 }),
    ).toThrow("already ending");
    expect(ended.actions).toEqual([{ type: 4, target: 1, value: 4 }]);
  });

  test("termination applies the requesting character even when it is not their turn", () => {
    const { state } = createGame({
      options: options.parse({ detrimentalCharacters: true, numPlayers: 3 }),
      playerNames: ["Alice", "Bob", "Cathy"],
      seed: "p3v0s1",
      characters: [
        { name: "n/a", metadata: -1 },
        { name: "Contrarian", metadata: -1 },
        { name: "Stubborn", metadata: -1 },
      ],
    });
    const ended = terminateGame(state, {
      actorIndex: 1,
      playerIndex: 1,
      condition: EndCondition.TerminatedByPlayer,
    });
    expect(ended.state.turnsInverted).toBe(true);
    expect(ended.state.activePlayerIndex).toBe(2);
    expect(at(ended.state.players, 2).characterMetadata).toBe(4);
    expect(ended.events).toEqual([
      { type: "status", clues: 8, score: 0, maxScore: 25 },
      // eslint-disable-next-line unicorn/no-null
      { type: "gameOver", endCondition: 4, playerIndex: 1, votes: null },
      { type: "turn", num: 1, currentPlayerIndex: -1 },
    ]);
  });

  test("trusted completion timing is explicit and does not become game state", () => {
    const state = standard();
    const timing = { playerTimes: [1234, -1234], duration: 5678 };
    const ended = terminateGame(
      state,
      {
        actorIndex: 0,
        playerIndex: 0,
        condition: EndCondition.Timeout,
      },
      timing,
    );
    expect(ended.events.at(-1)).toEqual({
      type: "playerTimes",
      playerTimes: [0, -1234],
      duration: 5678,
    });
    expect(ended.state.score).toBe(0);
    expect(() =>
      terminateGame(state, {
        actorIndex: 0,
        playerIndex: -1,
        condition: EndCondition.Timeout,
      }),
    ).toThrow("not a valid player for a timeout");
    expect(() =>
      terminateGame(
        state,
        {
          actorIndex: 0,
          playerIndex: 0,
          condition: EndCondition.Timeout,
        },
        { playerTimes: [0], duration: 0 },
      ),
    ).toThrow("Invalid completion timing");
  });

  test("legacy imported card identities are not restricted to the variant's generated ranks", () => {
    const generated = standard();
    const custom = createGame({
      options: generated.options,
      playerNames: generated.players.map((player) => player.name),
      seed: "JSON",
      deck: generated.deck.map((card, index) =>
        index === 0 ? { suitIndex: card.suitIndex, rank: 7 } : card,
      ),
    }).state;
    const result = applyAction(custom, 0, { type: 0, target: 0, value: 0 });
    expect(result.state.strikes).toBe(1);
    expect(result.events[0]).toEqual({
      type: "strike",
      num: 1,
      turn: 0,
      order: 0,
    });
  });
});

describe("recipient projections", () => {
  test("Slow-Witted draws stay hidden in history but slot-two identities are revealed", () => {
    const { state } = createGame({
      options: options.parse({ detrimentalCharacters: true }),
      playerNames: ["Alice", "Bob"],
      seed: "p2v0s1",
      characters: [
        { name: "Slow-Witted", metadata: -1 },
        { name: "n/a", metadata: -1 },
      ],
    });
    const visible = eventsForRecipient(state, {
      kind: "player",
      playerIndex: 0,
    });
    const draws = visible.filter((event) => event.type === "draw");
    const identities = visible.filter((event) => event.type === "cardIdentity");
    expect(draws).toHaveLength(10);
    expect(
      draws.every((event) => event.rank === -1 && event.suitIndex === -1),
    ).toBe(true);
    expect(
      identities
        .filter((event) => event.playerIndex === 1)
        .map((event) => event.order),
    ).toEqual([5, 6, 7, 8]);
    expect(
      identities
        .filter((event) => event.playerIndex === 1)
        .every((event) => event.rank !== -1),
    ).toBe(true);
    expect(
      identities
        .filter((event) => event.playerIndex === 0)
        .every((event) => event.rank === -1),
    ).toBe(true);
    expect(
      eventsForRecipient(state, { kind: "spectator", shadowingPlayerIndex: 0 }),
    ).toEqual(visible);
  });

  test("a clue touching only an unseen slot-one card is rejected", () => {
    const { state } = createGame({
      options: options.parse({ detrimentalCharacters: true }),
      playerNames: ["Alice", "Bob"],
      seed: "p2v0s1",
      characters: [
        { name: "Slow-Witted", metadata: -1 },
        { name: "n/a", metadata: -1 },
      ],
    });
    // The independently frozen legacy deal has Bob's only rank four in slot one.
    const newest = at(at(state.players, 1).hand, 4);
    expect(at(state.deck, newest).rank).toBe(4);
    expect(() =>
      applyAction(state, 0, { type: 3, target: 1, value: 4 }),
    ).toThrow("touches 0 cards");
    expect(
      applyAction(state, 0, { type: 3, target: 1, value: 1 }).state.clueTokens,
    ).toBe(7);
  });

  test("invalid shadow seats are omniscient but invalid player seats are rejected", () => {
    const state = standard();
    expect(
      eventsForRecipient(state, {
        kind: "spectator",
        shadowingPlayerIndex: -1,
      }),
    ).toEqual(state.events);
    expect(() =>
      eventsForRecipient(state, { kind: "player", playerIndex: -1 }),
    ).toThrow("Invalid game recipient");
  });
});

describe("durable authoritative state decoding", () => {
  test("round-trips an owned snapshot and can continue a multi-action character turn", () => {
    const initial = createGame({
      options: options.parse({ detrimentalCharacters: true, cardCycle: true }),
      playerNames: ["Alice", "Bob"],
      seed: "p2v0s1",
      characters: [
        { name: "Genius", metadata: -1 },
        { name: "Slow-Witted", metadata: -1 },
      ],
    }).state;
    const { state } = applyAction(initial, 0, {
      type: 2,
      target: 1,
      value: 3,
    });
    const serialized = JSON.stringify(state);
    const raw: unknown = JSON.parse(serialized);
    const restored = parseEngineState(raw);
    const owned = parseEngineState(state);
    expect(restored).toEqual(state);
    expect(restored).not.toBe(raw);
    expect(restored.deck).not.toBe(state.deck);
    expect(restored.players[0]).not.toBe(state.players[0]);
    expect(owned.deck).not.toBe(state.deck);
    expect(owned.players[0]).not.toBe(state.players[0]);
    expect(owned.events).not.toBe(state.events);
    const action = { type: 3, target: 1, value: 1 } as const;
    expect(applyAction(restored, 0, action)).toEqual(
      applyAction(state, 0, action),
    );
    expect(JSON.stringify(raw)).toBe(serialized);
  });

  test("round-trips terminal timing and votes without synthesizing absent fields", () => {
    const { state } = terminateGame(
      standard(),
      {
        actorIndex: 1,
        condition: EndCondition.TerminatedByVote,
        playerIndex: -1,
        votes: [0, 1],
      },
      { playerTimes: [0, -1000], duration: 1234 },
    );
    const serialized = JSON.stringify(state);
    const raw: unknown = JSON.parse(serialized);
    expect(parseEngineState(raw)).toEqual(state);
    expect(() =>
      parseEngineState({ ...state, options: { numPlayers: 2 } }),
    ).toThrow(z.ZodError);
    expect(() =>
      parseEngineState({ ...state, startedTimer: undefined }),
    ).toThrow(z.ZodError);
  });

  const corruptions: ReadonlyArray<{
    readonly name: string;
    readonly corrupt: (state: EngineState) => unknown;
  }> = [
    {
      name: "unbounded final turn",
      corrupt: (state) => ({ ...state, endTurn: Number.MAX_SAFE_INTEGER }),
    },
    {
      name: "unbounded current turn",
      corrupt: (state) => ({ ...state, turn: Number.MAX_SAFE_INTEGER }),
    },
    {
      name: "variant-inconsistent stack starts",
      corrupt: (state) => ({ ...state, stackStarts: [1, 0, 0, 0, 0] }),
    },
    {
      name: "historically swapped hands",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({
          ...player,
          hand: at(state.players, 1 - player.index).hand,
        })),
      }),
    },
    {
      name: "game-over event in an ongoing game",
      corrupt: (state) => ({
        ...state,
        events: [
          ...state.events,
          { type: "gameOver", endCondition: 3, playerIndex: 0, votes: [] },
        ],
      }),
    },
    {
      name: "invalid timing player count",
      corrupt: (state) => ({
        ...state,
        events: [
          ...state.events,
          { type: "playerTimes", playerTimes: [0], duration: 0 },
        ],
      }),
    },
    {
      name: "unknown top-level field",
      corrupt: (state) => ({ ...state, privateToken: "unexpected" }),
    },
    {
      name: "option/player mismatch",
      corrupt: (state) => ({
        ...state,
        options: { ...state.options, numPlayers: 3 },
      }),
    },
    {
      name: "unknown variant",
      corrupt: (state) => ({
        ...state,
        options: { ...state.options, variantName: "missing" },
      }),
    },
    {
      name: "negative starting player",
      corrupt: (state) => ({
        ...state,
        options: { ...state.options, startingPlayer: -1 },
      }),
    },
    {
      name: "active seat beyond player count",
      corrupt: (state) => ({ ...state, activePlayerIndex: 2 }),
    },
    {
      name: "invalid end condition",
      corrupt: (state) => ({ ...state, endCondition: 99 }),
    },
    {
      name: "invalid ending player",
      corrupt: (state) => ({ ...state, endPlayer: 2 }),
    },
    {
      name: "draw cursor beyond the deck",
      corrupt: (state) => ({ ...state, deckIndex: state.deck.length + 1 }),
    },
    {
      name: "mismatched stack counts",
      corrupt: (state) => ({ ...state, stackStarts: [0] }),
    },
    {
      name: "invalid direction",
      corrupt: (state) => ({
        ...state,
        playStackDirections: state.playStackDirections.map(() => 4),
      }),
    },
    {
      name: "impossible maximum score",
      corrupt: (state) => ({ ...state, maxScore: 26 }),
    },
    {
      name: "fractional metadata",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({
          ...player,
          characterMetadata: 0.5,
        })),
      }),
    },
    {
      name: "duplicate player index",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({ ...player, index: 0 })),
      }),
    },
    {
      name: "reordered deck identities",
      corrupt: (state) => ({
        ...state,
        deck: state.deck.toReversed(),
      }),
    },
    {
      name: "out-of-variant suit",
      corrupt: (state) => ({
        ...state,
        deck: state.deck.map((card) => ({ ...card, suitIndex: 5 })),
      }),
    },
    {
      name: "duplicate card across hands",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({
          ...player,
          hand: at(state.players, 0).hand,
        })),
      }),
    },
    {
      name: "hand reference to a card not yet drawn",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({
          ...player,
          hand: [state.deckIndex],
        })),
      }),
    },
    {
      name: "discarded card in hand",
      corrupt: (state) => ({
        ...state,
        deck: state.deck.map((card, index) =>
          index === 0 ? { ...card, discarded: true } : card,
        ),
      }),
    },
    {
      name: "drawn card without a location",
      corrupt: (state) => ({
        ...state,
        players: state.players.map((player) => ({ ...player, hand: [] })),
      }),
    },
    {
      name: "malformed nested event",
      corrupt: (state) => ({
        ...state,
        events: [
          {
            type: "clue",
            giver: 0,
            target: 1,
            clue: { type: 0, value: "red" },
            list: [],
            turn: 0,
          },
        ],
      }),
    },
    {
      name: "scrubbed authoritative identity",
      corrupt: (state) => ({
        ...state,
        events: [
          { ...at(state.events, 0), rank: -1 },
          ...state.events.slice(1),
        ],
      }),
    },
    {
      name: "incorrect authoritative identity",
      corrupt: (state) => ({
        ...state,
        events: [
          { ...at(state.events, 0), suitIndex: 4 },
          ...state.events.slice(1),
        ],
      }),
    },
    {
      name: "invalid historical event player",
      corrupt: (state) => ({
        ...state,
        events: [
          { ...at(state.events, 0), playerIndex: 2 },
          ...state.events.slice(1),
        ],
      }),
    },
    {
      name: "missing draw history",
      corrupt: (state) => ({
        ...state,
        events: state.events.slice(1),
      }),
    },
    {
      name: "recorded card outside deck",
      corrupt: (state) => ({
        ...state,
        actions: [{ type: 0, target: 50, value: 0 }],
      }),
    },
    {
      name: "recorded clue outside variant",
      corrupt: (state) => ({
        ...state,
        actions: [{ type: 2, target: 1, value: 5 }],
      }),
    },
    {
      name: "invalid recorded termination",
      corrupt: (state) => ({
        ...state,
        actions: [{ type: 4, target: 0, value: 2 }],
      }),
    },
  ];
  test.each(corruptions)("rejects $name", ({ corrupt }) => {
    const state = standard();
    const before = JSON.stringify(state);
    expect(() => parseEngineState(corrupt(state))).toThrow(z.ZodError);
    expect(JSON.stringify(state)).toBe(before);
  });

  test("rejects oversized collections before decoding their elements", () => {
    const state = standard();
    const events = Array.from({ length: 4097 }, () => ({
      get type(): never {
        throw new Error("Oversized history must not be traversed.");
      },
    }));
    expect(() => parseEngineState({ ...state, events })).toThrow(
      "at most 4096",
    );
    expect(() =>
      parseEngineState({ ...state, actions: Array.from({ length: 513 }) }),
    ).toThrow("at most 512");
    expect(() =>
      parseEngineState({ ...state, deck: Array.from({ length: 61 }) }),
    ).toThrow("at most 60");
  });
});

describe("bounded histories without progress", () => {
  test.each([
    { variantName: "6 Suits", partner: "Panicky" },
    { variantName: "Up or Down (6 Suits)", partner: "Slow-Witted" },
    { variantName: "Reversed (6 Suits)", partner: "Panicky" },
    { variantName: "Throw It in a Hole (6 Suits)", partner: "Panicky" },
    { variantName: "Clue Starved (6 Suits)", partner: "Slow-Witted" },
  ])(
    "restores long $variantName / Genius + $partner games",
    ({ variantName, partner }) => {
      const variant = getVariant(variantName);
      const deck = [...createShuffledDeck(variant, "p2v0s1")];
      const first = deck.findIndex(
        (card) =>
          card.rank === (at(variant.suits, card.suitIndex).reversed ? 5 : 1),
      );
      const original = at(deck, 0);
      deck[0] = at(deck, first);
      deck[first] = original;
      let { state } = createGame({
        options: options.parse({
          variantName,
          emptyClues: true,
          cardCycle: true,
          detrimentalCharacters: true,
        }),
        seed: "JSON",
        deck,
        playerNames: ["Alice", "Bob"],
        characters: [
          { name: "Genius", metadata: -1 },
          { name: partner, metadata: -1 },
        ],
      });
      for (
        let count = 0;
        count < 129 && state.endCondition === EndCondition.InProgress;
        count++
      ) {
        const player = at(state.players, state.activePlayerIndex);
        const clues: readonly PlayerAction[] = [
          { type: 2, target: 1 - player.index, value: 0 },
          { type: 3, target: 1 - player.index, value: 1 },
        ];
        // Retain a playable card so zero-score games cannot end before exhausting the deck.
        const discards: readonly PlayerAction[] = player.hand
          .filter((order) => order !== 0)
          .map((order) => ({ type: 1, target: order, value: 0 }));
        const candidates =
          player.character === "Panicky"
            ? [...discards, ...clues]
            : [...clues, ...discards];
        const before = resourcePotential(state);
        state = parseEngineState(firstAcceptedAction(state, candidates, false));
        expect(resourcePotential(state)).toBeLessThanOrEqual(before - 1);
        expect(state.score).toBe(0);
      }
      expect(state.endCondition).toBe(EndCondition.Normal);
      expect(state.deckIndex).toBe(deck.length);
      expect(state.actions.length).toBeGreaterThan(60);
      expect(state.turn).toBeLessThan(state.actions.length);
      expect(state.actions.length).toBeLessThanOrEqual(2 * deck.length + 9);
      expect(state.events.length).toBeLessThanOrEqual(8 * deck.length + 31);
    },
  );

  test("All or Nothing cannot produce an unbounded accepted history after the last draw", () => {
    const variant = getVariant("6 Suits");
    const deck = createShuffledDeck(variant, "p2v0s1").toSorted(
      (first, second) =>
        first.rank === second.rank
          ? first.suitIndex - second.suitIndex
          : first.rank - second.rank,
    );
    let { state } = createGame({
      options: options.parse({
        variantName: variant.name,
        allOrNothing: true,
        emptyClues: true,
        oneExtraCard: true,
        detrimentalCharacters: true,
      }),
      seed: "JSON",
      deck,
      playerNames: ["Alice", "Bob"],
      characters: [
        { name: "Slow-Witted", metadata: -1 },
        { name: "n/a", metadata: -1 },
      ],
    });
    for (
      let count = 0;
      count < 129 && state.endCondition === EndCondition.InProgress;
      count++
    ) {
      const player = at(state.players, state.activePlayerIndex);
      const candidates: readonly PlayerAction[] = [
        { type: 2, target: 1 - player.index, value: 0 },
        ...player.hand.map((order): PlayerAction => ({
          type: 1,
          target: order,
          value: 0,
        })),
        ...player.hand.map((order): PlayerAction => ({
          type: 0,
          target: order,
          value: 0,
        })),
      ];
      const before = resourcePotential(state);
      state = parseEngineState(firstAcceptedAction(state, candidates, true));
      expect(resourcePotential(state)).toBeLessThanOrEqual(before - 1);
    }
    expect(state.endCondition).toBe(EndCondition.AllOrNothingFail);
    expect(state.deckIndex).toBe(deck.length);
    expect(state.endTurn).toBe(-1);
    expect(state.score).toBe(0);
    expect(state.actions.length).toBeGreaterThan(60);
    expect(state.actions.length).toBeLessThanOrEqual(2 * deck.length + 9);
    expect(state.events.length).toBeLessThanOrEqual(8 * deck.length + 31);
  });

  test("unlimited rejected attempts do not accumulate authoritative history; accepted misplays consume cards", () => {
    let state = standard();
    for (const order of [0, 5, 1]) {
      const current = state;
      const before = JSON.stringify(state);
      for (let attempt = 0; attempt < 1000; attempt++) {
        expect(() =>
          applyAction(current, current.activePlayerIndex, {
            type: 0,
            target: -1,
            value: 0,
          }),
        ).toThrow(ActionRejected);
      }
      expect(JSON.stringify(state)).toBe(before);
      const potential = resourcePotential(state);
      state = parseEngineState(
        applyAction(state, state.activePlayerIndex, {
          type: 0,
          target: order,
          value: 0,
        }).state,
      );
      expect(resourcePotential(state)).toBeLessThanOrEqual(potential - 1);
    }
    expect(state.endCondition).toBe(EndCondition.Strikeout);
    expect(state.actions).toHaveLength(3);
    expect(state.strikes).toBe(3);
  });
});
