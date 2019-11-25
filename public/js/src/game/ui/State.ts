export default class State {
    log: Array<any> = []; // TODO set to action log message object
    deck: Array<any> = []; // TODO set to simple card object
    deckSize: number = 0;
    score: number = 0;
    maxScore: number = 0;
    clueTokens: number = 8;
    doubleDiscard: boolean = false;
    strikes: number = 0;
    pace: number = 0;
    currentPlayerIndex: number = 0;
    hands: Array<Array<number>> = [];
    playStacks: Array<Array<number>> = [];
    playStacksDirections: Array<number> = [];
    discardStacks: Array<Array<number>> = [];
    clues: Array<any> = []; // TODO set to simple clue objects
}
