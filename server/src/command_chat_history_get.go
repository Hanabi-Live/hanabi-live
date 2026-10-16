package main

import (
	"context"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

const ChatHistoryMaxAmount = 100

// commandChatHistoryGet serves authenticated clients with persisted lobby history.
// Only the lobby is queryable; the client cannot enumerate table or PM history.
func commandChatHistoryGet(_ context.Context, s *Session, d *CommandData) {
	if s == nil {
		return
	}
	if d.Amount < 1 || d.Amount > ChatHistoryMaxAmount {
		s.Warning("Lobby chat history amount must be between 1 and 100.")
		return
	}
	if d.BeforeID < 0 {
		s.Warning("Lobby chat history cursor must be a positive message ID.")
		return
	}

	rows, hasMore, err := models.ChatLog.GetHistory("lobby", d.Amount, d.BeforeID)
	if err != nil {
		logger.Error("Failed to get lobby chat history: " + err.Error())
		s.Error(DefaultErrorMsg)
		return
	}

	s.Emit("chatHistory", &ChatHistoryData{
		List:    lobbyHistoryToWire("lobby", rows),
		HasMore: hasMore,
	})
}
