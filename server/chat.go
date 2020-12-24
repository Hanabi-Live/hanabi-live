// Chat-related subroutines

package main

import (
	"context"
	"time"
)

// chatServerSend is a helper function to send a message from the server
// (e.g. to give feedback to a user after they type a command,
// to notify that the server is shutting down, etc.)
func chatServerSend(ctx context.Context, msg string, room string, noTablesLock bool) {
	commandChat(ctx, nil, &CommandData{ // nolint: exhaustivestruct
		Msg:          msg,
		Room:         room,
		Server:       true,
		NoTableLock:  true,
		NoTablesLock: noTablesLock,
	})
}

// chatServerSendAll is a helper function to broadcast a message to everyone on the server,
// whether they are in the lobby or in the middle of a game
// It is assumed that the tables mutex is locked when calling this function
func chatServerSendAll(ctx context.Context, msg string) {
	chatServerSend(ctx, msg, "lobby", false)

	tableList := tables.GetList(true)
	roomNames := make([]string, 0)
	for _, t := range tableList {
		t.Lock(ctx)
		roomNames = append(roomNames, t.GetRoomName())
		t.Unlock(ctx)
	}

	for _, roomName := range roomNames {
		chatServerSend(ctx, msg, roomName, false)
	}
}

// chatServerSendPM is for sending non-public messages to specific users
func chatServerSendPM(s *Session, msg string, room string) {
	s.Emit("chat", &ChatMessage{
		Msg:       msg,
		Who:       WebsiteName,
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Room:      room,
		Recipient: s.Username,
	})
}
