interface Table {
    id: number,
    name: string,
    password: boolean,
    joined: boolean,
    numPlayers: number,
    owned: boolean,
    running: boolean,
    variant: string, // e.g. "No Variant"
    timed: boolean,
    baseTime: number,
    timePerTurn: number,
    ourTurn: boolean,
    sharedReplay: boolean,
    progress: number,
    players: string, // e.g. "Zamiel, DuneAught"
    spectators: string,
}
