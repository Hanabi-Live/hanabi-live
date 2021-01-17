import { ChatListData } from "../../commands";
import GameHistory from "./GameHistory";
import Settings from "./Settings";
import Table from "./Table";
import User from "./User";

export default interface WelcomeData {
  // Static data
  userID: number;
  username: string;

  // Dynamic data
  friendsList: string[];
  muted: boolean;

  // Other
  firstTimeUser: boolean;
  settings: Settings;
  playingAtTables: number[];
  totalGames: number;
  randomTableName: string;

  // Server status
  shuttingDown: boolean;
  datetimeShutdownInit: string;
  maintenanceMode: boolean;

  // Lobby initialization
  userList: User[];
  chatList: ChatListData;
  tableList: Table[];
  gameHistory: GameHistory[];
  gameHistoryFriends: GameHistory[];
}
