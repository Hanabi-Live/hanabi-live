export default interface Settings {
    soundMove: boolean,
    soundTimer: boolean,
    keldonMode: boolean,
    colorblindMode: boolean,
    realLifeMode: boolean,
    reverseHands: boolean,
    styleNumbers: boolean,
    showTimerInUntimed: boolean,
    volume: number,
    speedrunPreplay: boolean,
    speedrunMode: boolean,
    hyphenatedConventions: boolean,
    createTableVariant: string,
    createTableTimed: boolean,
    createTableBaseTimeMinutes: number,
    createTableTimePerTurnSeconds: number,
    createTableSpeedrun: boolean,
    createTableCardCycle: boolean,
    createTableDeckPlays: boolean,
    createTableEmptyClues: boolean,
    createTableCharacterAssignments: boolean,
    createTableAlertWaiters: boolean,

    [key: string]: boolean | number | string,
}

export class SettingsDefault implements Settings {
    soundMove = true;
    soundTimer = true;
    keldonMode = false;
    colorblindMode = false;
    realLifeMode = false;
    reverseHands = false;
    styleNumbers = false;
    showTimerInUntimed = false;
    volume = 50;
    speedrunPreplay = false;
    speedrunMode = false;
    hyphenatedConventions = false;
    createTableVariant = 'No Variant';
    createTableTimed = false;
    createTableBaseTimeMinutes = 2;
    createTableTimePerTurnSeconds = 10;
    createTableSpeedrun = false;
    createTableCardCycle = false;
    createTableDeckPlays = false;
    createTableEmptyClues = false;
    createTableCharacterAssignments = false;
    createTableAlertWaiters = false;

    [key: string]: boolean | number | string;
}
