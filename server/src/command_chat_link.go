package main

import (
	"context"
	"github.com/Hanabi-Live/hanabi-live/logger"
	"strings"
)

func commandChatLinked(ctx context.Context, s *Session, d *CommandData) {
	var usernames []string
	if val, err := models.UserLinkages.GetAllLinkedUsernames(s.UserID); err != nil {
		logger.Error("Failed to retrieve linked usernames for user " + s.Username)
		s.Error(DefaultErrorMsg)
		return
	} else {
		usernames = val
	}
	var msg string
	if len(usernames) == 0 {
		msg = "Currently, you do not have any linked accounts."
	} else {
		msg = "Currently linked accounts: " + strings.Join(usernames, ", ")
	}
	chatServerSendPM(s, msg, d.Room)
}

func commandChatLink(ctx context.Context, s *Session, d *CommandData) {
	link(s, d, true)
}

func commandChatUnlink(ctx context.Context, s *Session, d *CommandData) {
	link(s, d, false)
}

// This function is very similar to the friend function in command_chat_friend.go
func link(s *Session, d *CommandData, add bool) {
	// Validate that they sent a username
	if len(d.Name) == 0 {
		var msg string
		if add {
			msg = "The format of the /link command is: /link [username]"
		} else {
			msg = "The format of the /unlink command is: /unlink [username]"
		}
		s.Warning(msg)
		return
	}

	normalizedUsername := normalizeString(d.Name)

	// Validate that they did not target themselves
	if normalizedUsername == normalizeString(s.Username) {
		var verb string
		if add {
			verb = "link"
		} else {
			verb = "unlink"
		}
		s.Warning("You cannot " + verb + " yourself.")
		return
	}

	// Validate that this person exists in the database
	var linkedUser User
	if exists, v, err := models.Users.GetUserFromNormalizedUsername(
		normalizedUsername,
	); err != nil {
		logger.Error("Failed to validate that \"" + normalizedUsername + "\" " +
			"exists in the database: " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	} else if !exists {
		s.Warning("The username of \"" + d.Name + "\" does not exist in the database.")
		return
	} else {
		linkedUser = v
	}

	var isLinked bool
	if val, err := models.UserLinkages.isLinked(s.UserID, linkedUser.ID); err != nil {
		logger.Error("Failed to whether " + s.Username + " has linked " + linkedUser.Username + ": " + err.Error())
	} else {
		isLinked = val
	}

	var msg string
	if add {
		// Validate that this user is not already their linked_user
		if isLinked {
			s.Warning("\"" + d.Name + "\" is already linked to your account.")
			return
		}

		// Add the linked_user
		if err := models.UserLinkages.Insert(s.UserID, linkedUser.ID); err != nil {
			logger.Error("Failed to insert a new linked user for user " +
				"\"" + s.Username + "\": " + err.Error())
			s.Error(DefaultErrorMsg)
			return
		}

		msg = "Successfully added \"" + d.Name + "\" to your linked users."
	} else {
		// Validate that this user is their linked_user
		if !isLinked {
			s.Warning("\"" + d.Name + "\" is not linked to your account, so you cannot unlink them.")
			return
		}

		// Remove the linked_user
		if err := models.UserLinkages.Delete(s.UserID, linkedUser.ID); err != nil {
			logger.Error("Failed to delete a linked user for user \"" + s.Username + "\": " +
				err.Error())
			s.Error(DefaultErrorMsg)
			return
		}

		msg = "Successfully removed \"" + d.Name + "\" from your linked users."
	}
	chatServerSendPM(s, msg, d.Room)
}
