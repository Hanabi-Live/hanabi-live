package httpmain

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/sessions"
	"github.com/Zamiell/hanabi-live/server/pkg/settings"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v4"
	"nhooyr.io/websocket"
)

// ws handles part 2 of 2 for login authentication. (Part 1 is found in "login.go".)
// After receiving a cookie in part 1, the client will attempt to open a WebSocket connection with
// the cookie (which is done implicitly because JavaScript will automatically use any current
// cookies for the website when establishing a WebSocket connection).
// So, before allowing anyone to open a WebSocket connection, we need to validate that they have
// gone through part 1 (e.g. they have a valid cookie that was created at some point in the past).
// We also do some other checks to be thorough.
// If all of the checks pass, the WebSocket connection will be established,
// and then handed off to the sessions manager to reading/writing.
// If anything fails in this function, we want to delete the user's cookie in order to force them to
// start authentication from the beginning.
func (m *Manager) ws(c *gin.Context) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Parse the IP address
	var ip string
	if v, _, err := net.SplitHostPort(r.RemoteAddr); err != nil {
		msg := fmt.Sprintf("Failed to parse the IP address from \"%v\": %v", r.RemoteAddr, err)
		m.wsError(c, msg)
		return
	} else {
		ip = v
	}

	// Check to see if their IP is banned
	if banned, err := m.models.BannedIPs.Check(c, ip); err != nil {
		msg := fmt.Sprintf("Failed to check to see if the IP \"%v\" is banned: %v", ip, err)
		m.wsError(c, msg)
		return
	} else if banned {
		m.logger.Infof("IP \"%v\" tried to establish a WebSocket connection, but they are banned.", ip)
		http.Error(
			w,
			"Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
			http.StatusUnauthorized,
		)
		m.deleteCookie(c)
		return
	}

	// If they have a valid cookie, it should have the "userID" value that we set in "httpLogin()"
	session := gsessions.Default(c)
	var userID int
	if v := session.Get("userID"); v == nil {
		msg := fmt.Sprintf(
			"Unauthorized WebSocket handshake detected from \"%v\". This likely means that their cookie has expired.",
			ip,
		)
		m.wsDeny(c, msg)
		return
	} else {
		userID = v.(int)
	}

	// Get the username for this user
	var username string
	if v, err := m.models.Users.GetUsername(c, userID); errors.Is(err, pgx.ErrNoRows) {
		// The user has a cookie for a user that does not exist in the database
		// (e.g. an "orphaned" user)
		// This can happen in situations where a test user was deleted, for example
		// Delete their cookie and force them to re-login
		msg := fmt.Sprintf(
			"User from \"%v\" tried to login with an orphaned user ID of %v. Deleting their cookie.",
			ip,
			userID,
		)
		m.wsDeny(c, msg)
		return
	} else if err != nil {
		msg := fmt.Sprintf(
			"Failed to get the username from user ID %v: %v",
			userID,
			err,
		)
		m.wsError(c, msg)
		return
	} else {
		username = v
	}

	m.wsNew(c, userID, username, ip)
}

func (m *Manager) wsNew(c *gin.Context, userID int, username string, ip string) {
	// Local variables
	r := c.Request
	w := c.Writer

	// Upgrade the HTTP request to a WebSocket connection
	var conn *websocket.Conn
	if v, err := websocket.Accept(w, r, nil); err != nil {
		msg := fmt.Sprintf(
			"Failed to establish the WebSocket connection for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return
	} else {
		conn = v
	}
	defer conn.Close(websocket.StatusInternalError, "")

	// Next, perform all the expensive database calls to gather the data we need
	data := m.wsGetData(c, conn, userID, username, ip)
	if data == nil {
		return
	}

	// Send a request to add the WebSocket connection to the sessions manager
	// (which listens on a separate goroutine)
	// This will block until an error is received from the channel
	err := m.sessionsManager.New(data)
	if errors.Is(err, context.Canceled) ||
		websocket.CloseStatus(err) == websocket.StatusNormalClosure ||
		websocket.CloseStatus(err) == websocket.StatusGoingAway {

		// The WebSocket connection was closed in a normal/expected way
		return
	} else if err != nil {
		m.logger.Errorf(
			"The WebSocket connection for %v encountered an unknown error: %v",
			util.PrintUser(userID, username),
			err,
		)
		return
	}
}

func (m *Manager) wsGetData(
	c *gin.Context,
	conn *websocket.Conn,
	userID int,
	username string,
	ip string,
) *sessions.NewData {
	// Update the database with "datetime_last_login" and "last_ip"
	if err := m.models.Users.Update(c, userID, ip); err != nil {
		msg := fmt.Sprintf(
			"Failed to set \"datetime_last_login\" and \"last_ip\" for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	}

	// -----------------------------------------
	// Data that will be attached to the session
	// -----------------------------------------

	// Check to see if their IP is muted
	var muted bool
	if v, err := m.models.MutedIPs.Check(c, ip); err != nil {
		msg := fmt.Sprintf(
			"Failed to check to see if the IP \"%v\" is muted: %v",
			ip,
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		muted = v
	}

	// Get their friends
	var friends map[int]struct{}
	if v, err := m.models.UserFriends.GetMap(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the friends map for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		friends = v
	}

	// Get their reverse friends
	var reverseFriends map[int]struct{}
	if v, err := m.models.UserReverseFriends.GetMap(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the reverse friends map for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		reverseFriends = v
	}

	// Get whether or not they are a member of the Hyphen-ated group
	var hyphenated bool
	if v, err := m.models.UserSettings.IsHyphenated(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the Hyphen-ated setting for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		hyphenated = v
	}

	// -----------
	// Other stats
	// -----------

	// Get their join date from the database
	var datetimeCreated time.Time
	if v, err := m.models.Users.GetDatetimeCreated(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the join date for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		datetimeCreated = v
	}
	firstTimeUser := time.Since(datetimeCreated) < 10*time.Second // nolint: gomnd
	// (10 seconds is an reasonable arbitrary value to use,
	// which accounts for if they accidentally refresh the page after logging in for the first time)

	// Get their total number of games played from the database
	var totalGames int
	if v, err := m.models.Games.GetUserNumGames(c, userID, true); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the number of games played for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		totalGames = v
	}

	// Get their settings from the database
	var settings settings.Settings
	if v, err := m.models.UserSettings.Get(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the settings for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		settings = v
	}

	// Get their friends from the database
	var friendsList []string
	if v, err := m.models.UserFriends.GetAllUsernames(c, userID); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the friends for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		friendsList = v
	}

	// ----------------------------------------
	// Information about their current activity
	// ----------------------------------------

	playingAtTables, _ := m.tablesManager.GetUserTables(userID)

	// -------
	// History
	// -------

	var lobbyChatHistory []*DBChatMessage
	if v, err := models.ChatLog.Get("lobby", lobbyChatHistoryAmount); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the lobby chat history for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		return nil
	} else {
		lobbyChatHistory = v
	}

	var gameIDs []int
	if v, err := models.Games.GetGameIDsUser(userID, 0, 10); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the game IDs for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		gameIDs = v
	}

	var gameHistory []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		msg := fmt.Sprintf(
			"Failed to get the history for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		m.wsError(c, msg)
		return nil
	} else {
		gameHistory = v
	}

	gameHistoryFriends := make([]*GameHistory, 0)
	if len(friendsList) > 0 {

	}

	// ----
	// Done
	// ----

	return &sessions.NewData{
		Ctx:  c,
		Conn: conn,

		UserID:   userID,
		Username: username,

		Friends:        friends,
		ReverseFriends: reverseFriends,
		Hyphenated:     hyphenated,
		Muted:          muted,

		FirstTimeUser: firstTimeUser,
		TotalGames:    totalGames,
		Settings:      settings,
		FriendsList:   friendsList,

		PlayingAtTables: playingAtTables,

		LobbyChatHistory:   lobbyChatHistory,
		GameHistory:        gameHistory,
		GameHistoryFriends: gameHistoryFriends,
	}
}

func (m *Manager) wsError(c *gin.Context, msg string) {
	// Local variables
	w := c.Writer

	m.logger.Error(msg)
	http.Error(
		w,
		http.StatusText(http.StatusInternalServerError),
		http.StatusInternalServerError,
	)
	m.deleteCookie(c)
}

func (m *Manager) wsDeny(c *gin.Context, msg string) {
	// Local variables
	w := c.Writer

	m.logger.Info(msg)
	http.Error(
		w,
		http.StatusText(http.StatusUnauthorized),
		http.StatusUnauthorized,
	)
	m.deleteCookie(c)
}
