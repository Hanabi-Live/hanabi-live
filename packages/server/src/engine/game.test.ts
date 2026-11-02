import {
  DEFAULT_PLAYER_NAMES,
  EndCondition,
  getVariant,
  options,
  rank,
  suitIndex,
  VALID_NUM_PLAYERS,
  VARIANT_NAMES,
} from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { isArray } from "complete-common";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { applyAction, createGame, terminateGame } from "./game";
import { at } from "./rules";
import { createShuffledDeck } from "./setup";
import type { EngineState } from "./types";
import { ActionRejected, parseEngineState } from "./types";
import type { Recipient } from "./visibility";
import { eventsForRecipient } from "./visibility";

const cardIdentity = z.object({ suitIndex, rank });
const commandSchema = z.object({
  label: z.string(),
  player: z.number(),
  type: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  target: z.number(),
  value: z.number(),
  source: z.string().optional(),
  want: z.enum(["accepted", "rejected", "restored", "reconnect", "duplicate"]),
});
const mutableCard = z.object({
  Order: z.number(),
  Slot: z.number().default(0),
  Touched: z.boolean().default(false),
  Discarded: z.boolean().default(false),
  Played: z.boolean().default(false),
  Failed: z.boolean().default(false),
  CannotBePlayed: z.boolean().default(false),
  InsistentTouched: z.boolean().default(false),
});
const recordedAction = z.object({
  type: z.number(),
  target: z.number(),
  value: z.number(),
});
const playerState = z.object({
  Name: z.string(),
  Index: z.number(),
  Hand: z.array(z.number()),
  Character: z.string(),
  CharacterMetadata: z.number(),
});
const authorityState = z.object({
  Players: z.array(playerState),
  Cards: z.array(mutableCard),
  Actions2: z.array(recordedAction),
  Seed: z.string(),
  DeckIndex: z.number(),
  Stacks: z.array(z.number()),
  StackStarts: z.array(z.number()),
  PlayStackDirections: z.array(z.number()),
  Turn: z.number(),
  TurnsInverted: z.boolean(),
  ActivePlayerIndex: z.number(),
  ClueTokens: z.number(),
  Score: z.number(),
  MaxScore: z.number(),
  Strikes: z.number(),
  LastClueTypeGiven: z.number(),
  EndCondition: z.number(),
  EndPlayer: z.number(),
  EndTurn: z.number(),
  StartedTimer: z.boolean(),
  Paused: z.boolean(),
});
const actionData = z.object({ action: z.unknown() });
const listData = z.object({ list: z.array(z.unknown()) });
const warningData = z.object({ warning: z.string() });
const frame = z.discriminatedUnion("command", [
  z.object({ command: z.literal("gameAction"), data: actionData }),
  z.object({ command: z.literal("gameActionList"), data: listData }),
  z.object({ command: z.literal("warning"), data: warningData }),
  z.object({ command: z.literal("noteList"), data: z.unknown() }),
  z.object({ command: z.literal("noteListPlayer"), data: z.unknown() }),
]);
const point = z.object({
  state: authorityState,
  events: z.array(z.unknown()),
  recipients: z.array(z.array(frame)),
});
const swapSchema = z.object({ order: z.number(), suit: suitIndex, rank });
const characterSchema = z.object({ name: z.string(), metadata: z.number() });
const inputSchema = z.object({
  name: z.string(),
  seed: z.string(),
  options: options.unwrap().strip(),
  swaps: z.array(swapSchema).nullable(),
  deck: z.array(cardIdentity).nullable(),
  characters: z.array(characterSchema).nullable(),
  commands: z.array(commandSchema),
});
const fixtureSchema = z.object({
  input: inputSchema,
  deck: z.array(cardIdentity),
  initial: point,
  steps: z.array(point),
});
const corpusDirectory = path.resolve(
  __dirname,
  "../../../../server/src/testdata/compatibility",
);
const fixtures = readdirSync(corpusDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => {
    const text = readFileSync(path.join(corpusDirectory, name), "utf8");
    const raw: unknown = JSON.parse(text);
    return fixtureSchema.parse(raw);
  });

const digestPoint = z.object({
  state: z.string(),
  events: z.string(),
  visibility: z.array(z.string()),
});
const playerActionSchema = z.object({
  type: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  target: z.number(),
  value: z.number(),
});
const digestStep = z.object({
  action: playerActionSchema,
  accepted: z.boolean(),
  result: digestPoint,
});
const traceSchema = z.object({
  name: z.string(),
  options: options.unwrap().strip(),
  seed: z.string(),
  characters: z.array(characterSchema).nullable(),
  initial: digestPoint,
  steps: z.array(digestStep),
  deck: z.array(cardIdentity).optional(),
  live: z.boolean().default(false),
});

function readTraces(): ReadonlyArray<z.infer<typeof traceSchema>> {
  const filename = path.resolve(corpusDirectory, "../engine_authority.json");
  const raw: unknown = JSON.parse(readFileSync(filename, "utf8"));
  return z.array(traceSchema).parse(raw);
}

function checkpointRoundTrip(state: EngineState): EngineState {
  const serialized = JSON.stringify(state);
  const raw: unknown = JSON.parse(serialized);
  return parseEngineState(raw);
}

function digest(value: unknown): string {
  const json = JSON.stringify(value, (_key, nested: unknown): unknown => {
    if (nested !== null && typeof nested === "object" && !isArray(nested)) {
      const object = z.record(z.string(), z.unknown()).parse(nested);
      return Object.fromEntries(
        Object.entries(object).toSorted(([first], [second]) =>
          first < second ? -1 : Number(first > second),
        ),
      );
    }
    return nested;
  });
  return createHash("sha256").update(json).digest("hex");
}

function snapshot(state: EngineState): z.infer<typeof authorityState> {
  return {
    Players: state.players.map((player) => ({
      Name: player.name,
      Index: player.index,
      Hand: [...player.hand],
      Character: player.character,
      CharacterMetadata: player.characterMetadata,
    })),
    Cards: state.deck
      .filter(
        (card) =>
          card.slot !== 0
          || card.touched
          || card.discarded
          || card.played
          || card.failed
          || card.cannotBePlayed
          || card.insistentTouched,
      )
      .map((card) => ({
        Order: card.order,
        Slot: card.slot,
        Touched: card.touched,
        Discarded: card.discarded,
        Played: card.played,
        Failed: card.failed,
        CannotBePlayed: card.cannotBePlayed,
        InsistentTouched: card.insistentTouched,
      })),
    Actions2: state.actions.map((action) => ({ ...action })),
    Seed: state.seed,
    DeckIndex: state.deckIndex,
    Stacks: [...state.stacks],
    StackStarts: [...state.stackStarts],
    PlayStackDirections: [...state.playStackDirections],
    Turn: state.turn,
    TurnsInverted: state.turnsInverted,
    ActivePlayerIndex: state.activePlayerIndex,
    ClueTokens: state.clueTokens,
    Score: state.score,
    MaxScore: state.maxScore,
    Strikes: state.strikes,
    LastClueTypeGiven: state.lastClueTypeGiven,
    EndCondition: state.endCondition,
    EndPlayer: state.endPlayer,
    EndTurn: state.endTurn,
    StartedTimer: state.startedTimer,
    Paused: state.paused,
  };
}

const recipients: readonly Recipient[] = [
  { kind: "player", playerIndex: 0 },
  { kind: "player", playerIndex: 1 },
  { kind: "spectator" },
  { kind: "spectator", shadowingPlayerIndex: 0 },
];

function checkRecipients(
  state: EngineState,
  expected: z.infer<typeof point>,
  events: ReturnType<typeof eventsForRecipient>,
) {
  for (const [index, recipient] of recipients.entries()) {
    const messages = at(expected.recipients, index);
    const individual = messages.flatMap((message) =>
      message.command === "gameAction" ? [message.data.action] : [],
    );
    if (individual.length > 0) {
      expect(eventsForRecipient(state, recipient, events)).toEqual(individual);
    }
    for (const message of messages) {
      if (message.command === "gameActionList") {
        expect(
          eventsForRecipient(
            state,
            state.endCondition === EndCondition.InProgress
              ? recipient
              : { kind: "spectator" },
          ),
        ).toEqual(message.data.list);
      }
    }
  }
}

describe("TypeScript authority against all Go compatibility scenarios", () => {
  test.each(fixtures)("$input.name", (fixture) => {
    const { input } = fixture;
    const deck = input.deck ?? [
      ...createShuffledDeck(getVariant(input.options.variantName), input.seed),
    ];
    if (input.swaps !== null) {
      for (const swap of input.swaps) {
        const other = deck.findIndex(
          (card, index) =>
            index >= swap.order
            && card.suitIndex === swap.suit
            && card.rank === swap.rank,
        );
        expect(other).toBeGreaterThanOrEqual(0);
        const card = at(deck, swap.order);
        deck[swap.order] = at(deck, other);
        deck[other] = card;
      }
    }
    expect(deck).toEqual(fixture.deck);
    let transition = createGame({
      options: input.options,
      playerNames: fixture.initial.state.Players.map((player) => player.Name),
      seed: input.seed,
      deck,
      ...(input.characters !== null && { characters: input.characters }),
    });
    expect(snapshot(transition.state)).toEqual(fixture.initial.state);
    expect(transition.events).toEqual(fixture.initial.events);
    checkRecipients(transition.state, fixture.initial, transition.events);
    for (const [index, command] of input.commands.entries()) {
      const checkpoint = at(fixture.steps, index);
      const before = transition.state;
      const serialized = JSON.stringify(before);
      if (command.want === "rejected") {
        if (command.type === 4) {
          throw new Error("Unexpected client termination in corpus.");
        }
        const action = {
          type: command.type,
          target: command.target,
          value: command.value,
        };
        expect(() => applyAction(before, command.player, action)).toThrow(
          ActionRejected,
        );
        for (const message of at(checkpoint.recipients, command.player)) {
          if (message.command === "warning") {
            expect(() => applyAction(before, command.player, action)).toThrow(
              message.data.warning,
            );
          }
        }
        expect(JSON.stringify(before)).toBe(serialized);
        expect(checkpoint.events).toEqual([]);
      } else if (command.want === "accepted") {
        const timing = { playerTimes: [0, 0], duration: 0 };
        transition =
          command.type === 4
            ? terminateGame(
                before,
                {
                  condition: EndCondition.Timeout,
                  playerIndex: command.target,
                  actorIndex: command.player,
                },
                timing,
              )
            : applyAction(
                before,
                command.player,
                { ...command, type: command.type },
                timing,
              );
        expect(JSON.stringify(before)).toBe(serialized);
        expect(transition.events).toEqual(checkpoint.events);
        checkRecipients(transition.state, checkpoint, transition.events);
      } else {
        // Request deduplication and recovery belong to the transport. Verify their unchanged rule
        // state.
        expect(checkpoint.events).toEqual([]);
        checkRecipients(before, checkpoint, []);
      }
      expect(snapshot(transition.state)).toEqual(checkpoint.state);
    }
    expect(checkpointRoundTrip(transition.state)).toEqual(transition.state);
  });
});

describe("Go-generated character and modifier traces", () => {
  test.each(readTraces())("$name", (trace) => {
    let transition = createGame({
      options: trace.options,
      playerNames: ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"].slice(
        0,
        trace.options.numPlayers,
      ),
      seed: trace.seed,
      interpretation: trace.live ? "live" : "legacy-replay",
      ...(trace.characters !== null && { characters: trace.characters }),
      ...(trace.deck !== undefined && { deck: trace.deck }),
    });
    expect(digest(snapshot(transition.state))).toBe(trace.initial.state);
    expect(digest(transition.events)).toBe(trace.initial.events);
    expect(
      recipients.map((recipient) =>
        digest(
          eventsForRecipient(transition.state, recipient, transition.events),
        ),
      ),
    ).toEqual(trace.initial.visibility);
    for (const [index, step] of trace.steps.entries()) {
      const previous = transition.state;
      const before = JSON.stringify(previous);
      if (step.accepted) {
        transition = applyAction(
          previous,
          previous.activePlayerIndex,
          step.action,
        );
      } else {
        expect(() =>
          applyAction(previous, previous.activePlayerIndex, step.action),
        ).toThrow(ActionRejected);
        transition = { state: previous, events: [] };
      }
      expect(JSON.stringify(previous)).toBe(before);
      const current = transition;
      expect({
        index,
        state: digest(snapshot(current.state)),
        events: digest(current.events),
        visibility: recipients.map((recipient) =>
          digest(eventsForRecipient(current.state, recipient, current.events)),
        ),
      }).toEqual({ index, ...step.result });
    }
    expect(checkpointRoundTrip(transition.state)).toEqual(transition.state);
  });
});

describe("checkpoint coverage of the entire variant catalog", () => {
  test.each(VARIANT_NAMES)(
    "restores every supported player/hand size in %s",
    (variantName) => {
      const variant = getVariant(variantName);
      for (const count of VALID_NUM_PLAYERS) {
        const seed = `p${count}v${variant.id}s1`;
        const deck = createShuffledDeck(variant, seed);
        const playerNames = DEFAULT_PLAYER_NAMES.slice(0, count);
        for (const handSizeOptions of [
          {},
          { oneExtraCard: true },
          { oneLessCard: true },
        ]) {
          const { state } = createGame({
            options: options.parse({
              variantName,
              numPlayers: count,
              startingPlayer: count - 1,
              detrimentalCharacters: true,
              ...handSizeOptions,
            }),
            seed,
            deck,
            playerNames,
            // Slow-Witted maximizes the initial event count by revealing every second slot.
            characters: playerNames.map((_, index) => ({
              name: index === 0 ? "Slow-Witted" : "n/a",
              metadata: -1,
            })),
          });
          expect(isDeepStrictEqual(checkpointRoundTrip(state), state)).toBe(
            true,
          );
        }
      }
    },
  );
});
