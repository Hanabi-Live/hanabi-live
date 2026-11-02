import { gameID } from "@hanabi-live/data";
import { numPlayers, rank, suitIndex } from "@hanabi-live/game";
import { z } from "zod";
import { characterAssignment } from "./CharacterAssignment";
import { databaseGameAction } from "./DatabaseGameAction";

const deckCard = z.strictObject({ suitIndex, rank }).readonly();

/** Extra specifications for a table. These are not recorded to the database. */
export const extraOptions = z
  .object({
    /** -1 if an ongoing game. 0 if a JSON replay. */
    databaseID: gameID,

    /** Normal games are written to the database. Replays are not written to the database. */
    noWriteToDatabase: z.boolean(),

    jsonReplay: z.boolean(),

    // Replays have some predetermined values. Some special game types also use these fields (e.g.
    // "!replay" games).
    customNumPlayers: numPlayers.optional(),
    customCharacterAssignments: characterAssignment
      .array()
      .readonly()
      .optional(),
    customSeed: z.string().min(1).optional(),
    customDeck: deckCard.array().readonly().optional(),
    customDeckIsShuffled: z.boolean().optional(),
    customActions: databaseGameAction.array().readonly().optional(),

    /** Whether or not this game was created by clicking "Restart" in a shared replay. */
    restarted: z.boolean(),

    /** Parsed from the game name for "!seed" games. */
    setSeedSuffix: z.string(),

    /** True during "!replay" games. */
    setReplay: z.boolean(),

    /** Parsed from the game name for "!replay" games. */
    setReplayTurn: z.number().int(),
  })
  .strict()
  .readonly();
