// cspell:words quiescing checkpointed
import type {
  ClientCommandData,
  GameHistory,
  GameID,
  TableID,
  UserID,
} from "@hanabi-live/data";
import { PROJECT_NAME, ServerCommand, Status } from "@hanabi-live/data";
import { EndCondition, getVariant, numPlayers } from "@hanabi-live/game";
import { assertDefined, escapeHTMLCharacters } from "complete-common";
import {
  applyAction,
  createGame,
  terminateGame,
  validateAction,
} from "./engine/game";
import { GoRandom, seedToInt64 } from "./engine/goRandom";
import { createShuffledDeck } from "./engine/setup";
import type { EngineEvent } from "./engine/types";
import { ActionRejected } from "./engine/types";
import {
  completionRecord,
  restoreGameCheckpoint,
  serializeGameCheckpoint,
} from "./gameCheckpoint";
import {
  appendBootstrap,
  appendClock,
  appendConnected,
  appendGameEvents,
  appendObserverNotes,
  appendReplayDetails,
  attendeeUsers,
  GameMessages,
} from "./gameNotifications";
import type { GameStore } from "./gameStore";
import type { Game } from "./interfaces/Game";
import type { Table } from "./interfaces/Table";
import { logger } from "./logger";
import { enqueueTableOperation } from "./tableQueue";
import {
  getTable,
  getTableIDsUserAttending,
  publishTable,
  rememberSpectating,
  removeTable,
} from "./tables";
import { sanitizeTag } from "./tagUtils";
import {
  getMaxConsecutiveMarks,
  normalizeString,
  trimUnicodeWhitespace,
  truncateToMaxBytes,
} from "./utils";
import { wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

const IDLE_TIMEOUT = 30 * 60 * 1000;
interface RuntimeDependencies {
  getBlockedSeeds: (users: readonly UserID[]) => Promise<ReadonlySet<string>>;
  getCompletionHistory?: (id: GameID) => Promise<readonly GameHistory[]>;
  now?: () => number;
}
interface TableTimer {
  version: number;
  timer: ReturnType<typeof setTimeout>;
}

let runtime: GameRuntime | undefined;

export function getGameRuntime(): GameRuntime | undefined {
  return runtime;
}

export async function initializeGameRuntime(
  store: GameStore,
  dependencies: RuntimeDependencies,
): Promise<GameRuntime> {
  if (runtime !== undefined) {
    throw new Error("Game runtime is already initialized.");
  }
  const instance = new GameRuntime(store, dependencies);
  await instance.restore();
  runtime = instance;
  return instance;
}

function isCurrent(user: WSUser) {
  return (
    wsUsers.get(user.userID) === user
    && user.connection.readyState === user.connection.OPEN
  );
}

function requireGame(table: Table): Game {
  const { game } = table;
  if (!table.running || game === undefined) {
    throw new ActionRejected("The game has not started yet.");
  }
  return game;
}

function playerIndex(table: Table, user: WSUser) {
  const index = table.players.findIndex(
    (player) => player.userID === user.userID,
  );
  if (index === -1) {
    throw new ActionRejected("You are not playing at this table.");
  }
  return index;
}

function liveGame(table: Table) {
  const game = requireGame(table);
  if (table.replay || game.state.endCondition !== EndCondition.InProgress) {
    throw new ActionRejected("The game is already ending or is a replay.");
  }
  return game;
}

/** Durable game mutations execute only inside the authoritative per-table queue. */
export class GameRuntime {
  private readonly store: GameStore;
  private readonly dependencies: RuntimeDependencies;
  private readonly now: () => number;
  private readonly tables = new Set<TableID>();
  private readonly attendees = new Map<TableID, Map<UserID, WSUser>>();
  private readonly timers = new Map<TableID, TableTimer>();
  private readonly notifications = new Set<Promise<void>>();
  private readonly checkpointed = new Set<TableID>();
  private timerVersion = 0;
  private closed = false;
  private closeComplete = false;
  private quiescing = false;
  private suspendedAt: number | undefined;

  constructor(store: GameStore, dependencies: RuntimeDependencies) {
    this.store = store;
    this.dependencies = dependencies;
    this.now = dependencies.now ?? (() => performance.now());
  }

  async restore(): Promise<void> {
    const rows = await this.store.load();
    const restored = rows.map((row) => restoreGameCheckpoint(row, this.now()));
    if (
      new Set(restored.map((table) => table.id)).size !== restored.length
      || restored.some((table) => getTable(table.id) !== undefined)
    ) {
      throw new Error("Conflicting restored table IDs.");
    }
    for (const table of restored) {
      const game = requireGame(table);
      if (game.state.endCondition === EndCondition.InProgress) {
        // eslint-disable-next-line no-await-in-loop
        if (await this.store.completed(game.databaseID)) {
          throw new Error("An ongoing checkpoint refers to a completed game.");
        }
      } else {
        // A terminal checkpoint is the retry record for an uncertain completion transaction.
        // eslint-disable-next-line no-await-in-loop
        await this.store.complete(completionRecord(table, game), game.revision);
        this.refreshStatistics(table, game);
      }
    }
    for (const table of restored) {
      const game = requireGame(table);
      if (game.state.endCondition === EndCondition.InProgress) {
        game.clockAnchor = this.now();
        publishTable(table);
        this.tables.add(table.id);
        this.attendees.set(table.id, new Map());
        this.arm(table);
      }
    }
  }

  /** Stop new game commands and timer callbacks before the operational layer drains sessions. */
  quiesce(): void {
    this.suspendedAt ??= this.now();
    this.quiescing = true;
    for (const id of this.tables) {
      this.cancel(id);
    }
  }

  /** Never overwrite frozen memory; settle its uncertain writes before allowing restart. */
  async checkpointAndDrain(): Promise<void> {
    this.quiesce();
    const outcomes = await Promise.allSettled(
      [...this.tables].map(async (id) => {
        const admitted = await enqueueTableOperation(id, async () => {
          const table = getTable(id);
          if (
            table === undefined
            || table.replay
            || table.recoveryBlocked === true
            || !table.running
            || this.checkpointed.has(id)
          ) {
            return;
          }
          const { candidate, game } = this.copy(table);
          const messages = new GameMessages();
          if (
            table.options.timed
            && game.state.endCondition === EndCondition.InProgress
          ) {
            game.clocks = game.clocks.map((remaining) => remaining + 20_000);
            appendClock(
              messages,
              candidate,
              game,
              attendeeUsers(table, this.attendance(table)),
            );
          }
          await this.commit(table, candidate, messages, () => {
            this.checkpointed.add(id);
          });
          if (getTable(id)?.recoveryBlocked === true) {
            throw new Error(`Table ${id} could not be checkpointed safely.`);
          }
        });
        if (!admitted) {
          throw new Error(
            `Table ${id} queue is full; retry the drain without resuming.`,
          );
        }
      }),
    );
    await this.store.drain();
    await Promise.all(this.notifications);
    const failed = outcomes.find((outcome) => outcome.status === "rejected");
    if (failed !== undefined) {
      throw new Error(
        "Some tables could not be checkpointed; retry the drain.",
        { cause: failed.reason },
      );
    }
  }

  resume(): void {
    if (this.closed) {
      throw new Error("Cannot resume a closed game runtime.");
    }
    for (const id of this.tables) {
      const table = getTable(id);
      if (table?.game !== undefined && table.recoveryBlocked !== true) {
        const { game } = this.copy(table);
        game.clockAnchor = this.now();
        table.game = game;
      }
    }
    this.quiescing = false;
    this.suspendedAt = undefined;
    this.checkpointed.clear();
    for (const id of this.tables) {
      const table = getTable(id);
      if (table?.game !== undefined && table.recoveryBlocked !== true) {
        table.game.clockAnchor = this.now();
        this.arm(table);
        const messages = new GameMessages();
        appendClock(
          messages,
          table,
          table.game,
          attendeeUsers(table, this.attendance(table)),
        );
        messages.publish();
      }
    }
  }

  /** Close only after checkpointAndDrain succeeds, or when deliberately simulating a crash. */
  async close(): Promise<void> {
    if (this.closeComplete) {
      return;
    }
    this.closed = true;
    for (const id of this.tables) {
      this.cancel(id);
    }
    await Promise.all(this.notifications);
    await this.store.close();
    for (const id of this.tables) {
      removeTable(id);
    }
    this.tables.clear();
    this.closeComplete = true;
    if (runtime === this) {
      runtime = undefined;
    }
  }

  // The runtime owns this mutable session registry; callers are private table operations.
  // eslint-disable-next-line complete/no-mutable-return
  private attendance(table: Table): Map<UserID, WSUser> {
    const existing = this.attendees.get(table.id);
    if (existing !== undefined) {
      return existing;
    }
    const result = new Map<UserID, WSUser>();
    this.attendees.set(table.id, result);
    return result;
  }

  private activeUser(table: Table, user: WSUser) {
    if (this.attendance(table).get(user.userID) !== user) {
      throw new ActionRejected(
        "You must reattend this table from your current session.",
      );
    }
  }

  private async run(
    user: WSUser,
    id: TableID,
    operation: (table: Table) => void | Promise<void>,
  ) {
    const admitted = await enqueueTableOperation(id, async () => {
      if (!isCurrent(user) || this.closed) {
        return;
      }
      if (this.quiescing) {
        wsWarning(
          user.connection,
          "The server is saving games. Please try again shortly.",
        );
        return;
      }
      const table = getTable(id);
      if (table === undefined) {
        wsWarning(user.connection, `Table ${id} does not exist.`);
        return;
      }
      try {
        if (table.recoveryBlocked === true) {
          throw new ActionRejected(
            "This table is frozen because its durable state is uncertain.",
          );
        }
        await operation(table);
      } catch (error) {
        if (!(error instanceof ActionRejected)) {
          throw error;
        }
        if (!error.silent) {
          wsWarning(user.connection, error.message);
        }
      }
    });
    if (!admitted && isCurrent(user)) {
      wsWarning(
        user.connection,
        "Too many pending table commands. Please try again.",
      );
    }
  }

  private copy(table: Table) {
    const previous = requireGame(table);
    const elapsed = Math.max(
      0,
      Math.floor((this.suspendedAt ?? this.now()) - previous.clockAnchor),
    );
    const game: Game = {
      ...previous,
      clocks: [...previous.clocks],
      queuedPauses: [...previous.queuedPauses],
      notes: previous.notes.map((notes) => [...notes]),
      tags: previous.tags.map((entry) => ({ ...entry })),
      requests: previous.requests.map((entry) => ({ ...entry })),
      duration: previous.duration + elapsed,
      idleRemaining: Math.max(0, previous.idleRemaining - elapsed),
      clockAnchor: this.now(),
    };
    if (
      previous.state.startedTimer
      && !previous.state.paused
      && previous.state.endCondition === EndCondition.InProgress
    ) {
      const index = previous.state.activePlayerIndex;
      game.clocks[index] = (game.clocks[index] ?? 0) - elapsed;
      game.turnElapsed += elapsed;
    }
    const candidate: Table = {
      ...table,
      game,
      players: table.players.map((player) => ({ ...player })),
      spectators: [...table.spectators],
      chat: table.chat.map((entry) => ({
        userID: entry.userID,
        message: { ...entry.message },
      })),
      chatRead: new Map(table.chatRead),
    };
    return { candidate, game };
  }

  private duplicate(table: Table, user: WSUser, requestID: string | undefined) {
    return (
      this.tables.has(table.id)
      && requestID !== undefined
      && requestID !== ""
      && table.game?.requests.some(
        (entry) => entry.userID === user.userID && entry.id === requestID,
      ) === true
    );
  }

  private static remember(
    game: Game,
    user: WSUser,
    requestID: string | undefined,
  ) {
    if (requestID !== undefined && requestID !== "") {
      if (game.requests.length >= 1024) {
        throw new ActionRejected("This table's request-ID ledger is full.");
      }
      game.requests.push({ userID: user.userID, id: requestID });
    }
  }

  private freeze(table: Table, error: unknown) {
    const currentTable = table;
    currentTable.recoveryBlocked = true;
    this.cancel(table.id);
    logger.error(
      `Table ${table.id} frozen after uncertain storage: ${String(error)}`,
    );
    const affected = new Set([
      ...table.players.map((player) => player.userID),
      ...table.spectators.map((spectator) => spectator.userID),
    ]);
    for (const id of affected) {
      const user = wsUsers.get(id);
      if (user !== undefined) {
        wsWarning(
          user.connection,
          "This table is frozen because its durable state is uncertain. Reconnecting cannot safely resume it until recovery.",
        );
      }
    }
  }

  private async commit(
    table: Table,
    candidate: Table,
    messages: GameMessages,
    afterCommit?: () => void,
  ) {
    const game = requireGame(candidate);
    const terminal = game.state.endCondition !== EndCondition.InProgress;
    if (terminal && game.datetimeFinished === undefined) {
      game.datetimeFinished = new Date();
    }
    const checkpoint = serializeGameCheckpoint(candidate, game);
    const completion = terminal ? completionRecord(candidate, game) : undefined;
    const replay = terminal
      ? this.prepareReplay(candidate, messages)
      : undefined;
    this.tables.add(table.id);
    this.cancel(table.id);
    try {
      game.revision = await this.store.save(
        game.databaseID,
        game.revision,
        checkpoint,
      );
      if (completion !== undefined) {
        const result = await this.store.complete(completion, game.revision);
        game.datetimeStarted = result.datetimeStarted;
        game.datetimeFinished = result.datetimeFinished;
      }
    } catch (error) {
      this.freeze(table, error);
      return;
    }
    if (completion !== undefined) {
      this.refreshStatistics(candidate, game);
    }
    game.clockAnchor = this.now();
    Object.assign(table, replay ?? candidate);
    this.tables.add(table.id);
    afterCommit?.();
    messages.publish();
    if (table.replay && table.spectators.length === 0) {
      removeTable(table.id);
      this.tables.delete(table.id);
    } else {
      this.arm(table);
    }
  }

  private refreshStatistics(table: Table, game: Game) {
    // The store tracks this best-effort work for drain/close without delaying replay publication.
    const participants = new Set(table.players.map((player) => player.userID));
    const recipients = [...wsUsers.values()].filter(
      (user) =>
        participants.has(user.userID)
        || [...user.friends].some((id) => participants.has(id)),
    );
    const pending = this.store
      .refreshStatistics(completionRecord(table, game))
      .catch((error: unknown) => {
        logger.error(
          `Game ${game.databaseID} completed, but derived statistics refresh failed: ${String(error)}`,
        );
      })
      .then(async () => {
        const getHistory = this.dependencies.getCompletionHistory;
        if (getHistory === undefined || recipients.length === 0) {
          return;
        }
        const rows = await getHistory(game.databaseID);
        if (rows.length !== 1) {
          throw new Error("Missing completed-game history.");
        }
        const history = rows.map((row) => ({
          ...row,
          incrementNumGames: true,
        }));
        const messages = new GameMessages();
        for (const user of recipients) {
          messages.add(
            user,
            participants.has(user.userID)
              ? ServerCommand.gameHistory
              : ServerCommand.gameHistoryFriends,
            history,
          );
        }
        messages.publish();
      })
      .catch((error: unknown) => {
        logger.error(
          `Game ${game.databaseID} history notification failed: ${String(error)}`,
        );
      })
      .finally(() => {
        this.notifications.delete(pending);
      });
    this.notifications.add(pending);
  }

  private prepareReplay(candidate: Table, messages: GameMessages) {
    const game = requireGame(candidate);
    const attendance = this.attendance(candidate);
    const viewers =
      game.state.endCondition === EndCondition.IdleTimeout
        ? []
        : attendeeUsers(candidate, attendance);
    const spectators = viewers.map((user) => ({
      userID: user.userID,
      name: user.username,
      typing: false,
      lastTyped: new Date(0),
      notes: [],
    }));
    const owner =
      viewers.find((user) => user.userID === candidate.ownerID) ?? viewers[0];
    const replay: Table = {
      ...candidate,
      replay: true,
      name: `${candidate.name} (Game #${game.databaseID})`,
      ownerID: owner?.userID ?? candidate.ownerID,
      extraOptions: { ...candidate.extraOptions, databaseID: game.databaseID },
      players: candidate.players.map((player) => ({
        ...player,
        present: true,
      })),
      spectators,
      progress: 100,
    };
    game.replaySegment = Math.max(0, game.state.turn - 1);
    appendReplayDetails(messages, replay, game, viewers);
    appendConnected(messages, replay, viewers);
    for (const user of viewers) {
      messages.add(user, ServerCommand.finishOngoingGame, {
        tableID: replay.id,
        databaseID: game.databaseID,
        sharedReplayLeader: owner?.username ?? "",
      });
      messages.status(user, Status.SharedReplay, replay.id);
      messages.add(user, ServerCommand.spectators, {
        tableID: replay.id,
        spectators: spectators.map(({ name }) => ({ name })),
      });
    }
    messages.lobby(replay);
    if (viewers.length === 0 && replay.visible) {
      for (const user of wsUsers.values()) {
        messages.add(user, ServerCommand.tableGone, { tableID: replay.id });
      }
    }
    return replay;
  }

  async start(
    user: WSUser,
    data: ClientCommandData["tableStart"],
  ): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      if (table.ownerID !== user.userID) {
        throw new ActionRejected(
          "Only the owner of a table can start the game.",
        );
      }
      if (table.running || table.replay) {
        throw new ActionRejected(
          "The game has already started, so you cannot start it.",
        );
      }
      if (table.players.length < 2) {
        throw new ActionRejected(
          "You need at least 2 players before you can start a game.",
        );
      }
      if (
        (data.intendedVariant !== undefined
          && data.intendedVariant !== ""
          && data.intendedVariant !== table.options.variantName)
        || (data.intendedPlayers !== undefined
          && (data.intendedPlayers.length !== table.players.length
            || table.players.some(
              (player) => data.intendedPlayers?.includes(player.name) !== true,
            )))
      ) {
        return;
      }
      const databaseID = await this.store.reserveID();
      const variant = getVariant(table.options.variantName);
      const prefix = `p${table.players.length}v${variant.id}s`;
      let suffix = table.extraOptions.setSeedSuffix;
      if (suffix === "") {
        const blocked = await this.dependencies.getBlockedSeeds(
          table.players.map((player) => player.userID),
        );
        let next = 1;
        while (blocked.has(`${prefix}${next}`)) {
          next++;
        }
        suffix = String(next);
      }
      if (!isCurrent(user) || this.quiescing || this.closed) {
        return;
      }
      const seed = prefix + suffix;
      const deck = createShuffledDeck(variant, seed);
      const rng = new GoRandom(seedToInt64(seed));
      for (let index = 0; index < deck.length; index++) {
        rng.intn(index + 1);
      }
      const players = table.players.map((player) => ({
        ...player,
        present: false,
        typing: false,
      }));
      for (let index = 0; index < players.length; index++) {
        const other = rng.intn(index + 1);
        const first = players[index];
        const second = players[other];
        assertDefined(first, "Missing shuffle player.");
        assertDefined(second, "Missing shuffle player.");
        players[index] = second;
        players[other] = first;
      }
      const options = {
        ...table.options,
        numPlayers: numPlayers.parse(players.length),
      };
      const transition = createGame({
        options,
        seed,
        deck,
        playerNames: players.map((player) => player.name),
      });
      const game: Game = {
        databaseID,
        revision: 0,
        state: transition.state,
        datetimeStarted: new Date(),
        datetimeFinished: undefined,
        clocks: players.map(() =>
          options.timed ? options.timeBase * 1000 : 0,
        ),
        duration: 0,
        turnElapsed: 0,
        idleRemaining: IDLE_TIMEOUT,
        clockAnchor: this.now(),
        pausePlayerIndex: -1,
        queuedPauses: players.map(() => false),
        notes: players.map(() =>
          Array.from({ length: deck.length + variant.suits.length }, () => ""),
        ),
        tags: [],
        requests: [],
        replaySegment: 0,
      };
      GameRuntime.remember(game, user, data.requestID);
      const candidate: Table = {
        ...table,
        game,
        players,
        options,
        running: true,
        datetimeLastAction: game.datetimeStarted,
      };
      const messages = new GameMessages();
      const attendees = new Map<UserID, WSUser>();
      for (const player of players) {
        const connected = wsUsers.get(player.userID);
        if (connected !== undefined) {
          attendees.set(player.userID, connected);
          messages.add(connected, ServerCommand.tableStart, {
            tableID: table.id,
            replay: false,
          });
          messages.status(connected, Status.Playing, table.id);
        }
      }
      messages.lobby(candidate);
      await this.commit(table, candidate, messages, () => {
        this.attendees.set(table.id, attendees);
      });
    });
  }

  async bootstrap(user: WSUser, id: TableID, part: 1 | 2): Promise<void> {
    await this.run(user, id, (table) => {
      this.activeUser(table, user);
      const { candidate, game } = this.copy(table);
      const messages = new GameMessages();
      appendBootstrap(messages, candidate, game, user, part);
      messages.publish();
    });
  }

  async loaded(user: WSUser, data: ClientCommandData["loaded"]): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      this.activeUser(table, user);
      if (table.replay || this.duplicate(table, user, data.requestID)) {
        return;
      }
      liveGame(table);
      const index = table.players.findIndex(
        (player) => player.userID === user.userID,
      );
      if (index === -1) {
        return;
      }
      const { candidate, game } = this.copy(table);
      const player = candidate.players[index];
      assertDefined(player, "Missing loaded player.");
      player.present = true;
      if (index === game.state.activePlayerIndex && !game.state.startedTimer) {
        game.state = { ...game.state, startedTimer: true };
      }
      GameRuntime.remember(game, user, data.requestID);
      const messages = new GameMessages();
      const users = attendeeUsers(candidate, this.attendance(table), false);
      appendConnected(messages, candidate, users);
      appendClock(messages, candidate, game, users);
      await this.commit(table, candidate, messages);
    });
  }

  async action(user: WSUser, data: ClientCommandData["action"]): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      this.activeUser(table, user);
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      const old = liveGame(table);
      const index = playerIndex(table, user);
      validateAction(old.state, index, data);
      const { candidate, game } = this.copy(table);
      if (table.options.timed) {
        game.clocks[index] =
          (game.clocks[index] ?? 0) + table.options.timePerTurn * 1000;
      }
      const result = applyAction(game.state, index, data, {
        playerTimes: game.clocks,
        duration: game.duration,
      });
      game.state = result.state;
      game.turnElapsed = 0;
      game.idleRemaining = IDLE_TIMEOUT;
      candidate.datetimeLastAction = new Date();
      const next = game.state.activePlayerIndex;
      if (
        game.state.endCondition === EndCondition.InProgress
        && game.queuedPauses[next] === true
      ) {
        game.queuedPauses[next] = false;
        game.pausePlayerIndex = next;
        game.state = { ...game.state, paused: true };
        candidate.chat.push({
          userID: 0,
          message: {
            msg: `${escapeHTMLCharacters(game.state.players[next]?.name ?? "")} paused the game.`,
            who: PROJECT_NAME,
            source: "server",
            datetime: new Date().toISOString(),
            room: `table${table.id}`,
          },
        });
      }
      GameRuntime.remember(game, user, data.requestID);
      const messages = this.transitionMessages(candidate, game, result.events);
      if (game.state.paused) {
        const notice = candidate.chat.at(-1)?.message;
        if (notice !== undefined) {
          for (const recipient of attendeeUsers(
            candidate,
            this.attendance(table),
          )) {
            messages.add(recipient, ServerCommand.chat, notice);
          }
        }
      }
      await this.commit(table, candidate, messages);
    });
  }

  private transitionMessages(
    table: Table,
    game: Game,
    events: readonly EngineEvent[],
  ) {
    const messages = new GameMessages();
    const attendees = this.attendance(table);
    const users = attendeeUsers(table, attendees);
    appendGameEvents(messages, table, game, attendees, events);
    if (game.state.endCondition === EndCondition.InProgress) {
      appendClock(messages, table, game, users);
      if (game.state.paused) {
        for (const user of users) {
          messages.add(user, ServerCommand.pause, {
            tableID: table.id,
            active: true,
            playerIndex: game.pausePlayerIndex,
          });
        }
      }
    }
    return messages;
  }

  async terminate(
    user: WSUser,
    id: TableID,
    requestID?: string,
  ): Promise<void> {
    await this.run(user, id, async (table) => {
      this.activeUser(table, user);
      if (this.duplicate(table, user, requestID)) {
        return;
      }
      liveGame(table);
      const index = playerIndex(table, user);
      const { candidate, game } = this.copy(table);
      const result = terminateGame(
        game.state,
        {
          actorIndex: index,
          condition: EndCondition.TerminatedByPlayer,
          playerIndex: index,
        },
        { playerTimes: game.clocks, duration: game.duration },
      );
      game.state = result.state;
      GameRuntime.remember(game, user, requestID);
      await this.commit(
        table,
        candidate,
        this.transitionMessages(candidate, game, result.events),
      );
    });
  }

  async pause(user: WSUser, data: ClientCommandData["pause"]): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      this.activeUser(table, user);
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      const old = liveGame(table);
      const index = playerIndex(table, user);
      if (!table.options.timed) {
        throw new ActionRejected(
          "This is not a timed game, so you cannot pause / unpause.",
        );
      }
      const setting =
        data.setting === "pause-queue" && old.state.activePlayerIndex === index
          ? "pause"
          : data.setting;
      if (
        !["pause", "pause-queue", "pause-unqueue", "unpause"].includes(setting)
      ) {
        throw new ActionRejected("That is not a valid setting.");
      }
      if (
        (setting === "pause" && old.state.paused)
        || (setting === "unpause" && !old.state.paused)
        || (setting === "pause-queue" && old.queuedPauses[index] === true)
        || (setting === "pause-unqueue" && old.queuedPauses[index] !== true)
      ) {
        throw new ActionRejected("That pause setting is already in effect.");
      }
      const { candidate, game } = this.copy(table);
      const messages = new GameMessages();
      if (setting === "pause-queue" || setting === "pause-unqueue") {
        game.queuedPauses[index] = setting === "pause-queue";
      } else {
        game.state = { ...game.state, paused: setting === "pause" };
        game.pausePlayerIndex = setting === "pause" ? index : -1;
        if (setting === "unpause") {
          game.turnElapsed = 0;
        }
        const message = {
          msg: `${escapeHTMLCharacters(user.username)} ${setting === "pause" ? "paused" : "unpaused"} the game.`,
          who: PROJECT_NAME,
          source: "server" as const,
          datetime: new Date().toISOString(),
          room: `table${table.id}`,
        };
        candidate.chat.push({ userID: 0, message });
        const users = attendeeUsers(candidate, this.attendance(table));
        for (const recipient of users) {
          messages.add(recipient, ServerCommand.pause, {
            tableID: table.id,
            active: game.state.paused,
            playerIndex: game.pausePlayerIndex,
          });
          messages.add(recipient, ServerCommand.chat, message);
        }
        if (setting === "unpause") {
          appendClock(messages, candidate, game, users);
        }
      }
      GameRuntime.remember(game, user, data.requestID);
      await this.commit(table, candidate, messages);
    });
  }

  async note(user: WSUser, data: ClientCommandData["note"]): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      this.activeUser(table, user);
      liveGame(table);
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      const index = playerIndex(table, user);
      const text = trimUnicodeWhitespace(
        truncateToMaxBytes(data.note, 300).replaceAll(
          /[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu,
          "",
        ),
      );
      if (getMaxConsecutiveMarks(text) > 3) {
        throw new ActionRejected(
          "Notes cannot contain more than 3 consecutive diacritics.",
        );
      }
      const { candidate, game } = this.copy(table);
      const notes = game.notes[index];
      if (notes === undefined || data.order < 0 || data.order >= notes.length) {
        throw new ActionRejected(
          "That is an invalid card order to write a note on.",
        );
      }
      notes[data.order] = text;
      GameRuntime.remember(game, user, data.requestID);
      const messages = new GameMessages();
      const observers = attendeeUsers(candidate, this.attendance(table)).filter(
        (recipient) =>
          table.spectators.some((entry) => entry.userID === recipient.userID),
      );
      appendObserverNotes(messages, candidate, game, observers);
      await this.commit(table, candidate, messages);
    });
  }

  async tag(user: WSUser, data: ClientCommandData["tag"]): Promise<void> {
    await this.run(user, data.tableID, async (table) => {
      this.activeUser(table, user);
      liveGame(table);
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      const sanitized = sanitizeTag(data.msg);
      if (sanitized.error !== undefined) {
        throw new ActionRejected(sanitized.error);
      }
      const { candidate, game } = this.copy(table);
      game.tags = game.tags.filter((entry) => entry.tag !== sanitized.tag);
      game.tags.push({ userID: user.userID, tag: sanitized.tag });
      GameRuntime.remember(game, user, data.requestID);
      const messages = new GameMessages();
      messages.add(user, ServerCommand.chat, {
        msg: `Successfully added a tag of "${escapeHTMLCharacters(sanitized.tag)}".`,
        who: PROJECT_NAME,
        source: "server",
        datetime: new Date().toISOString(),
        room: data.room,
        recipient: user.username,
      });
      await this.commit(table, candidate, messages);
    });
  }

  async chat(
    user: WSUser,
    id: TableID,
    text: string,
    requestID?: string,
  ): Promise<void> {
    await this.run(user, id, async (table) => {
      this.activeUser(table, user);
      if (this.duplicate(table, user, requestID)) {
        return;
      }
      if (!table.replay) {
        liveGame(table);
      }
      const { candidate, game } = this.copy(table);
      const message = {
        msg: text,
        who: user.username,
        source: "user" as const,
        datetime: new Date().toISOString(),
        room: `table${id}`,
      };
      candidate.chat.push({ userID: user.userID, message });
      GameRuntime.remember(game, user, requestID);
      const messages = new GameMessages();
      for (const recipient of attendeeUsers(
        candidate,
        this.attendance(table),
      )) {
        messages.add(recipient, ServerCommand.chat, message);
      }
      if (table.replay) {
        Object.assign(table, candidate);
        messages.publish();
        return;
      }
      await this.commit(table, candidate, messages);
    });
  }

  async reattend(user: WSUser, id: TableID): Promise<void> {
    await this.run(user, id, (table) => {
      requireGame(table);
      if (table.replay) {
        throw new ActionRejected(
          "You can not reattend a replay. Spectate it instead.",
        );
      }
      playerIndex(table, user);
      this.attendance(table).set(user.userID, user);
      const messages = new GameMessages();
      messages.add(user, ServerCommand.tableStart, {
        tableID: id,
        replay: false,
      });
      messages.status(user, Status.Playing, id);
      messages.publish();
    });
  }

  async spectate(
    user: WSUser,
    data: ClientCommandData["tableSpectate"],
  ): Promise<void> {
    await this.run(user, data.tableID, (table) => {
      const game = requireGame(table);
      if (
        getTableIDsUserAttending(user.userID).some(
          (id) =>
            id !== table.id
            && getTable(id)?.spectators.some(
              (entry) => entry.userID === user.userID,
            ) === true,
        )
      ) {
        throw new ActionRejected(
          "Unattend your current spectated table before spectating another.",
        );
      }
      if (
        !table.replay
        && table.players.some((player) => player.userID === user.userID)
      ) {
        throw new ActionRejected(
          "You cannot spectate a game you are playing in.",
        );
      }
      if (
        data.shadowingPlayerIndex < -1
        || data.shadowingPlayerIndex >= table.players.length
      ) {
        throw new ActionRejected("Invalid shadowing player index.");
      }
      const shadow =
        data.shadowingPlayerIndex === -1
          ? undefined
          : data.shadowingPlayerIndex;
      const spectator = {
        userID: user.userID,
        name: user.username,
        typing: false,
        lastTyped: new Date(0),
        notes: [],
        shadowingPlayerIndex: shadow as 0 | 1 | 2 | 3 | 4 | 5 | undefined,
        shadowingPlayerUsername:
          shadow === undefined ? undefined : game.state.players[shadow]?.name,
      };
      const currentTable = table;
      currentTable.spectators = table.spectators.filter(
        (entry) => entry.userID !== user.userID,
      );
      currentTable.spectators.push(spectator);
      rememberSpectating(user.userID, undefined);
      this.attendance(table).set(user.userID, user);
      const messages = new GameMessages();
      messages.add(user, ServerCommand.tableStart, {
        tableID: table.id,
        replay: table.replay,
      });
      messages.status(
        user,
        table.replay ? Status.SharedReplay : Status.Spectating,
        table.id,
      );
      messages.lobby(table);
      messages.publish();
    });
  }

  async unattend(user: WSUser, id: TableID): Promise<void> {
    await this.run(user, id, (table) => {
      this.activeUser(table, user);
      this.detach(table, user.userID);
      const messages = new GameMessages();
      messages.status(user, Status.Lobby, 0 as TableID);
      messages.publish();
    });
  }

  cleanupDisconnected(table: Table): void {
    for (const [id, user] of this.attendance(table)) {
      if (!isCurrent(user)) {
        this.detach(table, id, true);
      }
    }
  }

  private detach(table: Table, id: UserID, disconnected = false) {
    const spectator = table.spectators.find((entry) => entry.userID === id);
    rememberSpectating(
      id,
      disconnected && spectator !== undefined
        ? {
            tableID: table.id,
            shadowingPlayerIndex:
              spectator.shadowingPlayerIndex === -1
                ? undefined
                : spectator.shadowingPlayerIndex,
          }
        : undefined,
    );
    this.attendance(table).delete(id);
    const currentTable = table;
    const player = table.players.find((entry) => entry.userID === id);
    if (player !== undefined && !table.replay) {
      player.present = false;
    }
    currentTable.spectators = table.spectators.filter(
      (entry) => entry.userID !== id,
    );
    const messages = new GameMessages();
    appendConnected(
      messages,
      table,
      attendeeUsers(table, this.attendance(table), false),
    );
    messages.lobby(table);
    if (table.replay && table.spectators.length === 0) {
      removeTable(table.id);
      this.tables.delete(table.id);
      for (const user of wsUsers.values()) {
        messages.add(user, ServerCommand.tableGone, { tableID: table.id });
      }
    }
    messages.publish();
  }

  async replay(
    user: WSUser,
    data: ClientCommandData["replayAction"],
  ): Promise<void> {
    await this.run(user, data.tableID, (table) => {
      this.activeUser(table, user);
      if (this.duplicate(table, user, data.requestID)) {
        return;
      }
      if (!table.replay || !table.visible || table.ownerID !== user.userID) {
        throw new ActionRejected(
          "You must lead this shared replay to perform a replay action.",
        );
      }

      const game = requireGame(table);
      const messages = new GameMessages();
      for (const recipient of attendeeUsers(table, this.attendance(table))) {
        switch (data.type) {
          case 0: {
            messages.add(recipient, ServerCommand.replaySegment, {
              tableID: table.id,
              segment: data.segment,
            });

            break;
          }

          case 1: {
            messages.add(recipient, ServerCommand.replayIndicator, {
              tableID: table.id,
              order: data.order,
            });

            break;
          }

          case 2: {
            messages.add(recipient, ServerCommand.replaySound, {
              tableID: table.id,
              sound: data.sound,
            });

            break;
          }

          default: {
            throw new ActionRejected("This replay control is not implemented.");
          }
        }
      }
      GameRuntime.remember(game, user, data.requestID);
      if (data.type === 0) {
        game.replaySegment = data.segment;
      }
      messages.publish();
    });
  }

  async setLeader(user: WSUser, id: TableID, name: string): Promise<void> {
    await this.run(user, id, async (table) => {
      this.activeUser(table, user);
      const target = table.replay ? table.spectators : table.players;
      const leader = target.find(
        (entry) => normalizeString(entry.name) === normalizeString(name),
      );
      if (leader === undefined) {
        throw new ActionRejected("That player is not at this table.");
      }
      if (leader.userID === table.ownerID) {
        throw new ActionRejected(`${leader.name} is already the leader.`);
      }
      const messages = new GameMessages();
      if (table.replay) {
        const currentTable = table;
        currentTable.ownerID = leader.userID;
        for (const recipient of attendeeUsers(table, this.attendance(table))) {
          messages.add(recipient, ServerCommand.replayLeader, {
            tableID: id,
            name: leader.name,
          });
        }
        messages.lobby(table);
        messages.publish();
      } else {
        liveGame(table);
        const { candidate } = this.copy(table);
        candidate.ownerID = leader.userID;
        messages.lobby(candidate);
        await this.commit(table, candidate, messages);
      }
    });
  }

  private cancel(id: TableID) {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer.timer);
      this.timers.delete(id);
    }
  }

  private arm(table: Table) {
    this.cancel(table.id);
    const { game } = table;
    if (
      this.closed
      || this.quiescing
      || table.replay
      || table.recoveryBlocked === true
      || game === undefined
      || game.state.endCondition !== EndCondition.InProgress
    ) {
      return;
    }
    const elapsed = Math.max(0, Math.floor(this.now() - game.clockAnchor));
    const turnRemaining =
      table.options.timed && game.state.startedTimer && !game.state.paused
        ? (game.clocks[game.state.activePlayerIndex] ?? 0) - elapsed
        : Infinity;
    const delay = Math.max(
      0,
      Math.min(game.idleRemaining - elapsed, turnRemaining),
    );
    this.timerVersion++;
    const version = this.timerVersion;
    const timer = setTimeout(() => {
      this.expire(table, version).catch((error: unknown) => {
        this.freeze(table, error);
      });
    }, delay);
    timer.unref();
    this.timers.set(table.id, { timer, version });
  }

  private async expire(table: Table, version: number) {
    const admitted = await enqueueTableOperation(table.id, async () => {
      if (
        this.timers.get(table.id)?.version !== version
        || getTable(table.id) !== table
        || this.closed
      ) {
        return;
      }
      const { candidate, game } = this.copy(table);
      const index = game.state.activePlayerIndex;
      const condition =
        game.idleRemaining <= 0
          ? EndCondition.IdleTimeout
          : EndCondition.Timeout;
      if (condition === EndCondition.Timeout && (game.clocks[index] ?? 1) > 0) {
        this.arm(table);
        return;
      }
      if (condition === EndCondition.Timeout) {
        game.clocks[index] = 0;
      }
      const result = terminateGame(
        game.state,
        {
          actorIndex: index,
          condition,
          playerIndex: condition === EndCondition.IdleTimeout ? -1 : index,
        },
        { playerTimes: game.clocks, duration: game.duration },
      );
      game.state = result.state;
      await this.commit(
        table,
        candidate,
        this.transitionMessages(candidate, game, result.events),
      );
    });
    if (!admitted && this.timers.get(table.id)?.version === version) {
      const timer = setTimeout(() => {
        this.expire(table, version).catch((error: unknown) => {
          this.freeze(table, error);
        });
      }, 25);
      timer.unref();
      this.timers.set(table.id, { timer, version });
    }
  }
}
