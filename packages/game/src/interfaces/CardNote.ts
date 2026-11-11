import type { SuitRankTuple } from "../types/SuitRankTuple.ts";

export interface CardNote {
  /** The possible card identities included in the note (or an empty array if there are none). */
  readonly possibilities: readonly SuitRankTuple[];

  readonly knownTrash: boolean;
  readonly needsFix: boolean;
  readonly questionMark: boolean;
  readonly exclamationMark: boolean;
  readonly spook: boolean;
  readonly chopMoved: boolean;
  readonly finessed: boolean;
  readonly discardPermission: boolean;
  readonly blank: boolean;
  readonly unclued: boolean;
  readonly clued: boolean;
  readonly text: string;
}
