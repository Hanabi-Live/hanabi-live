package main

import (
	"context"
	"net"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/gabstv/melody"
)

type WebsocketConnectData struct {
	// Data that will be attached to the session
	Muted          bool
	Friends        map[int]struct{}
	ReverseFriends map[int]struct{}
	Hyphenated     bool

	// Other stats
	FirstTimeUser bool
	TotalGames    int
	Settings      Settings
	FriendsList   []string

	// Information about their current activity
	PlayingAtTables       []uint64
	DisconSpectatingTable uint64
	DisconShadowingSeat   int
}

// websocketConnect is fired when a new Melody WebSocket session is established
// This is the third step of logging in; users will only get here if authentication was successful
func websocketConnect(ms *melody.Session) {
	sessionID, userID, username, success := websocketGetKeyValues(ms)
	if !success {
		return
	}

	logger.Info("Entered the \"websocketConnect()\" function for user: " + username)

	// Create the new session object
	s := NewSession()
	s.ms = ms
	s.SessionID = sessionID
	s.UserID = userID
	s.Username = username
	// (we attach other data later)

	ctx := NewSessionContext(s)

	// Next, perform all the expensive database retrieval to gather the data we need
	// We want to do this before we start locking any mutexes (to minimize the lock time)
	data := websocketConnectGetData(ctx, ms, userID, username)

	// Attach the new data to the session object
	s.Muted = data.Muted
	s.Data.Friends = data.Friends
	s.Data.ReverseFriends = data.ReverseFriends
	s.Data.Hyphenated = data.Hyphenated

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	sessions.ConnectMutex.Lock()
	defer sessions.ConnectMutex.Unlock()

	// Disconnect any existing connections with this user ID
	if s2, ok := sessions.Get(s.UserID); ok {
		logger.Info("Closing existing connection for user: " + s.Username)
		s2.Error("You have logged on from somewhere else, so you have been disconnected here.")
		if err := s2.ms.Close(); err != nil {
			// This can occasionally fail and we don't want to report the error to Sentry
			logger.Info("Failed to manually close a WebSocket connection.")
		} else {
			logger.Info("Successfully terminated a WebSocket connection.")
		}

		// The connection is now closed,
		// but the disconnection event will be fired in another goroutine
		// Thus, we need to manually clean up the user from the global session map and any ongoing
		// games
		websocketDisconnectRemoveFromMap(s2)
		websocketDisconnectRemoveFromGames(ctx, s2)
	}

	go websocketConnectMessages(ctx, s, data)

	// Add the session to a map so that we can keep track of all of the connected users
	sessions.Set(s.UserID, s)
	logger.Info("User \"" + s.Username + "\" connected; " +
		strconv.Itoa(sessions.Length()) + " user(s) now connected.")

	// Alert everyone that a new user has logged in
	notifyAllUser(s)

	logger.Info("Exited the \"websocketConnect()\" function for user: " + username)
}

func websocketConnectMessages(ctx context.Context, s *Session, data *WebsocketConnectData) {
	// Now, send some additional information to them
	websocketConnectWelcomeMessage(s, data)
	websocketConnectUserList(s)
	websocketConnectTableList(ctx, s)
	websocketConnectChat(s)
	websocketConnectHistory(s)
	if len(data.Friends) > 0 {
		websocketConnectHistoryFriends(s)
	}
}

func websocketConnectGetData(ctx context.Context, ms *melody.Session, userID int, username string) *WebsocketConnectData {
	data := &WebsocketConnectData{ // nolint: exhaustivestruct
		Friends:        make(map[int]struct{}),
		ReverseFriends: make(map[int]struct{}),
	}

	// -----------------------------------------
	// Data that will be attached to the session
	// -----------------------------------------

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(ms.Request.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \"" + ms.Request.RemoteAddr + "\": " +
			err.Error())
		return data
	} else {
		ip = v
	}

	// Check to see if their IP is muted
	if v, err := models.MutedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \"" + ip + "\" is muted: " + err.Error())
		return data
	} else {
		data.Muted = v
	}

	// Get their friends
	if v, err := models.UserFriends.GetMap(userID); err != nil {
		logger.Error("Failed to get the friends map for user \"" + username + "\": " + err.Error())
		return data
	} else {
		data.Friends = v
	}

	// Get their reverse friends
	if v, err := models.UserReverseFriends.GetMap(userID); err != nil {
		logger.Error("Failed to get the reverse friends map for user \"" + username + "\": " +
			err.Error())
		return data
	} else {
		data.ReverseFriends = v
	}

	// Get whether or not they are a member of the Hyphenated group
	if v, err := models.UserSettings.IsHyphenated(userID); err != nil {
		logger.Error("Failed to get the Hyphenated setting for user \"" + username + "\": " +
			err.Error())
		return data
	} else {
		data.Hyphenated = v
	}

	// -----------
	// Other stats
	// -----------

	// Get their join date from the database
	var datetimeCreated time.Time
	if v, err := models.Users.GetDatetimeCreated(userID); err != nil {
		logger.Error("Failed to get the join date for user \"" + username + "\": " + err.Error())
		return data
	} else {
		datetimeCreated = v
	}
	data.FirstTimeUser = time.Since(datetimeCreated) < 10*time.Second

	// Get their total number of games played from the database
	if v, err := models.Games.GetUserNumGames(userID, true); err != nil {
		logger.Error("Failed to get the number of games played for user \"" + username + "\": " +
			err.Error())
		return data
	} else {
		data.TotalGames = v
	}

	// Get their settings from the database
	if v, err := models.UserSettings.Get(userID); err != nil {
		logger.Error("Failed to get the settings for user \"" + username + "\": " + err.Error())
		return data
	} else {
		data.Settings = v
	}

	// Get their friends from the database
	if v, err := models.UserFriends.GetAllUsernames(userID); err != nil {
		logger.Error("Failed to get the friends for user \"" + username + "\": " + err.Error())
		return data
	} else {
		data.FriendsList = v
	}

	// ----------------------------------------
	// Information about their current activity
	// ----------------------------------------

	// We must acquire the tables lock before calling the below functions
	tables.RLock()
	defer tables.RUnlock()

	data.PlayingAtTables = tables.GetTablesUserPlaying(userID)
	if tableID, ok := tables.GetDisconSpectatingTable(userID); ok {
		data.DisconSpectatingTable = tableID
	}
	if shadowingSeat, ok := tables.GetDisconShadowingSeat(userID); ok {
		data.DisconShadowingSeat = shadowingSeat
	}

	return data
}

func websocketConnectWelcomeMessage(s *Session, data *WebsocketConnectData) {
	// Send an initial message that contains information about who they are and
	// the current state of the server
	type WelcomeMessage struct {
		UserID        int      `json:"userID"`
		Username      string   `json:"username"`
		TotalGames    int      `json:"totalGames"`
		Muted         bool     `json:"muted"`
		FirstTimeUser bool     `json:"firstTimeUser"`
		Settings      Settings `json:"settings"`
		Friends       []string `json:"friends"`

		PlayingAtTables       []uint64 `json:"playingAtTables"`
		DisconSpectatingTable uint64   `json:"disconSpectatingTable"`
		DisconShadowingSeat   int      `json:"disconShadowingSeat"`

		RandomTableName      string    `json:"randomTableName"`
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
		MaintenanceMode      bool      `json:"maintenanceMode"`
	}
	s.Emit("welcome", &WelcomeMessage{
		// Send the user their corresponding user ID
		UserID: s.UserID,

		// We have to send the username back to the client because they may
		// have logged in with the wrong case, and the client needs to know
		// their exact username or various bugs will occur
		Username: s.Username,

		// We also send the total amount of games that they have played
		// (to be shown in the nav bar on the history page)
		TotalGames: data.TotalGames,

		Muted:         s.Muted,            // Some users are muted (as a resulting of spamming, etc.)
		FirstTimeUser: data.FirstTimeUser, // First time users get a quick tutorial

		// The various client settings are stored server-side so that users can seamlessly
		// transition between computers
		Settings: data.Settings,
		Friends:  data.FriendsList,

		// Inform the user that they were previously playing or spectating a game
		// (so that they can choose to rejoin it)
		PlayingAtTables:       data.PlayingAtTables,
		DisconSpectatingTable: data.DisconSpectatingTable,
		DisconShadowingSeat:   data.DisconShadowingSeat,

		// Provide them with a random table name
		// (which will be used by default on the first table that they create)
		RandomTableName: getName(),

		// Also let the user know if the server is currently restarting or shutting down
		ShuttingDown:         shuttingDown.IsSet(),
		DatetimeShutdownInit: datetimeShutdownInit,
		MaintenanceMode:      maintenanceMode.IsSet(),
	})
}

// websocketConnectUserList sends a "userList" message
// (this is much more performant than sending an individual "user" message for every user)
func websocketConnectUserList(s *Session) {
	sessionList := sessions.GetList()
	userMessageList := make([]*UserMessage, 0)
	for _, s2 := range sessionList {
		userMessageList = append(userMessageList, makeUserMessage(s2))
	}
	s.Emit("userList", userMessageList)
}

// websocketConnectTableList sends a "tableList" message
// (this is much more performant than sending an individual "table" message for every table)
func websocketConnectTableList(ctx context.Context, s *Session) {
	tableList := tables.GetList(true)
	tableMessageList := make([]*TableMessage, 0)
	for _, t := range tableList {
		t.Lock(ctx)
		if t.Visible {
			tableMessageList = append(tableMessageList, makeTableMessage(s, t))
		}
		t.Unlock(ctx)
	}

	s.Emit("tableList", tableMessageList)
}

func websocketConnectChat(s *Session) {
	// Send the past 50 chat messages from the lobby
	if !chatSendPastFromDatabase(s, "lobby", 50) {
		return
	}

	// Send them a message about the Discord server
	msg := "Find teammates and discuss strategy in the " +
		"<a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">" +
		"Discord chat</a>."
	s.Emit("chat", &ChatMessage{
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
		logger.Error("Failed to check if the \"" + motdPath + "\" file exists: " + err.Error())
		exists = false
	}
	if exists {
		if fileContents, err := os.ReadFile(motdPath); err != nil {
			logger.Error("Failed to read the \"" + motdPath + "\" file: " + err.Error())
		} else {
			motd := string(fileContents)
			motd = strings.TrimSpace(motd)
			if len(motd) > 0 {
				msg := "[Server Notice] " + motd
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

// websocketConnectHistory sends the user's game history
// (but only the last 10 games to prevent wasted bandwidth)
func websocketConnectHistory(s *Session) {
	var gameIDs []int
	if v, err := models.Games.GetGameIDsUser(s.UserID, 0, 10); err != nil {
		logger.Error("Failed to get the game IDs for user \"" + s.Username + "\": " + err.Error())
		return
	} else {
		gameIDs = v
	}
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history: " + err.Error())
		return
	} else {
		gameHistoryList = v
	}
	s.Emit("gameHistory", &gameHistoryList)
}

// websocketConnectHistoryFriends sends the game history of the user's friends
// (but only the last 10 games to prevent wasted bandwidth)
func websocketConnectHistoryFriends(s *Session) {
	var gameIDs []int
	if v, err := models.Games.GetGameIDsFriends(s.UserID, s.Friends(), 0, 10); err != nil {
		logger.Error("Failed to get the friend game IDs for user \"" + s.Username + "\": " +
			err.Error())
		return
	} else {
		gameIDs = v
	}
	var gameHistoryFriendsList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history: " + err.Error())
		return
	} else {
		gameHistoryFriendsList = v
	}
	s.Emit("gameHistoryFriends", &gameHistoryFriendsList)
}
