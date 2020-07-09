// ClientAction is a message sent to the server that represents the in-game action that we just took
export interface ClientAction {
  type: ActionType;
  target: number;
  value?: number;
}

export enum ActionType {
  Play = 0,
  Discard = 1,
  ColorClue = 2,
  RankClue = 3,
  GameOver = 4,
}
