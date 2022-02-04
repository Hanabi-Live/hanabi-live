package main

import (
	"context"
	"strconv"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

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
		logger.Error("Failed to validate that \"" + normalizedUsername + "\" " +
			"exists in the database: " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	} else if !exists {
		msg := "The username of \"" + d.Name + "\" does not exist in the database."
		chatServerSendPM(s, msg, d.Room)
		return
	} else {
		user = v
	}

	var numGames int
	if v, err := models.Games.GetUserNumGames(user.ID, false); err != nil {
		logger.Error("Failed to get the number of non-speedrun games for player " +
			"\"" + d.Name + "\": " + err.Error())
		s.Error("Something went wrong when getting stats. Please contact an administrator.")
		return
	} else {
		numGames = v
	}

	msg := "\"" + d.Name + "\" has played " + strconv.Itoa(numGames) + " non-speedrun games. " +
		"More stats " +
		"<a href=\"/scores/" + d.Name + "\" target=\"_blank\" rel=\"noopener noreferrer\">" +
		"here</a>."
	chatServerSendPM(s, msg, d.Room)
}
