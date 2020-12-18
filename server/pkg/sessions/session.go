package sessions

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"nhooyr.io/websocket"
)

type session struct {
	ctx  context.Context
	conn *websocket.Conn
	ip   string

	userID   int
	username string

	status         int
	tableID        uint64
	friends        map[int]struct{}
	reverseFriends map[int]struct{}
	hyphenated     bool
	inactive       bool
	muted          bool

	rateLimitAllowance float64
	rateLimitLastCheck time.Time

	errChannel  chan error
	sendChannel chan string // The messages sent to the remote user
}

// read is the function that handles reading data from a session.
// It is meant to be run in a new goroutine.
func (s *session) read(m *Manager) {
	// This will block until the connection is closed
	err := s.waitForIncomingMsgs(s.ctx, m)

	// Send the error to the function that initiated the session
	s.errChannel <- err

	// Put in a request to clean up the session
	m.Delete(s)
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
		if command, data, err := unpackMsg(msg); err != nil {
			m.logger.Warnf(
				"%v sent an invalid WebSocket message: %v",
				util.PrintUserCapitalized(s.userID, s.username),
				err,
			)
			m.NotifyError(s.userID, "That is an invalid WebSocket message.")
		} else {
			// This is a coherent message; forward it along to the command manager
			m.Dispatcher.Commands.Send(s.userID, command, data)
		}
	}
}

// write is the function that handles writing data from a session.
// It is meant to be run in a new goroutine.
func (s *session) write(m *Manager) {
	// This will block until the connection is closed
	err := s.waitForOutgoingMsgs()

	// Send the error to the function that initiated the session
	s.errChannel <- err

	// Put in a request to clean up the session
	m.Delete(s)
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

func logSession(m *Manager, userID int, username string, connected bool) {
	var verb string
	if connected {
		verb = "connected"
	} else {
		verb = "disconnected"
	}

	m.logger.Infof(
		"%v %v; %v user(s) now connected.",
		util.PrintUserCapitalized(userID, username),
		verb,
		len(m.sessions),
	)
}
