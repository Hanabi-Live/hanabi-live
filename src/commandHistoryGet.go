/*
	Sent when the user clicks the "Show More History" button
	"data" example:
	{
		offset: 10,
		amount: 10,
	}
*/

package main

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

	// Send the user's entire game history
	var history []*GameHistory
	if v, err := models.Games.GetUserHistory(s.UserID(), d.Offset, d.Amount, false); err != nil {
		logger.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)
	s.NotifyGameHistory(history, false)
}
