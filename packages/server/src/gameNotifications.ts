import type {
  ServerCommandData,
  Status,
  TableID,
  UserID,
} from "@hanabi-live/data";
import { ServerCommand } from "@hanabi-live/data";
import { getCharacters, getVariant } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { getTypingState } from "./chatPresence";
import type { EngineEvent } from "./engine/types";
import { eventsForRecipient } from "./engine/visibility";
import type { Game } from "./interfaces/Game";
import type { Table } from "./interfaces/Table";
import { getTableData } from "./tables";
import { getWSMsg, sendPreparedWSMessage } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { getUserData, wsUsers } from "./wsUsers";

/** Fully validated and serialized before durability; publication checks session identity again. */
export class GameMessages {
  private readonly messages: Array<{ user: WSUser; message: string }> = [];
  private readonly statuses: Array<{
    user: WSUser;
    status: Status;
    tableID: TableID;
  }> = [];

  status(user: WSUser, status: Status, tableID: TableID): void {
    this.statuses.push({ user, status, tableID });
    this.addMany(wsUsers.values(), ServerCommand.user, {
      ...getUserData(user),
      status,
      tableID,
    });
  }

  add<Command extends ServerCommand>(
    user: WSUser,
    command: Command,
    data: ServerCommandData[Command],
  ): void {
    this.messages.push({ user, message: prepareMessage(command, data) });
  }

  addMany<Command extends ServerCommand>(
    users: Iterable<WSUser>,
    command: Command,
    data: ServerCommandData[Command],
  ): void {
    let message: string | undefined;
    for (const user of users) {
      message ??= prepareMessage(command, data);
      this.messages.push({ user, message });
    }
  }

  publish(): void {
    for (const { user, status, tableID } of this.statuses) {
      if (wsUsers.get(user.userID) === user) {
        user.status = status;
        user.tableID = tableID;
      }
    }
    for (const { user, message } of this.messages) {
      if (wsUsers.get(user.userID) === user) {
        sendPreparedWSMessage(user.connection, message);
      }
    }
  }

  lobby(table: Table): void {
    if (table.visible) {
      // The public table row differs between recipients only in its joined flag.
      const views = new Map<boolean, string>();
      for (const user of wsUsers.values()) {
        const data = getTableData(table, user.userID);
        let message = views.get(data.joined);
        if (message === undefined) {
          message = prepareMessage(ServerCommand.table, data);
          views.set(data.joined, message);
        }
        this.messages.push({ user, message });
      }
    }
  }
}

function prepareMessage<Command extends ServerCommand>(
  command: Command,
  data: ServerCommandData[Command],
): string {
  const message = getWSMsg(command, data);
  assertDefined(message, `Invalid prepared ${command} notification.`);
  return message;
}

export function attendeeUsers(
  table: Table,
  attendees: ReadonlyMap<UserID, WSUser>,
  requirePresent = true,
): readonly WSUser[] {
  return [...attendees.values()].filter(
    (user) =>
      wsUsers.get(user.userID) === user
      && (table.spectators.some((spectator) => spectator.userID === user.userID)
        || (!table.replay
          && table.players.some(
            (player) =>
              player.userID === user.userID
              && (!requirePresent || player.present),
          ))),
  );
}

export function appendGameEvents(
  messages: GameMessages,
  table: Table,
  game: Game,
  attendees: ReadonlyMap<UserID, WSUser>,
  events: readonly EngineEvent[],
): void {
  for (const user of attendeeUsers(table, attendees)) {
    const playerIndex = table.players.findIndex(
      (player) => player.userID === user.userID,
    );
    const spectator = table.spectators.find(
      (entry) => entry.userID === user.userID,
    );
    const recipient =
      !table.replay && playerIndex !== -1
        ? { kind: "player" as const, playerIndex }
        : {
            kind: "spectator" as const,
            shadowingPlayerIndex: table.replay
              ? undefined
              : spectator?.shadowingPlayerIndex,
          };
    for (const event of eventsForRecipient(game.state, recipient, events)) {
      messages.add(user, ServerCommand.gameAction, {
        tableID: table.id,
        action: event,
      });
    }
  }
}

export function appendClock(
  messages: GameMessages,
  table: Table,
  game: Game,
  users: readonly WSUser[],
): void {
  messages.addMany(users, ServerCommand.clock, {
    tableID: table.id,
    times: game.clocks,
    activePlayerIndex: game.state.activePlayerIndex,
    timeTaken: game.state.paused ? 0 : game.turnElapsed,
  });
}

export function appendConnected(
  messages: GameMessages,
  table: Table,
  users: readonly WSUser[],
): void {
  messages.addMany(users, ServerCommand.connected, {
    tableID: table.id,
    list: table.players.map((player) => player.present),
  });
}

export function appendBootstrap(
  messages: GameMessages,
  table: Table,
  game: Game,
  user: WSUser,
  part: 1 | 2,
): void {
  const index = table.players.findIndex(
    (player) => player.userID === user.userID,
  );
  const spectator = table.spectators.find(
    (entry) => entry.userID === user.userID,
  );
  const shadow = spectator?.shadowingPlayerIndex;
  const shadowingPlayerIndex = shadow === -1 ? undefined : shadow;
  if (part === 1) {
    const characters = getCharacters();
    messages.add(user, ServerCommand.init, {
      tableID: table.id,
      playerNames: table.players.map((player) => player.name),
      ourPlayerIndex:
        shadowingPlayerIndex
        ?? Math.max(
          0,
          index === -1
            ? table.players.findIndex((player) => player.name === user.username)
            : index,
        ),
      spectating: spectator !== undefined && !table.replay,
      shadowing: shadowingPlayerIndex !== undefined,
      replay: table.replay,
      databaseID: table.replay ? game.databaseID : -1,
      hasCustomSeed: table.extraOptions.customSeed !== undefined,
      seed: game.state.seed,
      datetimeStarted: game.datetimeStarted.toISOString(),
      datetimeFinished:
        game.datetimeFinished?.toISOString() ?? "0001-01-01T00:00:00Z",
      options: game.state.options,
      characterAssignments: table.options.detrimentalCharacters
        ? game.state.players.map(
            (player) =>
              characters.find((entry) => entry.name === player.character)?.id
              ?? -1,
          )
        : [],
      characterMetadata: table.options.detrimentalCharacters
        ? game.state.players.map((player) => player.characterMetadata)
        : [],
      sharedReplay: table.replay && table.visible,
      sharedReplayLeader:
        table.players.find((player) => player.userID === table.ownerID)?.name
        ?? table.spectators.find((entry) => entry.userID === table.ownerID)
          ?.name
        ?? "",
      sharedReplaySegment: table.replay ? game.replaySegment : game.state.turn,
      sharedReplayEffMod: game.replayControls?.efficiency ?? 0,
      paused: game.state.paused,
      pausePlayerIndex: game.pausePlayerIndex,
      pauseQueued: game.queuedPauses[index] ?? false,
    });
    return;
  }
  const recipient =
    !table.replay && index !== -1
      ? { kind: "player" as const, playerIndex: index }
      : {
          kind: "spectator" as const,
          shadowingPlayerIndex: table.replay ? undefined : shadowingPlayerIndex,
        };
  messages.add(user, ServerCommand.gameActionList, {
    tableID: table.id,
    list: [...eventsForRecipient(game.state, recipient)],
  });
  if (table.replay) {
    appendReplayDetails(messages, table, game, [user]);
  } else {
    appendConnected(messages, table, [user]);
    appendClock(messages, table, game, [user]);
    if (index === -1) {
      appendObserverNotes(messages, table, game, [user]);
    } else {
      messages.add(user, ServerCommand.noteListPlayer, {
        tableID: table.id,
        notes: game.notes[index] ?? [],
      });
      const player = table.players[index];
      assertDefined(player, "Missing player vote state.");
      messages.add(user, ServerCommand.voteChange, { vote: player.voteToKill });
    }
  }
  messages.add(user, ServerCommand.chatList, {
    list: table.chat.slice(-1000).map((entry) => entry.message),
    unread: table.chat.length - (table.chatRead.get(user.userID) ?? 0),
  });
  for (const state of getTypingState(table, user)) {
    messages.add(user, ServerCommand.chatTyping, state);
  }
  messages.add(user, ServerCommand.spectators, {
    tableID: table.id,
    spectators: table.spectators.map(
      ({
        name,
        shadowingPlayerIndex: shadowIndex,
        shadowingPlayerUsername,
      }) => ({
        name,
        shadowingPlayerIndex: shadowIndex,
        shadowingPlayerUsername,
      }),
    ),
  });
  if (table.replay && game.replayControls?.hypothetical === true) {
    messages.add(user, ServerCommand.hypothetical, {
      showDrawnCards: game.replayControls.showDrawnCards,
      actions: game.replayControls.actions,
    });
  }
}

export function appendObserverNotes(
  messages: GameMessages,
  table: Table,
  game: Game,
  users: readonly WSUser[],
  order?: number,
): void {
  const notesSize =
    game.state.deck.length + getVariant(table.options.variantName).suits.length;
  for (const user of users) {
    const shadow = table.replay
      ? undefined
      : table.spectators.find((entry) => entry.userID === user.userID)
          ?.shadowingPlayerIndex;
    const notes = [
      ...table.players.flatMap((player, index) =>
        shadow !== undefined && shadow !== -1 && shadow !== index
          ? []
          : [
              {
                name: player.name,
                notes: game.notes[index] ?? [],
                isSpectator: false,
              },
            ],
      ),
      ...[
        ...(game.spectatorNotes ?? []),
        ...table.spectators.filter(
          (spectator) =>
            game.spectatorNotes?.every(
              (entry) => entry.userID !== spectator.userID,
            ) ?? true,
        ),
      ].flatMap((spectator) =>
        shadow !== undefined
        && shadow !== -1
        && spectator.userID !== user.userID
          ? []
          : [
              {
                name: spectator.name,
                notes: Array.from(
                  { length: notesSize },
                  (_, index) => spectator.notes[index] ?? "",
                ),
                isSpectator: true,
              },
            ],
      ),
    ];
    if (order === undefined) {
      messages.add(user, ServerCommand.noteList, { tableID: table.id, notes });
    } else {
      messages.add(user, ServerCommand.note, {
        tableID: table.id,
        order,
        notes: notes.map((entry) => ({
          name: entry.name,
          text: entry.notes[order] ?? "",
          isSpectator: entry.isSpectator,
        })),
      });
    }
  }
}

export function appendReplayDetails(
  messages: GameMessages,
  table: Table,
  game: Game,
  users: readonly WSUser[],
): void {
  messages.addMany(users, ServerCommand.cardIdentities, {
    tableID: table.id,
    cardIdentities: game.state.deck.map(({ suitIndex, rank }) => ({
      suitIndex,
      rank,
    })),
  });
  appendObserverNotes(messages, table, game, users);
}
