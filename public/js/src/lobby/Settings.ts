export default class Settings {
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
    createTableBaseTimeMinutes: number = 2;
    createTableTimePerTurnSeconds: number = 10;
    createTableSpeedrun: boolean = false;
    createTableCardCycle: boolean = false;
    createTableDeckPlays: boolean = false;
    createTableEmptyClues: boolean = false;
    createTableCharacterAssignments: boolean = false;
    createTableAlertWaiters: boolean = false;

    [key: string]: boolean | number | string;
}
