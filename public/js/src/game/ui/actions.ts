// Imports
import MsgClue from './MsgClue';

// Action is a message sent to the server that represents the in-game action that we just took
export interface Action {
    type: number,
    target: number,
    clue?: MsgClue,
}

export interface ActionDraw {
    type: string,
    who: number,
    rank: number,
    suit: number,
    order: number,
}

export interface ActionStatus {
    type: string,
    clues: number,
    score: number,
    maxScore: number,
    doubleDiscard: boolean,
}

export interface ActionStackDirections {
    type: string,
    directions: Array<number>,
}

export interface ActionText {
    type: string,
    text: string,
}

export interface ActionTurn {
    type: string,
    num: number,
    who: number,
}

export interface ActionClue {
    type: string,
    clue: MsgClue,
    giver: number,
    list: Array<number>,
    target: number,
    turn: number,
}

export interface ActionPlay {
    type: string,
    which: Which,
}

export interface ActionDiscard {
    type: string,
    failed: boolean,
    which: Which,
}

export interface ActionReorder {
    type: string,
    target: number,
    handOrder: Array<number>,
}

export interface ActionStrike {
    type: string,
    num: number, // 1 for the first strike, 2 for the second strike, etc.
    order: number, // The order of the card that was misplayed
    turn: number,
}

export interface ActionDeckOrder {
    type: string,
    deck: Array<SimpleCard>,
}

interface Which {
    index: number,
    suit: number,
    rank: number,
    order: number,
}

interface SimpleCard {
    suit: number,
    rank: number,
}
