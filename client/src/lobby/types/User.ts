import Status from './Status';

export default interface User {
  id: number;
  name: string;
  status: Status;
  table: number;
  inactive: boolean;
}
