import {
  DEFAULT_VARIANT_NAME,
  getCharacter,
  getVariantByID,
} from "@hanabi-live/game";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { parseAPIInteger } from "../apiQuery";
import { createShuffledDeck } from "../engine/setup";
import { logger } from "../logger";
import { models } from "../models";

export async function httpExport(
  request: FastifyRequest<{ Params: { databaseID?: string } }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const raw = request.params.databaseID;
  if (raw === undefined || raw === "") {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .send("Error: You must specify a database game ID.");
  }
  const id = parseAPIInteger(raw);
  if (id === undefined) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: That is not a valid database game ID.");
  }
  const record =
    id > 0 && id <= 2_147_483_647 ? await models.replays.get(id) : undefined;
  if (record === undefined) {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .send("Error: That game does not exist in the database.");
  }
  const { game, players, actions } = record;
  if (
    players.length !== game.numPlayers
    || players.some((player, index) => player.seat !== index)
  ) {
    throw new Error(`Game ${id} has inconsistent participant seats.`);
  }
  const variant = getVariantByID(game.variantID);
  const deck = record.customDeck ?? createShuffledDeck(variant, game.seed);
  const notes = players.map(() =>
    Array.from({ length: deck.length + variant.suits.length }, () => ""),
  );
  for (const note of record.notes) {
    const playerNotes = notes[note.seat];
    if (
      playerNotes === undefined
      || note.order < 0
      || note.order >= playerNotes.length
    ) {
      logger.error(`Ignoring an invalid note position in exported game ${id}.`);
      continue;
    }
    playerNotes[note.order] = note.note;
  }
  const trimmedNotes = notes.map((row: readonly string[]) => {
    let { length } = row;
    while (length > 0 && row[length - 1] === "") {
      length--;
    }
    return row.slice(0, length);
  });
  const options = {
    ...(game.startingPlayer !== 0 && { startingPlayer: game.startingPlayer }),
    ...(variant.name !== DEFAULT_VARIANT_NAME && { variant: variant.name }),
    ...(game.timed && {
      timed: true,
      timeBase: game.timeBase,
      timePerTurn: game.timePerTurn,
    }),
    ...(game.speedrun && { speedrun: true }),
    ...(game.cardCycle && { cardCycle: true }),
    ...(game.deckPlays && { deckPlays: true }),
    ...(game.emptyClues && { emptyClues: true }),
    ...(game.oneExtraCard && { oneExtraCard: true }),
    ...(game.oneLessCard && { oneLessCard: true }),
    ...(game.allOrNothing && { allOrNothing: true }),
    ...(game.detrimentalCharacters && { detrimentalCharacters: true }),
  };
  const characters = game.detrimentalCharacters
    ? players.map((player) => ({
        name:
          player.characterAssignment === -1
            ? ""
            : getCharacter(player.characterAssignment).name,
        metadata: player.characterMetadata - 1,
      }))
    : undefined;
  return await reply.send({
    id,
    players: players.map((player) => player.name),
    deck,
    actions,
    ...(Object.keys(options).length > 0 && { options }),
    ...(trimmedNotes.some((row: readonly string[]) => row.length > 0) && {
      notes: trimmedNotes,
    }),
    ...(characters !== undefined && { characters }),
    // An arbitrary deck cannot be imported with a seed that reconstructs a different order.
    ...(record.customDeck === undefined && { seed: game.seed }),
  });
}
