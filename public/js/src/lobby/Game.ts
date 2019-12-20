export default interface Game {
    name: string,
    players: Array<Player>,
}

interface Player {
    index: number,
    name: string,
    you: boolean,
    present: boolean,
    stats: Stats,
}

interface Stats {
    numGames: number,
    variant: StatsVariant,
}

interface StatsVariant {
    numGames: number,
    bestScores: Array<BestScore>,
    averageScore: number,
    numStrikeouts: number,
}

interface BestScore {
    numPlayers: number,
    score: number,
    modifier: number,
}
