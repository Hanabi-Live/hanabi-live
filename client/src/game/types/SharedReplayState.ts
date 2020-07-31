export default interface SharedReplayState {
  readonly segment: number;
  readonly useSharedSegments: boolean;
  readonly leader: string;
  readonly amLeader: boolean;
}
