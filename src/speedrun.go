package main

import (
	"strconv"
)

var (
	fastestTimes             = make(map[string][]int)
	officialSpeedrunVariants = []string{
		"No Variant",
		"6 Suits",
		"Black (6 Suits)",
		"Rainbow (6 Suits)",
		"Dark Rainbow (6 Suits)",
	}
)

func speedrunInit() {
	for _, variant := range officialSpeedrunVariants {
		// Speedrun times are tracked for 2 to 5-players in each variant
		// (e.g. we need to do "fastestTimes[variant][5]")
		fastestTimes[variant] = make([]int, 6)
		maxScore := 5 * len(variants[variant].Suits) // Assuming 5 points per stack
		for numPlayers := 2; numPlayers <= 5; numPlayers++ {
			if v, err := models.Games.GetFastestTime(
				variants[variant].ID,
				numPlayers,
				maxScore,
			); err != nil {
				logger.Fatal("Failed to get the fastest time for variant \""+variant+"\" "+
					"with "+strconv.Itoa(numPlayers)+" players:", err)
				return
			} else {
				fastestTimes[variant][numPlayers] = v
			}
		}
	}
}
