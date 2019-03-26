package main

import (
	"database/sql"
	"strconv"
)

var (
	fastestTimes             = make(map[string][]int)
	officialSpeedrunVariants = []string{
		"No Variant",
		"Six Suits",
		"Black (6 Suits)",
		"Rainbow (6 Suits)",
		"Dark Rainbow (6 Suits)",
	}
)

func speedrunInit() {
	for _, variant := range officialSpeedrunVariants {
		fastestTimes[variant] = make([]int, 6)
		perfectScore := 5 * len(variants[variant].Suits) // Assuming 5 points per stack
		for numPlayers := 2; numPlayers <= 5; numPlayers++ {
			if v, err := db.Games.GetFastestTime(
				variants[variant].ID,
				numPlayers,
				perfectScore,
			); err == sql.ErrNoRows {
				fastestTimes[variant][numPlayers] = 60 * 60 // Default to 1 hour
			} else if err != nil {
				log.Fatal("Failed to get the fastest time for variant \""+variant+"\" "+
					"with "+strconv.Itoa(numPlayers)+":", err)
				return
			} else {
				fastestTimes[variant][numPlayers] = v
			}
		}
	}
}
