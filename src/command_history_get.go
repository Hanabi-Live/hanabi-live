package main

// commandHistoryGet is sent when the user clicks the "Show More History" button
//
// Example data:
// {
//   offset: 10,
//   amount: 10,
// }
func commandHistoryGet(s *Session, d *CommandData) {
	// Validate that they sent a valid offset and amount value
	if d.Offset < 0 {
		s.Warning("That is not a valid start value.")
		return
	}
	if d.Amount < 0 {
		s.Warning("That is not a valid end value.")
		return
	}

	// Get the history for the range that they specified
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetUserHistory(s.UserID(), d.Offset, d.Amount); err != nil {
		logger.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		gameHistoryList = v
	}

	s.Emit("gameHistory", &gameHistoryList)
}
