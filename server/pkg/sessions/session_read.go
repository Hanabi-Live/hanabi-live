package sessions

import (
	"context"
	"errors"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/commands"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"nhooyr.io/websocket"
)

// read is the function that handles reading data from a session.
// It is meant to be run in a new goroutine.
func (s *session) read(m *Manager) {
	// This will block until the connection is closed
	err := s.waitForIncomingMsgs(s.ctx, m)
	s.passBackErrorAndDelete(m, err)
}

func (s *session) waitForIncomingMsgs(ctx context.Context, m *Manager) error {
	// Block until messages are received on the WebSocket connection
	for {
		var msg string
		if messageType, v, err := s.conn.Read(s.ctx); err != nil {
			return fmt.Errorf("failed to read from a WebSocket connection: %w", err)
		} else if messageType != websocket.MessageText {
			return fmt.Errorf(
				"received a WebSocket message of a type that was not text: %v",
				messageType,
			)
		} else {
			msg = string(v)
		}

		if rateLimitIncomingMsg(ctx, m, s) {
			return errors.New("banned because of rate limiting")
		}

		// Find out if they sent a coherent WebSocket message
		if commandName, commandData, err := unpackMsg(msg); err != nil {
			m.logger.Warnf(
				"%v sent an invalid WebSocket message: %v",
				util.PrintUserCapitalized(s.userID, s.username),
				err,
			)
			m.NotifyError(s.userID, "That is an invalid WebSocket message.")
		} else {
			// This is a coherent message; forward it along to the command manager
			sessionData := &commands.SessionData{
				UserID:   s.userID,
				Username: s.username,
				Muted:    s.data.muted,
			}
			m.Dispatcher.Commands.Send(sessionData, commandName, commandData)
		}
	}
}
