package main

import (
	"io/ioutil"
	"os"
	"path"
	"strconv"
	"strings"
	"time"

	melody "gopkg.in/olahol/melody.v1"
)

type WebsocketConnectData struct {
	TotalGames                  int
	Settings                    Settings
	Friends                     []string
	FirstTimeUser               bool
	PlayingInOngoingGame        bool
	PlayingInOngoingGameTableID uint64
	PlayingInOngoingGameIndex   int
	SpectatingTable             bool
	SpectatingTableID           uint64
}

// websocketConnect is fired when a new Melody WebSocket session is established
// This is the third step of logging in; users will only get here if authentication was successful
func websocketConnect(ms *melody.Session) {
	// Turn the Melody session into a custom session
	s := &Session{ms}

	// First, perform all the expensive database retrieval to gather the data we need
	// We want to do this before we start locking any mutexes (to minimize the lock time)
	data := websocketConnectGetData(s)

	// We only want one computer to connect to one user at a time
	// Use a dedicated mutex to prevent race conditions
	sessionConnectMutex.Lock()
	defer sessionConnectMutex.Unlock()

	// Disconnect any existing connections with this username
	sessionsMutex.RLock()
	s2, ok := sessions[s.UserID()]
	sessionsMutex.RUnlock()
	if ok {
		logger.Info("Closing existing connection for user \"" + s.Username() + "\".")
		s2.Error("You have logged on from somewhere else, so you have been disconnected here.")
		if err := s2.Close(); err != nil {
			logger.Error("Failed to manually close a WebSocket connection.")
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
	sessionsMutex.Lock()
	sessions[s.UserID()] = s
	sessionsMutex.Unlock()

	logger.Info("User \""+s.Username()+"\" connected;", len(sessions), "user(s) now connected.")

	// They have successfully logged in
	// Now, gather some additional information
	websocketConnectWelcomeMessage(s, data)
	websocketConnectUserList(s)
	websocketConnectTableList(s)
	websocketConnectChat(s)
	websocketConnectHistory(s)
	websocketConnectHistoryFriends(s, data.Friends)

	// Alert everyone that a new user has logged in
	// (note that we intentionally send users a message about themselves)
	notifyAllUser(s)

	websocketConnectRejoinOngoingGame(s, data)
	websocketConnectRespectate(s, data)
}

func websocketConnectGetData(s *Session) *WebsocketConnectData {
	data := &WebsocketConnectData{
		Friends: make([]string, 0),
	}

	// Get their total number of games played from the database
	if v, err := models.Games.GetUserNumGames(s.UserID(), true); err != nil {
		logger.Error("Failed to get the number of games played for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return data
	} else {
		data.TotalGames = v
	}

	// Get their settings from the database
	if v, err := models.UserSettings.Get(s.UserID()); err != nil {
		logger.Error("Failed to get the settings for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return data
	} else {
		data.Settings = v
	}

	// Get their friends from the database
	if v, err := models.UserFriends.GetAllUsernames(s.UserID()); err != nil {
		logger.Error("Failed to get the friends for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return data
	} else {
		data.Friends = v
	}

	// Get their join date from the database
	var datetimeCreated time.Time
	if v, err := models.Users.GetDatetimeCreated(s.UserID()); err != nil {
		logger.Error("Failed to get the join date for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return data
	} else {
		datetimeCreated = v
	}
	data.FirstTimeUser = time.Since(datetimeCreated) < 10*time.Second

	// Check to see if they are currently playing in an ongoing game
	tablesMutex.RLock()
	for _, t := range tables {
		if t.Replay {
			continue
		}

		for i, p := range t.Players {
			if p.Name != s.Username() {
				continue
			}

			data.PlayingInOngoingGame = true
			data.PlayingInOngoingGameTableID = t.ID
			data.PlayingInOngoingGameIndex = i
			break
		}
	}
	tablesMutex.RUnlock()

	// Check to see if they are were spectating in a shared replay before they disconnected
	// (games that they are playing in take priority over shared replays)
	if !data.PlayingInOngoingGame {
		tablesMutex.RLock()
		for _, t := range tables {
			if !t.Replay {
				continue
			}

			for id := range t.DisconSpectators {
				if id != s.UserID() {
					continue
				}

				data.SpectatingTable = true
				data.SpectatingTableID = t.ID
				break
			}
		}
		tablesMutex.RUnlock()
	}

	return data
}

func websocketConnectWelcomeMessage(s *Session, data *WebsocketConnectData) {
	// Send an initial message that contains information about who they are and
	// the current state of the server
	type WelcomeMessage struct {
		UserID               int       `json:"userID"`
		Username             string    `json:"username"`
		TotalGames           int       `json:"totalGames"`
		Muted                bool      `json:"muted"`
		FirstTimeUser        bool      `json:"firstTimeUser"`
		Settings             Settings  `json:"settings"`
		Friends              []string  `json:"friends"`
		AtOngoingTable       bool      `json:"atOngoingTable"`
		RandomTableName      string    `json:"randomTableName"`
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
		MaintenanceMode      bool      `json:"maintenanceMode"`
	}
	s.Emit("welcome", &WelcomeMessage{
		// Send the user their corresponding user ID
		UserID: s.UserID(),

		// We have to send the username back to the client because they may
		// have logged in with the wrong case, and the client needs to know
		// their exact username or various bugs will occur
		Username: s.Username(),

		// We also send the total amount of games that they have played
		// (to be shown in the nav bar on the history page)
		TotalGames: data.TotalGames,

		Muted:         s.Muted(),          // Some users are muted (as a resulting of spamming, etc.)
		FirstTimeUser: data.FirstTimeUser, // First time users get a quick tutorial

		// The various client settings are stored server-side so that users can seamlessly
		// transition between computers
		Settings: data.Settings,
		Friends:  data.Friends,

		// Warn the user if they rejoining an ongoing game or shared replay
		AtOngoingTable: data.PlayingInOngoingGame || data.SpectatingTable,

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
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		// Skip sending a message about ourselves since we already sent that above
		if s2.UserID() != s.UserID() {
			userMessageList = append(userMessageList, makeUserMessage(s2))
		}
	}
	sessionsMutex.RUnlock()
	s.Emit("userList", userMessageList)
}

// websocketConnectTableList sends a "tableList" message
// (this is much more performant than sending an individual "table" message for every table)
func websocketConnectTableList(s *Session) {
	tableMessageList := make([]*TableMessage, 0)
	tablesMutex.RLock()
	for _, t := range tables {
		if t.Visible {
			tableMessageList = append(tableMessageList, makeTableMessage(s, t))
		}
	}
	tablesMutex.RUnlock()
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
		s.Error(DefaultErrorMsg)
		exists = false
	}
	if exists {
		if fileContents, err := ioutil.ReadFile(motdPath); err != nil {
			logger.Error("Failed to read the \""+motdPath+"\" file:", err)
			s.Error(DefaultErrorMsg)
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
	if v, err := models.Games.GetGameIDsUser(s.UserID(), 0, 10); err != nil {
		logger.Error("Failed to get the game IDs for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history:", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameHistoryList = v
	}
	s.Emit("gameHistory", &gameHistoryList)
}

// websocketConnectHistoryFriends sends the game history of the user's friends
// (but only the last 10 games to prevent wasted bandwidth)
func websocketConnectHistoryFriends(s *Session, friends []string) {
	if len(friends) == 0 {
		return
	}

	var gameIDs []int
	if v, err := models.Games.GetGameIDsFriends(s.UserID(), s.Friends(), 0, 10); err != nil {
		logger.Error("Failed to get the friend game IDs for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryFriendsList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		logger.Error("Failed to get the history:", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		gameHistoryFriendsList = v
	}
	s.Emit("gameHistoryFriends", &gameHistoryFriendsList)
}

func websocketConnectRejoinOngoingGame(s *Session, data *WebsocketConnectData) {
	if !data.PlayingInOngoingGame {
		return
	}

	t, exists := getTableAndLock(s, data.PlayingInOngoingGameTableID, true)
	if !exists {
		return
	}
	defer t.Mutex.Unlock()

	logger.Info("Automatically reattending player \"" + s.Username() + "\" " +
		"to table " + strconv.FormatUint(data.PlayingInOngoingGameTableID, 10) + ".")

	// Update the player object with the new socket
	t.Players[data.PlayingInOngoingGameIndex].Session = s

	commandTableReattend(s, &CommandData{ // Manual invocation
		TableID: data.PlayingInOngoingGameTableID,
		NoLock:  true,
	})
}

func websocketConnectRespectate(s *Session, data *WebsocketConnectData) {
	if data.PlayingInOngoingGame || !data.SpectatingTable {
		return
	}

	t, exists := getTableAndLock(s, data.SpectatingTableID, true)
	if !exists {
		return
	}
	defer t.Mutex.Unlock()

	logger.Info("Automatically re-spectating player " + "\"" + s.Username() + "\" " +
		"to table " + strconv.FormatUint(data.SpectatingTableID, 10) + ".")

	// Mark that this player is no longer disconnected
	delete(t.DisconSpectators, s.UserID())

	commandTableSpectate(s, &CommandData{ // Manual invocation
		TableID:              data.SpectatingTableID,
		ShadowingPlayerIndex: -1,
		NoLock:               true,
	})
}
