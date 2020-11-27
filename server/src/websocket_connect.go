package main

import (
	"io/ioutil"
	"net"
	"os"
	"path"
	"strings"
	"time"

	melody "gopkg.in/olahol/melody.v1"
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
	PlayingInOngoingGameTableID uint64
	SpectatingTableID           uint64
	SpectatingDatabaseID        int
}

// websocketConnect is fired when a new Melody WebSocket session is established
// This is the third step of logging in; users will only get here if authentication was successful
func websocketConnect(ms *melody.Session) {
	sessionID, userID, username, success := websocketGetKeyValues(ms)
	if !success {
		return
	}

	logger.Debug("Entered the \"websocketConnect()\" function for user: " + username)

	// First, perform all the expensive database retrieval to gather the data we need
	// We want to do this before we start locking any mutexes (to minimize the lock time)
	data := websocketConnectGetData(ms, userID, username)

	// Create the new session object
	s := NewSession()
	s.ms = ms
	s.SessionID = sessionID
	s.UserID = userID
	s.Username = username
	s.Muted = data.Muted
	s.Data.Friends = data.Friends
	s.Data.ReverseFriends = data.ReverseFriends
	s.Data.Hyphenated = data.Hyphenated

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	logger.Debug("Acquiring session connection write lock for user: " + s.Username)
	sessionConnectMutex.Lock()
	logger.Debug("Acquired session connection write lock for user: " + s.Username)
	defer sessionConnectMutex.Unlock()

	// Disconnect any existing connections with this user ID
	logger.Debug("Acquiring sessions read lock for user: " + s.Username)
	sessionsMutex.RLock()
	logger.Debug("Acquired sessions read lock for user: " + s.Username)
	s2, ok := sessions[s.UserID]
	sessionsMutex.RUnlock()
	logger.Debug("Released sessions read lock for user: " + s.Username)
	if ok {
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
		websocketDisconnectRemoveFromGames(s2)
	}

	// Add the connection to a session map so that we can keep track of all of the connections
	logger.Debug("Acquiring sessions write lock for user: " + s.Username)
	sessionsMutex.Lock()
	logger.Debug("Acquired sessions write lock for user: " + s.Username)
	sessions[s.UserID] = s
	sessionsMutex.Unlock()
	logger.Debug("Released sessions write lock for user: " + s.Username)
	logger.Info("User \""+s.Username+"\" connected;", len(sessions), "user(s) now connected.")

	// Now, send some additional information to them
	websocketConnectWelcomeMessage(s, data)
	websocketConnectUserList(s)
	websocketConnectTableList(s)
	websocketConnectChat(s)
	websocketConnectHistory(s)
	if len(data.Friends) > 0 {
		websocketConnectHistoryFriends(s)
	}

	// Alert everyone that a new user has logged in
	notifyAllUser(s)
}

func websocketConnectGetData(ms *melody.Session, userID int, username string) *WebsocketConnectData {
	data := &WebsocketConnectData{
		Friends:        make(map[int]struct{}),
		ReverseFriends: make(map[int]struct{}),
	}

	// -----------------------------------------
	// Data that will be attached to the session
	// -----------------------------------------

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(ms.Request.RemoteAddr); err != nil {
		logger.Error("Failed to parse the IP address from \""+ms.Request.RemoteAddr+"\":", err)
		return data
	} else {
		ip = v
	}

	// Check to see if their IP is muted
	if v, err := models.MutedIPs.Check(ip); err != nil {
		logger.Error("Failed to check to see if the IP \""+ip+"\" is muted:", err)
		return data
	} else {
		data.Muted = v
	}

	// Get their friends
	if v, err := models.UserFriends.GetMap(userID); err != nil {
		logger.Error("Failed to get the friends map for user \""+username+"\":", err)
		return data
	} else {
		data.Friends = v
	}

	// Get their reverse friends
	if v, err := models.UserReverseFriends.GetMap(userID); err != nil {
		logger.Error("Failed to get the reverse friends map for user \""+username+"\":", err)
		return data
	} else {
		data.ReverseFriends = v
	}

	// Get whether or not they are a member of the Hyphen-ated group
	if v, err := models.UserSettings.IsHyphenated(userID); err != nil {
		logger.Error("Failed to get the Hyphen-ated setting for user \""+username+"\":", err)
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
		logger.Error("Failed to get the join date for user \""+username+"\":", err)
		return data
	} else {
		datetimeCreated = v
	}
	data.FirstTimeUser = time.Since(datetimeCreated) < 10*time.Second

	// Get their total number of games played from the database
	if v, err := models.Games.GetUserNumGames(userID, true); err != nil {
		logger.Error("Failed to get the number of games played for user \""+username+"\":", err)
		return data
	} else {
		data.TotalGames = v
	}

	// Get their settings from the database
	if v, err := models.UserSettings.Get(userID); err != nil {
		logger.Error("Failed to get the settings for user \""+username+"\":", err)
		return data
	} else {
		data.Settings = v
	}

	// Get their friends from the database
	if v, err := models.UserFriends.GetAllUsernames(userID); err != nil {
		logger.Error("Failed to get the friends for user \""+username+"\":", err)
		return data
	} else {
		data.FriendsList = v
	}

	// ----------------------------------------
	// Information about their current activity
	// ----------------------------------------

	// Check to see if they are currently playing in an ongoing game
	logger.Debug("Acquiring tables read lock for user: " + username)
	tablesMutex.RLock()
	logger.Debug("Acquired tables read lock for user: " + username)
	for _, t := range tables {
		if t.Replay {
			continue
		}

		playerIndex := t.GetPlayerIndexFromID(userID)
		if playerIndex != -1 {
			data.PlayingInOngoingGameTableID = t.ID
			break
		}
	}
	tablesMutex.RUnlock()
	logger.Debug("Released tables read lock for user: " + username)

	// Check to see if they are were spectating in a shared replay before they disconnected
	// (games that they are playing in take priority over shared replays)
	if data.PlayingInOngoingGameTableID != 0 {
		logger.Debug("Acquiring tables read lock for user: " + username)
		tablesMutex.RLock()
		logger.Debug("Acquired tables read lock for user: " + username)
		for _, t := range tables {
			if !t.Replay {
				continue
			}

			for id := range t.DisconSpectators {
				if id != userID {
					continue
				}

				data.SpectatingTableID = t.ID
				data.SpectatingDatabaseID = t.ExtraOptions.DatabaseID
				break
			}
		}
		tablesMutex.RUnlock()
		logger.Debug("Released tables read lock for user: " + username)
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

		PlayingInOngoingGameTableID uint64 `json:"playingInOngoingGameTableID"`
		SpectatingTableID           uint64 `json:"spectatingTableID"`
		SpectatingDatabaseID        int    `json:"spectatingDatabaseID"`

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
		PlayingInOngoingGameTableID: data.PlayingInOngoingGameTableID,
		SpectatingTableID:           data.SpectatingTableID,
		SpectatingDatabaseID:        data.SpectatingDatabaseID,

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
	userMessageList := make([]*UserMessage, 0)
	logger.Debug("Acquiring sessions read lock for user: " + s.Username)
	sessionsMutex.RLock()
	logger.Debug("Acquired sessions read lock for user: " + s.Username)
	for _, s2 := range sessions {
		userMessageList = append(userMessageList, makeUserMessage(s2))
	}
	sessionsMutex.RUnlock()
	logger.Debug("Released sessions read lock for user: " + s.Username)
	s.Emit("userList", userMessageList)
}

// websocketConnectTableList sends a "tableList" message
// (this is much more performant than sending an individual "table" message for every table)
func websocketConnectTableList(s *Session) {
	tableMessageList := make([]*TableMessage, 0)
	logger.Debug("Acquiring tables read lock for user: " + s.Username)
	tablesMutex.RLock()
	logger.Debug("Acquired tables read lock for user: " + s.Username)
	for _, t := range tables {
		if t.Visible {
			tableMessageList = append(tableMessageList, makeTableMessage(s, t))
		}
	}
	tablesMutex.RUnlock()
	logger.Debug("Released tables read lock for user: " + s.Username)
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
		Msg:      msg,
		Server:   true,
		Datetime: time.Now(),
		Room:     "lobby",
	})

	// Send them the message of the day, if any
	motdPath := path.Join(projectPath, "motd.txt")
	exists := true
	if _, err := os.Stat(motdPath); os.IsNotExist(err) {
		exists = false
	} else if err != nil {
		logger.Error("Failed to check if the \""+motdPath+"\" file exists:", err)
		exists = false
	}
	if exists {
		if fileContents, err := ioutil.ReadFile(motdPath); err != nil {
			logger.Error("Failed to read the \""+motdPath+"\" file:", err)
		} else {
			motd := string(fileContents)
			motd = strings.TrimSpace(motd)
			if len(motd) > 0 {
				msg := "[Server Notice] " + motd
				s.Emit("chat", &ChatMessage{
					Msg:      msg,
					Server:   true,
					Datetime: time.Now(),
					Room:     "lobby",
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
		logger.Error("Failed to get the game IDs for user \""+s.Username+"\":", err)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history:", err)
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
		logger.Error("Failed to get the friend game IDs for user \""+s.Username+"\":", err)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryFriendsList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history:", err)
		return
	} else {
		gameHistoryFriendsList = v
	}
	s.Emit("gameHistoryFriends", &gameHistoryFriendsList)
}
