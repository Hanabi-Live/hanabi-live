export interface Character {
  readonly name: string;
  readonly id: number;
  readonly description: string;
  readonly emoji: string;
  readonly writeMetadataToDatabase?: boolean;
  readonly not2P?: boolean;
}
