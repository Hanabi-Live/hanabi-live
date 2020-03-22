/*
	Sent when the user clicks the "Show More History" button.
	Data is empty.
*/

package main

func commandHistoryGetAll(s *Session, d *CommandData) {
	// Send the user's entire game history
	var history []*GameHistory
	if v, err := models.Games.GetUserHistory(s.UserID(), 0, 0, true); err != nil {
		logger.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)
	s.NotifyGameHistory(history, false)
}
