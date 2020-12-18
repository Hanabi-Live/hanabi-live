package commands

/*
// commandChatPlayerInfo is sent when a user types the "/playerinfo" command
//
// Example data:
// {
//   name: 'Alice',
// }
func commandChatPlayerInfo(ctx context.Context, s *Session, d *CommandData) {
	normalizedUsername := normalizeString(d.Name)

	// Validate that this person exists in the database
	var user User
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		hLog.Errorf(
			"Failed to validate that \"%v\" exists in the database: %v",
			normalizedUsername,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else if !exists {
		s.Warningf("The username of \"%v\" does not exist in the database.", d.Name)
		return
	} else {
		user = v
	}

	var numGames int
	if v, err := models.Games.GetUserNumGames(user.ID, false); err != nil {
		hLog.Errorf(
			"Failed to get the number of non-speedrun games for player \"%v\": %v",
			d.Name,
			err,
		)
		s.Error("Something went wrong when getting the stats. Please contact an administrator.")
		return
	} else {
		numGames = v
	}

	msg := fmt.Sprintf(
		"\"%v\" has played %v non-speedrun games. More stats <a href=\"/scores/%v\" target=\"_blank\" rel=\"noopener noreferrer\">here</a>.",
		d.Name,
		numGames,
		d.Name,
	)
	chatServerSendPM(s, msg, d.Room)
}
*/
