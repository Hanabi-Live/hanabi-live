import type { UserID } from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";

export interface ServerSpectator {
  readonly userID: UserID;
  readonly name: string;
  readonly typing: boolean;
  readonly lastTyped: Date;
  readonly shadowingPlayerIndex?: PlayerIndex | -1;
  readonly shadowingPlayerUsername?: string;
  readonly shadowingPlayerPregameIndex?: PlayerIndex;
  readonly notes: readonly string[];
}
