export default interface Character {
  readonly name: string;
  readonly id: number;
  readonly description: string;
  readonly emoji: string;
  readonly not2p?: boolean;
}
