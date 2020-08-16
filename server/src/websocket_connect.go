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

// websocketConnect is fired when a new Melody WebSocket session is established
// This is the third step of logging in; users will only get here if authentication was successful
func websocketConnect(ms *melody.Session) {
	// Turn the Melody session into a custom session
	s := &Session{ms}

	// We only want one computer to connect to one user at a time
	// Use a mutex to prevent race conditions
	sessionsMutex.Lock()
	defer sessionsMutex.Unlock()

	// Disconnect any existing connections with this username
	if s2, ok := sessions[s.UserID()]; ok {
		logger.Info("Closing existing connection for user \"" + s.Username() + "\".")
		s2.Error("You have logged on from somewhere else, so you have been disconnected here.")
		if err := s2.Close(); err != nil {
			logger.Info("Attempted to manually close a WebSocket connection, but it failed.")
		} else {
			logger.Info("Successfully terminated a WebSocket connection.")
		}

		// The connection is now closed, but the disconnect event will be fired in another goroutine
		// Thus, we need to manually call the function now to ensure that
		// the user is removed from existing games and so forth
		websocketDisconnect2(s2)
	}

	// Add the connection to a session map so that we can keep track of all of the connections
	sessions[s.UserID()] = s
	logger.Info("User \""+s.Username()+"\" connected;", len(sessions), "user(s) now connected.")

	// They have successfully logged in
	// Now, gather some additional information

	// Get their total number of games played
	var totalGames int
	if v, err := models.Games.GetUserNumGames(s.UserID(), true); err != nil {
		logger.Error("Failed to get the number of games played for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		totalGames = v
	}

	// Get their settings from the database
	var settings Settings
	if v, err := models.UserSettings.Get(s.UserID()); err != nil {
		logger.Error("Failed to get the settings for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		settings = v
	}

	// Get their friends from the database
	var friends []string
	if v, err := models.UserFriends.GetAllUsernames(s.UserID()); err != nil {
		logger.Error("Failed to get the friends for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		friends = v
	}

	// Get their join date from the database
	var datetimeCreated time.Time
	if v, err := models.Users.GetDatetimeCreated(s.UserID()); err != nil {
		logger.Error("Failed to get the join date for user \""+s.Username()+"\":", err)
		s.Error(DefaultErrorMsg)
		return
	} else {
		datetimeCreated = v
	}
	firstTimeUser := time.Since(datetimeCreated) < 10*time.Second

	// Check to see if they are currently playing in an ongoing game
	var playingInOngoingGameID uint64
	for _, t := range tables {
		if t.Replay {
			continue
		}

		for _, p := range t.Players {
			if p.Name != s.Username() {
				continue
			}

			// Update the player object with the new socket
			p.Session = s

			playingInOngoingGameID = t.ID
			break
		}
	}

	// Check to see if they are were spectating in a shared replay before they disconnected
	// (games that they are playing in take priority over shared replays)
	var spectatingInOngoingReplayID uint64
	if playingInOngoingGameID == 0 {
		for _, t := range tables {
			if !t.Replay {
				continue
			}

			for id := range t.DisconSpectators {
				if id != s.UserID() {
					continue
				}

				// Mark that this player is no longer disconnected
				delete(t.DisconSpectators, s.UserID())

				spectatingInOngoingReplayID = t.ID
				break
			}
		}
	}

	// Send an initial message that contains information about who they are and
	// the current state of the server
	type WelcomeMessage struct {
		ID                   int       `json:"id"`
		Username             string    `json:"username"`
		TotalGames           int       `json:"totalGames"`
		Muted                bool      `json:"muted"`
		FirstTimeUser        bool      `json:"firstTimeUser"`
		Settings             Settings  `json:"settings"`
		Friends              []string  `json:"friends"`
		AtOngoingTable       bool      `json:"atOngoingTable"`
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
		MaintenanceMode      bool      `json:"maintenanceMode"`
	}
	s.Emit("welcome", &WelcomeMessage{
		// Send the user their corresponding user ID
		ID: s.UserID(),

		// We have to send the username back to the client because they may
		// have logged in with the wrong case, and the client needs to know
		// their exact username or various bugs will occur
		Username: s.Username(),

		// We also send the total amount of games that they have played
		// (to be shown in the nav bar on the history page)
		TotalGames: totalGames,

		Muted:         s.Muted(),     // Some users are muted (as a resulting of spamming, etc.)
		FirstTimeUser: firstTimeUser, // First time users get a quick tutorial

		// The various client settings are stored server-side so that users can seamlessly
		// transition between computers
		Settings: settings,
		Friends:  friends,

		// Warn the user if they rejoining an ongoing game or shared replay
		AtOngoingTable: playingInOngoingGameID != 0 || spectatingInOngoingReplayID != 0,

		// Also let the user know if the server is currently restarting or shutting down
		ShuttingDown:         shuttingDown.IsSet(),
		DatetimeShutdownInit: datetimeShutdownInit,
		MaintenanceMode:      maintenanceMode.IsSet(),
	})

	// Send them a random name
	commandGetName(s, nil)

	// Alert everyone that a new user has logged in
	// (note that we intentionally send users a message about themselves)
	notifyAllUser(s)

	// Send a "userList" message
	// (this is much more performant than sending an individual "user" message for every user)
	userMessageList := make([]*UserMessage, 0)
	for _, s2 := range sessions {
		// Skip sending a message about ourselves since we already sent that above
		if s2.UserID() != s.UserID() {
			userMessageList = append(userMessageList, makeUserMessage(s2))
		}
	}
	s.Emit("userList", userMessageList)

	// Send a "tableList" message
	// (this is much more performant than sending an individual "table" message for every table)
	tableMessageList := make([]*TableMessage, 0)
	for _, t := range tables {
		if t.Visible {
			tableMessageList = append(tableMessageList, makeTableMessage(s, t))
		}
	}
	s.Emit("tableList", tableMessageList)

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

	// Send the user's game history
	// (but only the last 10 games to prevent wasted bandwidth)
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

	// Send the game history of the user's friends
	// (but only the last 10 games to prevent wasted bandwidth)
	if len(friends) > 0 {
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

	// If they are playing in an ongoing game, join it
	if playingInOngoingGameID != 0 {
		logger.Info("Automatically reattending player \"" + s.Username() + "\" " +
			"to table " + strconv.FormatUint(playingInOngoingGameID, 10) + ".")
		commandTableReattend(s, &CommandData{
			TableID: playingInOngoingGameID,
		})
		return
	}

	// If they were spectating an ongoing shared replay, join it
	if spectatingInOngoingReplayID != 0 {
		logger.Info("Automatically re-spectating player " + "\"" + s.Username() + "\" " +
			"to table " + strconv.FormatUint(spectatingInOngoingReplayID, 10) + ".")
		commandTableSpectate(s, &CommandData{
			TableID: spectatingInOngoingReplayID,
		})
		return
	}
}
