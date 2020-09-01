package main

const (
	SeedSort = "score DESC, id ASC"
)

// commandHistoryGetSeed is sent when the user clicks on the "Compare Scores" button
//
// Example data:
// {
//   seed: 'p2v0s1',
// }
func commandHistoryGetSeed(s *Session, d *CommandData) {
	if d.Seed == "" {
		s.Warning("You must provide a seed.")
		return
	}

	// Check for non-ASCII characters
	if !containsAllPrintableASCII(d.Seed) {
		s.Warning("Seeds can only contain ASCII characters.")
		return
	}

	// Validate that it does not have any special characters
	if !isAlphanumericHyphen(d.Seed) {
		s.Warning("Seeds can only contain letters, numbers, and hyphens.")
		return
	}

	// Get the list of game IDs played on this seed
	var gameIDs []int
	if v, err := models.Games.GetGameIDsSeed(d.Seed); err != nil {
		logger.Error("Failed to get the game IDs for seed \""+d.Seed+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}

	// Get the history for these game IDs
	// (with a custom sort by score)
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistoryCustomSort(gameIDs, SeedSort); err != nil {
		logger.Error("Failed to get the history:", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameHistoryList = v
	}

	type GameHistoryOtherScoresMessage struct {
		Games   []*GameHistory `json:"games"`
		Friends bool           `json:"friends"`
	}
	s.Emit("gameHistoryOtherScores", &GameHistoryOtherScoresMessage{
		Games:   gameHistoryList,
		Friends: d.Friends,
	})
}
