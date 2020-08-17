import Status from './Status';

export default interface User {
  userID: number;
  name: string;
  status: Status;
  tableID: number;
  inactive: boolean;
}
