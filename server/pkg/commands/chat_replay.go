package commands

/*
// /suggest
func chatSuggest(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Validate that they only sent one argument
	if len(d.Args) != 1 {
		msg := "The format of the /suggest command is: /suggest [turn]"
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Validate that the argument is an integer
	arg := d.Args[0]
	if _, err := strconv.Atoi(arg); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(arg, 64); err != nil {
			msg = fmt.Sprintf("\"%v\" is not an integer.", arg)
		} else {
			msg = "The /suggest command only accepts integers."
		}
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// The logic for this command is handled client-side
}

// /tags
func chatTags(ctx context.Context, s *Session, d *CommandData, t *Table) {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, "lobby", d.NoTablesLock)
		return
	}

	if !t.Replay {
		chatServerSend(ctx, NotReplayFail, d.Room, d.NoTablesLock)
		return
	}

	// Get the tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(t.ExtraOptions.DatabaseID); err != nil {
		hLog.Errorf(
			"Failed to get the tags for game ID %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	if len(tags) == 0 {
		msg := "There are not yet any tags for this game."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// We don't have to worry about doing a case-insensitive sort since all the tags should be
	// lowercase
	sort.Strings(tags)

	msg := "The list of tags for this game are as follows:"
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	for i, tag := range tags {
		msg := fmt.Sprintf("%v) %v", i+1, tag)
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
	}
}
*/
