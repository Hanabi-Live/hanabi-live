import { gameID } from "@hanabi-live/data";
import { getCharacters } from "@hanabi-live/game";
import { ActionRejected } from "./engine/types";
import type { Table } from "./interfaces/Table";
import { models } from "./models";
import type { ReplaySpecification } from "./replayImport";
import {
  historicalReplaySpecification,
  parseReplaySpecification,
} from "./replayImport";
import type { prepareTableOptions } from "./tableOptions";

type TableOptions = NonNullable<ReturnType<typeof prepareTableOptions>>;

export async function prepareCustomGame(
  prepared: TableOptions,
  gameJSON: unknown,
): Promise<TableOptions & { extraOptions: Table["extraOptions"] }> {
  let specification: ReplaySpecification | undefined;
  let customDeckIsShuffled = false;
  if (prepared.replay !== undefined) {
    const record = await models.replays.get(prepared.replay.databaseID);
    if (record === undefined) {
      throw new ActionRejected("That game ID does not exist in the database.");
    }
    if (prepared.replay.turn >= record.game.numTurns) {
      throw new ActionRejected(
        `Game #${record.game.id} only has ${record.game.numTurns} turns.`,
      );
    }
    specification = historicalReplaySpecification(record);
    customDeckIsShuffled = record.customDeck !== undefined;
    // The database's -1 character ID denotes the debug "n/a" character.
    specification = {
      ...specification,
      setup: {
        ...specification.setup,
        characters: specification.setup.characters?.map((character) => ({
          ...character,
          name: character.name === "" ? "n/a" : character.name,
        })),
      },
    };
  } else if (gameJSON !== undefined && gameJSON !== null) {
    specification = parseReplaySpecification(gameJSON);
  }
  if (specification?.setup.options.detrimentalCharacters === true) {
    const characters = getCharacters();
    if (
      specification.setup.characters?.some(
        (character) =>
          character.name !== "n/a"
          && characters.every((known) => known.name !== character.name),
      ) === true
    ) {
      throw new ActionRejected(
        "Live custom games require valid character assignments that can be saved.",
      );
    }
  }
  const extraOptions: Table["extraOptions"] = {
    databaseID: gameID.parse(-1),
    noWriteToDatabase: false,
    jsonReplay: false,
    restarted: false,
    setSeedSuffix: prepared.seed,
    setReplay: prepared.replay !== undefined,
    setReplayTurn: prepared.replay?.turn ?? 0,
    ...(specification !== undefined && {
      customNumPlayers: specification.setup.options.numPlayers,
      customCharacterAssignments: specification.setup.characters,
      customSeed: specification.customSeed,
      customDeck: specification.setup.deck,
      ...(customDeckIsShuffled && { customDeckIsShuffled }),
      customActions: specification.actions,
    }),
  };
  return {
    ...prepared,
    options: specification?.setup.options ?? prepared.options,
    extraOptions,
  };
}
