import type { Status } from "./Status";

export interface User {
  userID: number;
  name: string;
  status: Status;
  tableID: number;
  hyphenated: boolean;
  inactive: boolean;
}
