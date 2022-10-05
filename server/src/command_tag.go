package main

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Hanabi-Live/hanabi-live/logger"
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
		msg := "Successfully added a tag of \"" + d.Msg + "\"."
		chatServerSendPM(s, msg, d.Room)
		return
	}

	// Get the existing tags of that user from the database
	var tags []string
	if v, err := models.GameTags.GetAllByUserID(t.ExtraOptions.DatabaseID, s.UserID); err != nil {
		logger.Error("Failed to get the tags for game ID " +
			strconv.Itoa(t.ExtraOptions.DatabaseID) + ": " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	} else {
		tags = v
	}

	// Ensure that this tag does not already exist
	for _, tag := range tags {
		if tag == d.Msg {
			s.Warning("You have already tagged this game with \"" + d.Msg + "\".")
			return
		}
	}

	// Add it to the database
	if err := models.GameTags.Insert(t.ExtraOptions.DatabaseID, s.UserID, d.Msg); err != nil {
		logger.Error("Failed to insert a tag for game ID " +
			strconv.Itoa(t.ExtraOptions.DatabaseID) + ": " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	msg := s.Username + " has added a game tag of \"" + d.Msg + "\"."
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
}

func sanitizeTag(tag string) (string, error) {
	// Validate tag length
	if len(tag) > MaxTagLength {
		return tag, errors.New("Tags cannot be longer than " + strconv.Itoa(MaxTagLength) + " characters.")
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(tag)) {
		return tag, errors.New("Tags must contain valid UTF8 characters.") // nolint: golint, stylecheck
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
		return tag, errors.New("Tags cannot be blank.") // nolint: golint, stylecheck
	}

	return normalizeString(tag), nil
}
