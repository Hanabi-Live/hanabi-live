import {
  cardOrder,
  colorIndex,
  playerIndex,
  rankClueNumber,
} from "@hanabi-live/game";
import { z } from "zod";
import { DatabaseGameActionType } from "../enums/DatabaseGameActionType";

const databaseGameActionPlay = z
  .object({
    type: z.literal(DatabaseGameActionType.Play),
    target: cardOrder,
    value: z.literal(0), // 0 is used as a null value.
  })
  .strict()
  .readonly();

const databaseGameActionDiscard = z
  .object({
    type: z.literal(DatabaseGameActionType.Discard),
    target: cardOrder,
    value: z.literal(0), // 0 is used as a null value.
  })
  .strict()
  .readonly();

const databaseGameActionColorClue = z
  .object({
    type: z.literal(DatabaseGameActionType.ColorClue),
    target: playerIndex,
    value: colorIndex,
  })
  .strict()
  .readonly();

const databaseGameActionRankClue = z
  .object({
    type: z.literal(DatabaseGameActionType.RankClue),
    target: playerIndex,
    value: rankClueNumber,
  })
  .strict()
  .readonly();

const databaseGameActionGameOver = z
  .object({
    type: z.literal(DatabaseGameActionType.GameOver),
    target: playerIndex.or(z.literal(-1)),
    value: rankClueNumber,
  })
  .strict()
  .readonly();

/**
 * Corresponds to a row in the "game_actions" table in the database. The fields are described in the
 * "database_schema.sql" file.
 */
export const databaseGameAction = z.union([
  databaseGameActionPlay,
  databaseGameActionDiscard,
  databaseGameActionColorClue,
  databaseGameActionRankClue,
  databaseGameActionGameOver,
]);
