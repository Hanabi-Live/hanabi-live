import ActionType from './ActionType';

// ClientAction is a message sent to the server that represents the in-game action that we just took
export default interface ClientAction {
  type: ActionType;
  target: number;
  value?: number;
}
