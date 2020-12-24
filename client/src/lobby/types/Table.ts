export default interface Table {
  id: number;
  name: string;
  passwordProtected: boolean;
  numPlayers: number;
  running: boolean;
  variantName: string; // e.g. "No Variant"
  timed: boolean;
  timeBase: number;
  timePerTurn: number;
  ourTurn: boolean;
  sharedReplay: boolean;
  progress: number;
  players: string[]; // e.g. ['Alice', 'Bob']
  spectators: string;
}
