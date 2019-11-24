export default interface ActionStrike {
    type: string,
    num: number, // 1 for the first strike, 2 for the second strike, etc.
    order: number, // The order of the card that was misplayed
    turn: number,
}
