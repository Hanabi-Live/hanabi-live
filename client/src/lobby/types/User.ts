import Status from './Status';

export default interface User {
  id: number;
  name: string;
  status: Status;
  tableID: number;
  inactive: boolean;
}
