import type { GameID, UserID } from "@hanabi-live/data";
import type { EngineState } from "../engine/types";

export interface Game {
  state: EngineState;
  databaseID: GameID;
  revision: number;
  datetimeStarted: Date;
  datetimeFinished: Date | undefined;
  clocks: number[];
  duration: number;
  turnElapsed: number;
  idleRemaining: number;
  clockAnchor: number;
  pausePlayerIndex: number;
  queuedPauses: boolean[];
  notes: string[][];
  tags: Array<{ userID: UserID; tag: string }>;
  requests: Array<{ userID: UserID; id: string }>;
  replaySegment: number;
  spectatorNotes?: Array<{ userID: UserID; name: string; notes: string[] }>;
  replayControls?: {
    hypothetical: boolean;
    actions: string[];
    showDrawnCards: boolean;
    efficiency: number;
  };
}
