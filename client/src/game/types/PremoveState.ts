import ClientAction from './ClientAction';

export default interface PremoveState {
  action: ClientAction | null;
  cluedCardOrder: number | null;
}
