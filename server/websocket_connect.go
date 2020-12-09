package main

import (
	"context"
	"fmt"
	"io/ioutil"
	"os"
	"path"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/gabstv/melody"
)

func websocketConnect(ms *melody.Session) {
	websocketDisconnectRemoveFromGames(ctx, s2)

	// Now, send some additional information to them
	websocketConnectWelcomeMessage(s, data)
	websocketConnectUserList(s)
	websocketConnectTableList(ctx, s)
	websocketConnectChat(s)
	websocketConnectHistory(s)
	if len(data.Friends) > 0 {
		websocketConnectHistoryFriends(s)
	}

	// Alert everyone that a new user has logged in
	notifyAllUser(s)
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
	sessionList := sessions2.GetList()
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
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>."
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

// websocketConnectHistory sends the user's game history
// (but only the last 10 games to prevent wasted bandwidth)
func websocketConnectHistory(s *Session) {
	var gameIDs []int
	if v, err := models.Games.GetGameIDsUser(s.UserID, 0, 10); err != nil {
		hLog.Errorf(
			"Failed to get the game IDs for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		return
	} else {
		gameIDs = v
	}
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		hLog.Errorf("Failed to get the history: %v", err)
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
