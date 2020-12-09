package commands

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

const (
	MaxTagLength = 100
)

// commandTag is sent when a user types the "/tag [tag]" command
//
// Example data:
// {
//   tableID: 123,
//   msg: 'inverted priority finesse',
// }
func commandTag(ctx context.Context, s *Session, d *CommandData) {
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

	tag(ctx, s, d, t)
}

func tag(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if !t.Replay {
		// Store the tag temporarily until the game ends,
		// at which point we will write it to the database
		g.Tags[d.Msg] = s.UserID

		// Send them an acknowledgement via private message to avoid spoiling information about the
		// ongoing game
		msg := fmt.Sprintf("Successfully added a tag of: %v", d.Msg)
		chatServerSendPM(s, msg, d.Room)
		return
	}

	// Get the existing tags from the database
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

	// Ensure that this tag does not already exist
	for _, tag := range tags {
		if tag == d.Msg {
			s.Warningf("This game has already been tagged with: %v", d.Msg)
			return
		}
	}

	// Add it to the database
	if err := models.GameTags.Insert(t.ExtraOptions.DatabaseID, s.UserID, d.Msg); err != nil {
		hLog.Errorf(
			"Failed to insert a tag in the database for game %v: %v",
			t.ExtraOptions.DatabaseID,
			err,
		)
		s.Error(DefaultErrorMsg)
		return
	}

	msg := fmt.Sprintf("%v has added a game tag of: %v", s.Username, d.Msg)
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}

func sanitizeTag(tag string) (string, error) {
	// Validate tag length
	if len(tag) > MaxTagLength {
		err := fmt.Errorf("Tags cannot be longer than %v characters.", MaxTagLength)
		return tag, err
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(tag)) {
		err := errors.New("Tags must contain valid UTF8 characters.")
		return tag, err
	}

	// Replace any whitespace that is not a space with a space
	tag2 := tag
	for _, letter := range tag2 {
		if unicode.IsSpace(letter) && letter != ' ' {
			tag = strings.ReplaceAll(tag, string(letter), " ")
		}
	}

	// Trim whitespace from both sides
	tag = strings.TrimSpace(tag)

	// Validate blank tags
	if tag == "" {
		err := errors.New("Tags cannot be blank.")
		return tag, err
	}

	return normalizeString(tag), nil
}
