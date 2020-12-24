package sessions

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/gin-gonic/gin"
	"nhooyr.io/websocket"
)

type NewData struct {
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

	// History
	LobbyChatHistory   []*models.DBChatMessage
	MotD               string
	GameHistory        []*models.GameHistory
	GameHistoryFriends []*models.GameHistory

	errChannel chan error
}

// New will request a new session.
// It will block until an error is received (e.g. the connection closes).
func (m *Manager) New(d *NewData) error {
	d.errChannel = make(chan error)

	if err := m.newRequest(requestTypeNew, d); err != nil {
		return err
	}

	return <-d.errChannel
}

func (m *Manager) new(data interface{}) {
	var d *NewData
	if v, ok := data.(*NewData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Check if there are any existing WebSocket sessions associated with this user ID
	if s, ok := m.sessions[d.UserID]; ok {
		// This user already has a WebSocket session open;
		// manually close the existing session before establishing a new session
		m.delete(&deleteData{
			userID:   s.userID,
			username: s.username,
		})
	}

	// Create a session
	s := &session{
		ctx:  context.Context(d.Ctx), // Convert the Gin context to a normal context
		conn: d.Conn,

		userID:   d.UserID,
		username: d.Username,
		ip:       d.Ctx.Request.RemoteAddr,

		status:         constants.StatusLobby,
		tableID:        0,
		friends:        d.Friends,
		reverseFriends: d.ReverseFriends,
		hyphenated:     d.Hyphenated,
		muted:          d.Muted,
		inactive:       false,

		rateLimitAllowance: incomingMsgRateAmount,
		rateLimitLastCheck: time.Now(),

		errChannel:  d.errChannel,
		sendChannel: make(chan string, outgoingMsgMaxQueued),
	}

	go s.read(m)  // We need to read from the WebSocket connection
	go s.write(m) // We need to write to the WebSocket connection

	// Add it to the session map
	m.sessions[s.userID] = s
	logSession(m, d.UserID, d.Username, true)

	// Send them a welcome message and the information that they need to initialize the lobby
	m.newSend(d)

	// Alert everyone that a user has logged in
	m.notifyAllUser(s)
}

// newSend sends a new WebSocket user all of the data that they need in order to properly initialize
// the lobby.
func (m *Manager) newSend(d *NewData) {
	m.newSendWelcome(d)
	m.newSendUserList(d)
	m.newSendTableList(d)
	m.newSendChat(d)
	m.newSendHistory(d)
}

// newSendWelcome sends an initial message that contains information about who they are and the
// current state of the server.
func (m *Manager) newSendWelcome(d *NewData) {
	type WelcomeData struct {
		UserID        int               `json:"userID"`
		Username      string            `json:"username"`
		TotalGames    int               `json:"totalGames"`
		Muted         bool              `json:"muted"`
		FirstTimeUser bool              `json:"firstTimeUser"`
		Settings      settings.Settings `json:"settings"`
		Friends       []string          `json:"friends"`

		PlayingAtTables []uint64 `json:"playingAtTables"`

		RandomTableName      string    `json:"randomTableName"`
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
		MaintenanceMode      bool      `json:"maintenanceMode"`
	}
	m.send(d.UserID, "welcome", &WelcomeData{
		// Send the user their corresponding user ID
		UserID: d.UserID,

		// We have to send the username back to the client because they may have logged in with the
		// wrong case, and the client needs to know their exact username or various bugs will occur
		Username: d.Username,

		TotalGames:    d.TotalGames,    // Shown in the nav bar on the history page
		FirstTimeUser: d.FirstTimeUser, // First time users get a quick tutorial
		Muted:         d.Muted,         // Some users are muted (as a resulting of spamming, etc.)

		// The various client settings are stored server-side so that users can seamlessly
		// transition between computers
		Settings: d.Settings,
		Friends:  d.FriendsList,

		// Inform the user if they were previously playing a game
		// (so that they can choose to rejoin it)
		PlayingAtTables: d.PlayingAtTables,

		// Provide them with a random table name
		// (which will be used by default on the first table that they create)
		RandomTableName: m.Dispatcher.Core.GetRandomTableName(),

		// Also let the user know if the server is currently restarting or shutting down
		ShuttingDown:         m.Dispatcher.Core.ShuttingDown(),
		DatetimeShutdownInit: m.Dispatcher.Core.DatetimeShutdownInit(),
		MaintenanceMode:      m.Dispatcher.Core.MaintenanceMode(),
	})
}

// newSendUserList sends a "userList" message that contains info for every user.
// (This is much more performant than sending N "user" messages.)
func (m *Manager) newSendUserList(d *NewData) {
	userList := make([]*user, 0)
	for _, s := range m.sessions {
		userList = append(userList, makeUser(s))
	}
	m.send(d.UserID, "userList", userList)
}

// newSendTableList sends a "tableList" message that contains info for every table.
// (This is much more performant than sending N "table" messages.)
func (m *Manager) newSendTableList(d *NewData) {
	// TODO REMOVE BLOCKING
	playingAtTables, _ := m.Dispatcher.Tables.GetUserTables(userID)

	tableList := m.Dispatcher.Tables.GetTables() // Blocking on a disparate server component
	m.send(d.UserID, "tableList", tableList)
}

// newSendChat sends the chat history for the lobby.
// (But only the last N games to prevent wasted bandwidth.)
func (m *Manager) newSendChat(d *NewData) {
	// Send the past N chat messages from the lobby
	m.chatSendHistoryFromDatabase(d.UserID, "lobby", d.LobbyChatHistory)

	// Send them a message about the Discord server
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>."
	m.chatSendServerMsg(d.UserID, msg, "lobby")

	// Send them the message of the day, if any
	if len(d.MotD) > 0 {
		m.chatSendServerMsg(d.UserID, d.MotD, "lobby")
	}
}

// newSendHistory sends the user's game history.
// (But only the last N games to prevent wasted bandwidth.)
func (m *Manager) newSendHistory(d *NewData) {
	m.send(d.UserID, "gameHistory", &d.GameHistory)

	if len(d.FriendsList) > 0 {
		m.send(d.UserID, "gameHistoryFriends", &d.GameHistoryFriends)
	}
}
