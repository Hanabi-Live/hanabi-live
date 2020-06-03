// These are per-user settings that are changed from the main lobby screen
// (in the "Settings" button tooltip)
export default class Settings {
  desktopNotification: boolean = false;
  soundMove: boolean = true;
  soundTimer: boolean = true;
  keldonMode: boolean = false;
  colorblindMode: boolean = false;
  realLifeMode: boolean = false;
  reverseHands: boolean = false;
  styleNumbers: boolean = false;
  showTimerInUntimed: boolean = false;
  volume: number = 50;
  speedrunPreplay: boolean = false;
  speedrunMode: boolean = false;
  hyphenatedConventions: boolean = false;
  createTableVariant: string = 'No Variant';
  createTableTimed: boolean = false;
  createTableTimeBaseMinutes: number = 2;
  createTableTimePerTurnSeconds: number = 10;
  createTableSpeedrun: boolean = false;
  createTableCardCycle: boolean = false;
  createTableDeckPlays: boolean = false;
  createTableEmptyClues: boolean = false;
  createTableOneExtraCard: boolean = false;
  createTableOneLessCard: boolean = false;
  createTableAllOrNothing: boolean = false;
  createTableDetrimentalCharacters: boolean = false;
  createTableAlertWaiters: boolean = false;
}
