package sessions

import (
	"context"
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"path"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
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

	// Information about their current activity
	PlayingAtTables []uint64

	// History
	LobbyChatHistory   []*models.DBChatMessage
	GameHistory        []*models.GameHistory
	GameHistoryFriends []*models.GameHistory

	errChannel chan error
}

// New will request a new session.
// It will block until an error is received (e.g. the connection closes).
func (m *Manager) New(data *NewData) error {
	if m.requestsClosed.IsSet() {
		return errors.New("impending server termination")
	}

	errChannel := make(chan error)

	data.errChannel = errChannel
	m.requests <- &request{
		Type: requestTypeNew,
		Data: data,
	}

	return <-errChannel
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
		tableID:        uint64(0),
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
	m.newSendInit(d)

	// Alert everyone that a user has logged in
	m.NotifyAllUser(s.userID)
}

func (m *Manager) newSendInit(d *NewData) {
	m.newSendInitWelcome(d)
	m.newSendInitUserList(d)
	m.newSendInitTableList(d)
	m.newSendInitChat(d)
	m.newSendInitHistory(d)
	if len(d.Friends) > 0 {
		m.newSendInitHistoryFriends(d)
	}
}

// newSendInitWelcome sends an initial message that contains information about who they are and the
// current state of the server.
func (m *Manager) newSendInitWelcome(d *NewData) {
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

		// We also send the total amount of games that they have played
		// (to be shown in the nav bar on the history page)
		TotalGames: d.TotalGames,

		Muted:         d.Muted,         // Some users are muted (as a resulting of spamming, etc.)
		FirstTimeUser: d.FirstTimeUser, // First time users get a quick tutorial

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

// newSendInitUserList sends a "userList" message that contains info for every user.
// (This is much more performant than sending N "user" messages.)
func (m *Manager) newSendInitUserList(d *NewData) {
	userList := make([]*User, 0)
	for _, s := range m.sessions {
		userList = append(userList, makeUser(s))
	}
	m.send(d.UserID, "userList", userList)
}

// newSendInitTableList sends a "tableList" message that contains info for every table.
// (This is much more performant than sending N "table" messages.)
func (m *Manager) newSendInitTableList(d *NewData) {
	tableList := m.Dispatcher.Tables.GetTables(d.UserID) // Blocking on a disparate server component
	m.send(d.UserID, "tableList", tableList)
}

// newSendInitHistory sends the chat history for the lobby.
// (But only the last N games to prevent wasted bandwidth.)
func (m *Manager) newSendInitChat(d *NewData) {
	// Send the past N chat messages from the lobby
	m.chatSendHistoryFromDatabase(d.UserID, "lobby", d.LobbyChatHistory)

	// Send them a message about the Discord server
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>."
	m.send(d.UserID, "chat", &ChatData{
		Msg:       msg,
		Who:       "",
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Room:      "lobby",
		Recipient: "",
	})

	// Send them the message of the day, if any
	motdPath := path.Join(projectPath, "motd.txt")
	exists := true
	if _, err := os.Stat(motdPath); os.IsNotExist(err) {
		exists = false
	} else if err != nil {
		hLog.Errorf("Failed to check if the \"%v\" file exists: %v", motdPath, err)
		exists = false
	}
	if exists {
		if fileContents, err := ioutil.ReadFile(motdPath); err != nil {
			hLog.Errorf("Failed to read the \"%v\" file: %v", motdPath, err)
		} else {
			motd := string(fileContents)
			motd = strings.TrimSpace(motd)
			if len(motd) > 0 {
				msg := fmt.Sprintf("[Server Notice] %v", motd)
				s.Emit("chat", &ChatMessage{
					Msg:       msg,
					Who:       "",
					Discord:   false,
					Server:    true,
					Datetime:  time.Now(),
					Room:      "lobby",
					Recipient: "",
				})
			}
		}
	}
}

// newSendInitHistory sends the user's game history.
// (But only the last N games to prevent wasted bandwidth.)
func (m *Manager) newSendInitHistory(d *NewData) {
	var gameIDs []int
	s.Emit("gameHistory", &gameHistoryList)
}

// newSendInitHistoryFriends sends the game history of the user's friends.
// (But only the last N games to prevent wasted bandwidth.)
func (m *Manager) newSendInitHistoryFriends(d *NewData) {
	var gameIDs []int
	if v, err := models.Games.GetGameIDsFriends(s.UserID, s.Friends(), 0, 10); err != nil {
		hLog.Errorf(
			"Failed to get the friend game IDs for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryFriendsList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		hLog.Errorf("Failed to get the history: %v", err)
		return
	} else {
		gameHistoryFriendsList = v
	}
	s.Emit("gameHistoryFriends", &gameHistoryFriendsList)
}
