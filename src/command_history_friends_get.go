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

	// Get the history for the range that they specified
	var history []*GameHistory
	if v, err := models.Games.GetFriendsHistory(s.Friends(), d.Offset, d.Amount, false); err != nil {
		logger.Error("Failed to get the history for the friends of user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}

	s.Emit("gameHistoryFriends", &history)
}
