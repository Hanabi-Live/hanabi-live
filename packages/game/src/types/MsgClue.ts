import type { WireClue } from "./HiddenClue";

/** A clue as the server sends it. On the client, the color is a rich object. */
export type MsgClue = Readonly<WireClue>;
