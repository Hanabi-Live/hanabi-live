// Chat-related subroutines

package main

/*

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

// chatServerSendAll is a helper function to broadcast a message to everyone on the server,
// whether they are in the lobby or in the middle of a game
// It is assumed that the tables mutex is locked when calling this function
func chatServerSendAll(ctx context.Context, msg string) {
	chatServerSend(ctx, msg, constants.Lobby, false)

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
		Username:  WebsiteName,
		Msg:       msg,
		Room:      room,
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Recipient: s.Username,
	})
}

*/
