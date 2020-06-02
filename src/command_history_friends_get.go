package main

// commandHistoryFriendsGet is sent when the user clicks the "Show More History" button
// (on the "Show History of Friends" screen)
//
// Example data:
// {
//   offset: 10,
//   amount: 10,
// }
func commandHistoryFriendsGet(s *Session, d *CommandData) {
	// Validate that they sent a valid offset and amount value
	if d.Offset < 0 {
		s.Warning("That is not a valid start value.")
		return
	}
	if d.Amount < 0 {
		s.Warning("That is not a valid end value.")
		return
	}

	// Get the list of friend game IDs for the range that they specified
	var gameIDs []int
	if v, err := models.Games.GetGameIDsFriends(
		s.UserID(),
		s.Friends(),
		d.Offset,
		d.Amount,
	); err != nil {
		logger.Error("Failed to get the friend game IDs for user \""+s.Username()+"\":", err)
		return
	} else {
		gameIDs = v
	}

	// Get the history for these game IDs
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history:", err)
		return
	} else {
		gameHistoryList = v
	}

	s.Emit("gameHistoryFriends", &gameHistoryList)
}
