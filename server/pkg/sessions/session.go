package sessions

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"nhooyr.io/websocket"
)

type session struct {
	ctx  context.Context
	conn *websocket.Conn
	ip   string

	userID   int
	username string

	status   constants.Status
	tableID  int
	inactive bool

	data *sessionData

	rateLimitAllowance float64
	rateLimitLastCheck time.Time

	initialized bool
	errChannel  chan error
	sendChannel chan string // The messages sent to the remote user
}

type sessionData struct {
	friends        map[int]struct{}
	reverseFriends map[int]struct{}
	hyphenated     bool
	muted          bool
}

func (s *session) logConnected(m *Manager, connected bool) {
	var verb string
	if connected {
		verb = "connected"
	} else {
		verb = "disconnected"
	}

	m.logger.Infof(
		"%v %v; %v user(s) now connected.",
		util.PrintUserCapitalized(s.userID, s.username),
		verb,
		len(m.sessions),
	)
}

func (s *session) passBackErrorAndDelete(m *Manager, err error) {
	// Send the error to the function that initiated the session
	s.errChannel <- err

	// Put in a request to clean up the session
	m.Delete(s)
}
