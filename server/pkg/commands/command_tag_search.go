package commands

/*
// commandTagSearch is sent when a user types the "/tagsearch [tag]" command
//
// Example data:
// {
//   msg: 'inverted priority finesse',
// }
func commandTagSearch(ctx context.Context, s *Session, d *CommandData) {
	// Sanitize, validate, and normalize the tag
	if v, err := sanitizeTag(d.Msg); err != nil {
		// sanitizeTag returns a properly formatted error for the end-user
		s.Warning(err.Error())
		return
	} else {
		d.Msg = v
	}

	// Search through the database for games matching this tag
	var gameIDs []int
	if v, err := models.GameTags.SearchByTag(d.Msg); err != nil {
		hLog.Errorf(
			"Failed to search for games in the database matching a tag of \"%v\": %v",
			d.Msg,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}

	gameIDStrings := make([]string, 0)
	for _, gameID := range gameIDs {
		gameIDStrings = append(gameIDStrings, strconv.Itoa(gameID))
	}

	// Send the results via a private message as to not spam public channels
	msg := fmt.Sprintf("Games matching tag \"%v\": %v", d.Msg, strings.Join(gameIDStrings, ", "))
	chatServerSendPM(s, msg, d.Room)
}
*/
