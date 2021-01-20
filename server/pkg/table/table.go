package table

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// table describes the container that a player can join.
// (e.g. an unstarted game, an ongoing game, a solo replay, a shared replay, etc.)
// We need to export most fields so that the JSON encoder can serialize them during a graceful
// server restart.
type table struct {
	// This is a reference to the parent object; every game must have a parent Manager object
	manager *Manager

	ID          int
	Name        string
	InitialName string // The name of the table before it was converted to a replay

	Players    []*player
	spectators []*spectator
	// We keep track of players who have been kicked from the game
	// so that we can prevent them from rejoining
	kickedPlayers map[int]struct{}

	// This is the user ID of the person who started the table
	// or the current leader of the shared replay
	OwnerID int
	Visible bool // Whether or not this table is shown to other users
	// This is an Argon2id hash generated from the plain-text password
	// that the table creator sends us
	PasswordHash   string
	Running        bool
	Replay         bool
	automaticStart int // See "chatTable.go"
	Progress       int // Displayed as a percentage on the main lobby screen

	DatetimeCreated      time.Time
	DatetimeLastJoined   time.Time
	DatetimePlannedStart time.Time
	// This is updated any time a player interacts with the game / replay
	// (used to determine when a game is idle)
	DatetimeLastAction time.Time

	// All of the game state is contained within the "Game" object
	Game *game

	// The variant and other game settings are contained within the "Options" object
	Options      *options.Options      // Options that are stored in the database
	ExtraOptions *options.ExtraOptions // Options that are not stored in the database
	Variant      *variants.Variant     // A reference to the variant object for convenience purposes

	Chat     []*ChatMessage // All of the in-game chat history
	ChatRead map[int]int    // A map of which users have read which messages
}

type ChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}

type NewTableData struct {
	ID              int
	Name            string
	OwnerID         int
	OwnerUsername   string
	Visible         bool
	PasswordHash    string
	Options         *options.Options
	ExtraOptions    *options.ExtraOptions
	Variant         *variants.Variant
	ShutdownWarning string
}

func newTable(d *NewTableData) *table {
	t := &table{
		ID:          d.ID,
		Name:        d.Name,
		InitialName: "", // Set when this game converts from ongoing --> shared replay

		Players:       make([]*player, 0),
		spectators:    make([]*spectator, 0),
		kickedPlayers: make(map[int]struct{}),

		OwnerID:        d.OwnerID,
		Visible:        d.Visible,
		PasswordHash:   d.PasswordHash,
		Running:        false,
		Replay:         false,
		automaticStart: 0,
		Progress:       0,

		DatetimeCreated:      time.Now(),
		DatetimeLastJoined:   time.Now(),
		DatetimePlannedStart: time.Time{},
		DatetimeLastAction:   time.Now(),

		Game: nil,

		Options:      d.Options,
		ExtraOptions: d.ExtraOptions,
		Variant:      d.Variant,

		Chat:     make([]*ChatMessage, 0),
		ChatRead: make(map[int]int),
	}

	// Log a chat message so that future players can see a timestamp of when the table was created
	msg := fmt.Sprintf("%v created the table.", d.OwnerUsername)
	chatMsg := newChatMessage(0, "", msg, true)
	t.Chat = append(t.Chat, chatMsg)

	// Log a chat message if the server is shutting down / restarting soon
	if d.ShutdownWarning != "" {
		chatMsg := newChatMessage(0, "", d.ShutdownWarning, true)
		t.Chat = append(t.Chat, chatMsg)
	}

	return t
}

func newChatMessage(userID int, username string, msg string, server bool) *ChatMessage {
	return &ChatMessage{
		UserID:   userID,
		Username: username,
		Msg:      msg,
		Datetime: time.Now(),
		Server:   server,
	}
}

func (t *table) getPlayerIndexFromID(userID int) int {
	for i, p := range t.Players {
		if p.UserID == userID {
			return i
		}
	}

	return -1
}

func (t *table) getSpectatorIndexFromID(userID int) int {
	for i, sp := range t.spectators {
		if sp.userID == userID {
			return i
		}
	}

	return -1
}

func (t *table) getOwner() *player {
	if t.Replay {
		// This function is only meant to be used for ongoing games
		return nil
	}

	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			return p
		}
	}

	return nil
}

func (t *table) getName() string {
	g := t.Game

	var turn string
	if g == nil {
		turn = "not started"
	} else {
		turn = fmt.Sprintf("turn %v", g.Turn)
	}

	return fmt.Sprintf("Table %v (%v)", t.ID, turn)
}

func (t *table) getRoomName() string {
	return fmt.Sprintf("%v%v", constants.TableRoomPrefix, t.ID)
}

/*
func getNewTableID() uint64 {
	tableIDs := tables.GetTableIDs()

	for {
		newTableID := atomic.AddUint64(&tableIDCounter, 1)

		// Ensure that the table ID does not conflict with any existing tables
		valid := true
		for _, tableID := range tableIDs {
			if tableID == newTableID {
				valid = false
				break
			}
		}
		if valid {
			return newTableID
		}
	}
}

func (t *Table) Lock(ctx context.Context) {
	t.mutex.Lock()
}

func (t *Table) Unlock(ctx context.Context) {
	t.mutex.Unlock()
}

// CheckIdle is meant to be called in a new goroutine
func (t *Table) CheckIdle(ctx context.Context) {
	// Disable idle timeouts in development
	if isDev {
		return
	}

	// Set the last action
	t.Lock(ctx)
	t.DatetimeLastAction = time.Now()
	t.Unlock(ctx)

	// We want to clean up idle games, so sleep for a reasonable amount of time
	time.Sleep(IdleGameTimeout)

	// Check to see if the table still exists
	t2, exists := getTableAndLock(ctx, nil, t.ID, false, true)
	if !exists || t != t2 {
		return
	}
	t.Lock(ctx)
	defer t.Unlock(ctx)

	// Don't do anything if there has been an action in the meantime
	if time.Since(t.DatetimeLastAction) < IdleGameTimeout {
		return
	}

	t.EndIdle(ctx)
}

// EndIdle is called when a table has been idle for a while and should be automatically ended
// The table lock is assumed to be acquired in this function
func (t *Table) EndIdle(ctx context.Context) {
	hLog.Infof("%v Idle timeout has elapsed; ending the game.", t.GetName())

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	if t.Replay {
		// If this is a replay,
		// we want to send a message to the client that will take them back to the lobby
		t.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(t.Spectators) > 0 {
		sp := t.Spectators[0]
		s := sp.Session
		if s == nil {
			// A spectator's session should never be nil
			// They might be in the process of reconnecting,
			// so make a fake session that will represent them
			s = NewFakeSession(sp.UserID, sp.Name)
			hLog.Info("Created a new fake session.")
		}
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	}

	if t.Replay {
		// If this is a replay, then we are done;
		// it should automatically end now that all of the spectators have left
		return
	}

	s := t.GetOwnerSession()
	if t.Running {
		// We need to end a game that has started
		// (this will put everyone in a non-shared replay of the idle game)
		commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			Type:         ActionTypeEndGame,
			Target:       -1,
			Value:        EndConditionIdleTimeout,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	} else {
		// We need to end a game that has not started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		commandTableLeave(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	}
}

func (t *Table) GetOwnerSession() *Session {
	if t.Replay {
		hLog.Error("The \"GetOwnerSession\" function was called on a table that is a replay.")
		return nil
	}

	var s *Session
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			s = p.Session
			if s == nil {
				// A player's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s = NewFakeSession(p.UserID, p.Name)
				hLog.Info("Created a new fake session.")
			}
			break
		}
	}

	if s == nil {
		hLog.Errorf("Failed to find the owner for table: %v", t.ID)
		s = NewFakeSession(-1, "Unknown")
		hLog.Info("Created a new fake session.")
	}

	return s
}

// Get a list of online user sessions that should be notified about actions and other important
// events from this table
// We do not want to notify everyone about every table, as that would constitute a lot of spam
// Only notify:
// 1) players who are currently in the game
// 2) users that have players or spectators in this table on their friends list
func (t *Table) GetNotifySessions(excludePlayers bool) []*Session {
	// First, make a map that contains a list of every relevant user
	notifyMap := make(map[int]struct{})

	if !t.Replay {
		for _, p := range t.Players {
			if p.Session == nil {
				continue
			}
			notifyMap[p.UserID] = struct{}{}
			for userID := range p.Session.ReverseFriends() {
				notifyMap[userID] = struct{}{}
			}
		}
	}

	for _, sp := range t.Spectators {
		if sp.Session == nil {
			continue
		}
		notifyMap[sp.UserID] = struct{}{}
		for userID := range sp.Session.ReverseFriends() {
			notifyMap[userID] = struct{}{}
		}
	}

	// In some situations, we need to only notify the reverse friends;
	// including the players would mean that the players get duplicate messages
	if excludePlayers {
		for _, p := range t.Players {
			delete(notifyMap, p.UserID)
		}
	}

	// Go through the map and build a list of users that happen to be currently online
	notifySessions := make([]*Session, 0)
	for userID := range notifyMap {
		if s, ok := sessions2.Get(userID); ok {
			notifySessions = append(notifySessions, s)
		}
	}

	return notifySessions
}

func (t *Table) GetSharedReplayLeaderName() string {
	// Get the username of the game owner
	// (the "Owner" field is used to store the leader of the shared replay)
	for _, sp := range t.Spectators {
		if sp.UserID == t.OwnerID {
			return sp.Name
		}
	}

	// The leader is not currently present,
	// so try getting their username from the players object
	for _, p := range t.Players {
		if p.UserID == t.OwnerID {
			return p.Name
		}
	}

	// The leader is not currently present and was not a member of the original game,
	// so we need to look up their username from the database
	if v, err := models.Users.GetUsername(t.OwnerID); err != nil {
		hLog.Errorf(
			"Failed to get the username for user %v who is the owner of table: %v",
			t.OwnerID,
			t.ID,
		)
		return "(Unknown)"
	} else {
		return v
	}
}

*/
