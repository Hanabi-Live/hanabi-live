import Status from "./Status";

export default interface User {
  userID: number;
  username: string;
  status: Status;
  tableID: number;
  hyphenated: boolean;
  inactive: boolean;
}
