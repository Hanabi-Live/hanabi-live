export default interface GameHistory {
    id: number,
    numPlayers: number,
    numSimilar: number,
    otherPlayerNames: string,
    score: number,
    datetime: number,
    variant: string,
    incrementNumGames: boolean,
    you: boolean,
}
