package sessions

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"nhooyr.io/websocket"
)

type newData struct {
	ctx      context.Context
	conn     *websocket.Conn
	userID   int
	username string
	ip       string

	errChannel chan error
}

// New will request a new session.
// It will block until an error is received (e.g. the connection closes).
func (m *Manager) New(
	ctx context.Context,
	conn *websocket.Conn,
	userID int,
	username string,
	ip string,
) error {
	errChannel := make(chan error)

	if err := m.newRequest(requestTypeNew, &newData{
		ctx:        ctx,
		conn:       conn,
		userID:     userID,
		username:   username,
		ip:         ip,
		errChannel: errChannel,
	}); err != nil {
		return err
	}

	return <-errChannel
}

func (m *Manager) new(data interface{}) {
	var d *newData
	if v, ok := data.(*newData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Check if there are any existing WebSocket sessions associated with this user ID
	if s, ok := m.sessions[d.userID]; ok {
		// This user already has a WebSocket session open;
		// manually close the existing session before establishing a new session
		m.delete(&deleteData{
			userID:   s.userID,
			username: s.username,
		})
	}

	// Instantiate a session that contains the underlying WebSocket connection
	s := &session{
		ctx:  d.ctx,
		conn: d.conn,
		ip:   d.ip,

		userID:   d.userID,
		username: d.username,

		status:   constants.StatusLobby,
		tableID:  0,
		inactive: false,

		// data contains mutable fields that are initialized from the database
		data: &sessionData{
			friends:        make(map[int]struct{}),
			reverseFriends: make(map[int]struct{}),
			hyphenated:     false,
			muted:          false,
		},

		rateLimitAllowance: incomingMsgRateAmount,
		rateLimitLastCheck: time.Now(),

		// The session becomes initialized once we queried data from the database and sent out the
		// welcome message
		initialized: false,
		errChannel:  d.errChannel,
		sendChannel: make(chan string, outgoingMsgMaxQueued),
	}

	// Add it to the session map
	m.sessions[s.userID] = s
	s.logConnected(m, true)

	// Make a list of every connected user
	userList := make([]*user, 0)
	for _, s2 := range m.sessions {
		userList = append(userList, makeUser(s2))
	}

	// Before we start reading from and writing to the WebSocket connection, we want to send them
	// a welcome message that contains various initialization data
	// In a new goroutine, start to gather data from the database so that we can eventually
	// initialize the session
	go s.initialize(m, userList)

	// Alert everyone that a user has logged in
	m.notifyAllUser(s)
}
