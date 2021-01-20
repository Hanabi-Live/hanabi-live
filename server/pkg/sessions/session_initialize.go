package sessions

import (
	"fmt"
	"io/ioutil"
	"os"
	"path"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

const (
	lobbyChatHistoryAmount = 50
)

// initialize gathers data from the database and other managers.
// This can take a long time, so we don't want the main manager thread to be performing this work.
// initialize is meant to be run in a new Goroutine.
func (s *session) initialize(m *Manager, userList []*user) {
	if err := s.initializeFillData(m); err != nil { // e.g. Fill the "s.data" struct
		s.passBackErrorAndDelete(m, err)
		return
	}
	if err := s.initializeWelcomeMessage(m, userList); err != nil {
		s.passBackErrorAndDelete(m, err)
		return
	}
	if err := s.initializeChat(m); err != nil {
		s.passBackErrorAndDelete(m, err)
		return
	}

	s.initialized = true
	go s.read(m)  // Begin reading from the WebSocket connection
	go s.write(m) // Begin writing to the WebSocket connection
}

func (s *session) initializeFillData(m *Manager) error {
	// Get their friends
	if v, err := m.models.UserFriends.GetMap(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the friends map for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		s.data.friends = v
	}

	// Get their reverse friends
	if v, err := m.models.UserReverseFriends.GetMap(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the reverse friends map for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		s.data.reverseFriends = v
	}

	// Get whether or not they are a member of the Hyphen-ated group
	if v, err := m.models.UserSettings.IsHyphenated(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the Hyphen-ated setting for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		s.data.hyphenated = v
	}

	// Check to see if their IP is muted
	if v, err := m.models.MutedIPs.Check(s.ctx, s.ip); err != nil {
		return fmt.Errorf(
			"failed to check to see if the IP \"%v\" is muted: %w",
			s.ip,
			err,
		)
	} else {
		s.data.muted = v
	}

	return nil
}

func (s *session) initializeWelcomeMessage(m *Manager, userList []*user) error {
	// Get their friends list from the database
	// (this is easier and more consistent than converting the existing map)
	var friendsList []string
	if v, err := m.models.UserFriends.GetAllUsernames(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the friends for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		friendsList = v
	}

	// Get their join date from the database
	var datetimeCreated time.Time
	if v, err := m.models.Users.GetDatetimeCreated(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the join date for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		datetimeCreated = v
	}

	firstTimeUser := time.Since(datetimeCreated) < 10*time.Second // nolint: gomnd
	// (10 seconds is an reasonable arbitrary value to use,
	// which accounts for if they accidentally refresh the page after logging in for the first time)

	// Get their settings from the database
	// (we must have the variable named "userSettings" instead of "settings", since the latter will
	// overlap with the package name and prevent compilation)
	var userSettings *settings.Settings
	if v, err := m.models.UserSettings.Get(s.ctx, s.userID); err != nil {
		return fmt.Errorf(
			"failed to get the settings for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		userSettings = v
	}

	// Find out if they are currently playing at any ongoing tables
	playingAtTables, _ := m.Dispatcher.Tables.GetUserTables(s.userID)

	// Get the past N chat messages sent in the lobby
	var lobbyChatHistory []*models.DBChatMessage
	if v, err := m.models.ChatLog.Get(s.ctx, "lobby", lobbyChatHistoryAmount); err != nil {
		return fmt.Errorf(
			"failed to get the lobby chat history for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		lobbyChatHistory = v
	}

	// We can't name this "chatListData" because it prevents compilation
	chatList := m.chatGetListFromDatabaseHistory("lobby", lobbyChatHistory)

	// Get their total number of games played from the database
	var totalGames int
	if v, err := m.models.Games.GetUserNumGames(s.ctx, s.userID, true); err != nil {
		return fmt.Errorf(
			"failed to get the number of games played for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		totalGames = v
	}

	var gameIDs []int
	if v, err := m.models.Games.GetGameIDsUser(s.ctx, s.userID, 0, 10); err != nil {
		return fmt.Errorf(
			"failed to get the game IDs for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		gameIDs = v
	}

	var gameHistory []*models.GameHistory
	if v, err := m.models.Games.GetHistory(s.ctx, gameIDs); err != nil {
		return fmt.Errorf(
			"failed to get the game history for %v: %w",
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		gameHistory = v
	}

	gameHistoryFriends := make([]*models.GameHistory, 0)
	if len(friendsList) > 0 {
		var gameIDs []int
		if v, err := m.models.Games.GetGameIDsFriends(
			s.ctx,
			s.userID,
			s.data.friends,
			0,
			10,
		); err != nil {
			return fmt.Errorf(
				"failed to get the friend game IDs for %v: %w",
				util.PrintUser(s.userID, s.username),
				err,
			)
		} else {
			gameIDs = v
		}

		if v, err := m.models.Games.GetHistory(s.ctx, gameIDs); err != nil {
			return fmt.Errorf(
				"failed to get the friend game history for %v: %w",
				util.PrintUser(s.userID, s.username),
				err,
			)
		} else {
			gameHistoryFriends = v
		}
	}

	type welcomeData struct {
		// Static data
		UserID   int    `json:"userID"`
		Username string `json:"username"`

		// Dynamic data (e.g. the "s.data" struct)
		FriendsList []string `json:"friendsList"`
		Muted       bool     `json:"muted"`

		// Other
		FirstTimeUser   bool               `json:"firstTimeUser"`
		Settings        *settings.Settings `json:"settings"`
		PlayingAtTables []uint64           `json:"playingAtTables"`
		TotalGames      int                `json:"totalGames"`
		RandomTableName string             `json:"randomTableName"`

		// Server status
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
		MaintenanceMode      bool      `json:"maintenanceMode"`

		// Lobby initialization
		UserList           []*user               `json:"userList"`
		ChatList           *chatListData         `json:"chatList"`
		TableList          []interface{}         `json:"tableList"`
		GameHistory        []*models.GameHistory `json:"gameHistory"`
		GameHistoryFriends []*models.GameHistory `json:"gameHistoryFriends"`
	}
	data := &welcomeData{
		// Static data
		UserID: s.userID,
		// We have to send the username back to the client because they may have logged in with the
		// wrong case, and the client needs to know their exact username or various bugs will occur
		Username: s.username,

		// Dynamic data (e.g. the "s.data" struct)
		FriendsList: friendsList,
		Muted:       s.data.muted, // Some users are muted (as a resulting of spamming, etc.)

		// Other
		FirstTimeUser: firstTimeUser, // First time users get a quick tutorial
		// The various client settings are stored server-side so that users can seamlessly
		// transition between computers
		Settings: userSettings,
		// Inform the user if they were previously playing a game
		// (so that they can choose to rejoin it)
		PlayingAtTables: playingAtTables,
		TotalGames:      totalGames, // Shown in the nav bar on the history page
		// Provide them with a random table name
		// (which will be used by default on the first table that they create)
		RandomTableName: m.Dispatcher.Core.GetRandomTableName(),

		// Server status
		ShuttingDown:         m.Dispatcher.Core.ShuttingDown(),
		DatetimeShutdownInit: m.Dispatcher.Core.DatetimeShutdownInit(),
		MaintenanceMode:      m.Dispatcher.Core.MaintenanceMode(),

		// Lobby initialization
		UserList:           userList,
		ChatList:           chatList,
		TableList:          m.Dispatcher.Tables.GetTables(),
		GameHistory:        gameHistory,
		GameHistoryFriends: gameHistoryFriends,
	}

	// We have not yet begun monitoring the send channel, so in order to send the welcome message
	// and ensure that it is sent before anything else, we have to directly write it to the session
	if err := m.sendWithChannelBypass(s, "welcome", data); err != nil {
		return err
	}

	return nil
}

func (s *session) initializeChat(m *Manager) error {
	if err := s.initializeChatMotD(m); err != nil {
		return err
	}
	s.initializeChatDiscord(m)

	return nil
}

// initializeChatMotD sends the message of the day, if it exists.
func (s *session) initializeChatMotD(m *Manager) error {
	motdPath := path.Join(m.projectPath, "motd.txt")
	if _, err := os.Stat(motdPath); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf(
			"failed to check if the \"%v\" file exists for %v: %w",
			motdPath,
			util.PrintUser(s.userID, s.username),
			err,
		)
	}

	var fileContents []byte
	if v, err := ioutil.ReadFile(motdPath); err != nil {
		return fmt.Errorf(
			"failed to read the \"%v\" file for %v: %w",
			motdPath,
			util.PrintUser(s.userID, s.username),
			err,
		)
	} else {
		fileContents = v
	}

	motd := string(fileContents)
	motd = strings.TrimSpace(motd)
	if len(motd) == 0 {
		return nil
	}

	motd = fmt.Sprintf("[Server Notice] %v", motd)
	m.NotifyChatServer(s.userID, motd, "lobby")

	return nil
}

// initializeChatDiscord sends a Discord reminder.
func (s *session) initializeChatDiscord(m *Manager) {
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>."
	m.NotifyChatServer(s.userID, msg, "lobby")
}
