package main

import (
	"context"
	"html"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

const PMHistoryMaxAmount = 100

type ChatPMHistoryData struct {
	List    []ChatLogPMHistoryMessage `json:"list"`
	HasMore bool                      `json:"hasMore"`
	Room    string                    `json:"room,omitempty"`
}

func commandChatPMHistoryGet(_ context.Context, s *Session, d *CommandData) {
	if s == nil {
		return
	}

	if d.Amount < 1 || d.Amount > PMHistoryMaxAmount {
		s.Warning("Private message history amount must be between 1 and 100.")
		return
	}

	peerID := 0
	if d.HistoryUsername != "" {
		normalizedUsername := normalizeString(d.HistoryUsername)
		exists, user, err := models.Users.GetUserFromNormalizedUsername(normalizedUsername)
		if err != nil {
			logger.Error(
				"Failed to get the private message history user \"" +
					normalizedUsername + "\": " + err.Error(),
			)
			s.Error(DefaultErrorMsg)
			return
		}
		if !exists {
			s.Warning("User \"" + html.EscapeString(d.HistoryUsername) + "\" does not exist.")
			return
		}
		peerID = user.ID
	}

	list, hasMore, err := models.ChatLogPM.GetHistory(
		s.UserID,
		d.Amount,
		d.BeforeID,
		peerID,
	)
	if err != nil {
		logger.Error("Failed to get private message history: " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	s.Emit("chatPMHistory", &ChatPMHistoryData{
		List:    list,
		HasMore: hasMore,
		Room:    d.Room,
	})
}
