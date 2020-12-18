package commands

/*
// commandTagDelete is sent when a user types the "/tagdelete [tag]" command
//
// Example data:
// {
//   tableID: 123,
//   msg: 'inverted priority finesse',
// }
func commandTagDelete(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if !t.Running {
		s.Warning(NotStartedFail)
		return
	}

	// Sanitize, validate, and normalize the tag
	if v, err := sanitizeTag(d.Msg); err != nil {
		// sanitizeTag returns a properly formatted error for the end-user
		s.Warning(err.Error())
		return
	} else {
		d.Msg = v
	}

	tagDelete(ctx, s, d, t)
}

func tagDelete(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if !t.Replay {
		// See if the tag exists
		if _, ok := g.Tags[d.Msg]; ok {
			delete(g.Tags, d.Msg)

			// Send them an acknowledgement via private message to avoid spoiling information about
			// the ongoing game
			msg := fmt.Sprintf("Successfully deleted the tag of: %v", d.Msg)
			chatServerSendPM(s, msg, d.Room)
		} else {
			s.Warningf("The tag of \"%v\" does not exist on this game yet.", d.Msg)
		}
		return
	}

	// Get the existing tags from the database
	var tags []string
	if v, err := models.GameTags.GetAll(t.ExtraOptions.DatabaseID); err != nil {
		hLog.Errorf(
			"Failed to get the tags from the database for game %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	// Ensure that the tag exists
	if !stringInSlice(d.Msg, tags) {
		s.Warningf("The tag of \"%v\" does not exist on this game yet.", d.Msg)
		return
	}

	// Delete it from the database
	if err := models.GameTags.Delete(t.ExtraOptions.DatabaseID, d.Msg); err != nil {
		hLog.Errorf(
			"Failed to delete a tag for game ID %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	}

	msg := fmt.Sprintf("%v has deleted a game tag of: %v", s.Username, d.Msg)
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}
*/
