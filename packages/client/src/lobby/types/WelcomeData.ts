import { Settings } from "./Settings";

export interface WelcomeData {
  userID: number;
  username: string;
  totalGames: number;
  muted: boolean;
  firstTimeUser: boolean;
  settings: Settings;
  friends: string[];

  playingAtTables: number[];
  disconSpectatingTable: number;
  disconShadowingSeat: number;

  randomTableName: string;
  shuttingDown: boolean;
  datetimeShutdownInit: string;
  maintenanceMode: boolean;
}
