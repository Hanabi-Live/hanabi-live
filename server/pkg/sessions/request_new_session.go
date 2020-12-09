package sessions

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/gin-gonic/gin"
	"nhooyr.io/websocket"
)

type NewSessionData struct {
	Ctx  *gin.Context
	Conn *websocket.Conn

	// Data that will be attached to the session
	UserID         int
	Username       string
	Muted          bool
	Friends        map[int]struct{}
	ReverseFriends map[int]struct{}
	Hyphenated     bool

	// Other stats
	FirstTimeUser bool
	TotalGames    int
	Settings      settings.Settings
	FriendsList   []string

	// Information about their current activity
	PlayingAtTables       []uint64
	DisconSpectatingTable uint64

	errChannel chan error
}

// NewSession is a helper function for requesting a new session
// It will block until an error is received (e.g. the connection closes)
func (m *Manager) NewSession(data *NewSessionData) error {
	errChannel := make(chan error)

	data.errChannel = errChannel
	m.requests <- &request{
		Type: requestTypeNewSession,
		Data: data,
	}

	return <-errChannel
}

func newSession(m *Manager, rawData interface{}) {
	var data *NewSessionData
	if v, ok := rawData.(*NewSessionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
	}

	// Check if there are any existing WebSocket sessions associated with this user ID
	if s, ok := m.sessions[data.UserID]; ok {
		// This user already has a WebSocket session open;
		// manually close the existing session before establishing a new session
		deleteSession(m, &deleteSessionData{
			userID:   s.userID,
			username: s.username,
		})
	}

	// Create a session
	s := &session{
		ctx:  context.Context(data.Ctx), // Convert the Gin context to a normal context
		conn: data.Conn,

		userID:   data.UserID,
		username: data.Username,
		ip:       data.Ctx.Request.RemoteAddr,

		status:         constants.StatusLobby,
		tableID:        uint64(0),
		friends:        data.Friends,
		reverseFriends: data.ReverseFriends,
		hyphenated:     data.Hyphenated,
		muted:          data.Muted,
		inactive:       false,

		rateLimitAllowance: incomingMsgRateAmount,
		rateLimitLastCheck: time.Now(),

		errChannel:  data.errChannel,
		sendChannel: make(chan []byte, outgoingMsgMaxQueued),
	}

	// Add it to the session map
	m.sessions[s.userID] = s
	logSession(m, data.UserID, data.Username, true)

	go s.read(m)  // We need to read from the WebSocket connection
	go s.write(m) // We need to write to the WebSocket connection
}
