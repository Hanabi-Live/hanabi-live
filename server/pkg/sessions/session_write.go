package sessions

import (
	"context"

	"nhooyr.io/websocket"
)

// write is the function that handles writing data from a session.
// It is meant to be run in a new goroutine.
func (s *session) write(m *Manager) {
	// This will block until the connection is closed
	err := s.waitForOutgoingMsgs()
	s.passBackErrorAndDelete(m, err)
}

func (s *session) waitForOutgoingMsgs() error {
	// Block until messages are sent on the outgoing channel
	for {
		select {
		case msg := <-s.sendChannel:
			if err := writeToConnWithTimeout(s.ctx, s.conn, msg); err != nil {
				return err
			}
		case <-s.ctx.Done():
			return s.ctx.Err()
		}
	}
}

func writeToConnWithTimeout(ctx context.Context, conn *websocket.Conn, msg string) error {
	// https://golang.org/pkg/context/#WithTimeout
	ctx, cancel := context.WithTimeout(ctx, writeTimeoutLength)
	defer cancel()

	return conn.Write(ctx, websocket.MessageText, []byte(msg))
}
