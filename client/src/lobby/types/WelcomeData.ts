import Settings from "./Settings";

export default interface WelcomeData {
  userID: number;
  username: string;
  totalGames: number;
  muted: boolean;
  firstTimeUser: boolean;
  settings: Settings;
  friends: string[];
  playingInOngoingGameTableID: number;
  spectatingTableID: number;
  spectatingDatabaseID: number;
  randomTableName: string;
  shuttingDown: boolean;
  maintenanceMode: boolean;
}
