package main

import (
	"context"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/sasha-s/go-deadlock"
)

// Table describes the container that a player can join, whether it is an unstarted game,
// an ongoing game, a solo replay, a shared replay, etc.
// A tag of `json:"-"` denotes that the JSON serializer should skip the field when serializing
type Table struct {
	ID          uint64
	Name        string
	InitialName string // The name of the table before it was converted to a replay

	Players    []*Player
	MaxPlayers int          // Player limit for this table
	Spectators []*Spectator `json:"-"`
	// We keep track of players who have been kicked from the game
	// so that we can prevent them from rejoining
	KickedPlayers map[int]struct{} `json:"-"`

	// This is the user ID of the person who started the table
	// or the current leader of the shared replay
	OwnerID int
	Visible bool // Whether or not this table is shown to other users
	// This is an Argon2id hash generated from the plain-text password
	// that the table creator sends us
	PasswordHash   string
	Running        bool
	Replay         bool
	AutomaticStart int // See "chatTable.go"
	Progress       int // Displayed as a percentage on the main lobby screen

	DatetimeCreated      time.Time
	DatetimeLastJoined   time.Time
	DatetimePlannedStart time.Time
	// This is updated any time a player interacts with the game / replay
	// (used to determine when a game is idle)
	DatetimeLastAction time.Time

	// All of the game state is contained within the "Game" object
	Game *Game

	// The variant and other game settings are contained within the "Options" object
	Options      *Options      // Options that are stored in the database
	ExtraOptions *ExtraOptions // Options that are not stored in the database

	Chat     []*TableChatMessage // All of the in-game chat history
	ChatRead map[int]int         // A map of which users have read which messages
	Deleted  bool                `json:"-"` // Used to prevent race conditions

	// Each table has its own mutex to ensure that only one action can occur at the same time
	mutex *deadlock.Mutex
}

type TableChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}

var (
	// The counter is atomically incremented before assignment,
	// so the first table ID will be 1 and will increase from there
	tableIDCounter uint64 = 0
)

func NewTable(name string, ownerID int) *Table {
	// Create the table object
	return &Table{
		ID:          getNewTableID(),
		Name:        name,
		InitialName: "", // This must stay blank in shared replays

		Players:       make([]*Player, 0),
		MaxPlayers:    5,
		Spectators:    make([]*Spectator, 0),
		KickedPlayers: make(map[int]struct{}),

		OwnerID:        ownerID,
		Visible:        true, // Tables are visible by default
		PasswordHash:   "",
		Running:        false,
		Replay:         false,
		AutomaticStart: 0,
		Progress:       0,

		DatetimeCreated:      time.Now(),
		DatetimeLastJoined:   time.Time{},
		DatetimePlannedStart: time.Time{},
		DatetimeLastAction:   time.Time{},

		Game: nil,

		Options:      NewOptions(),
		ExtraOptions: &ExtraOptions{},

		Chat:     make([]*TableChatMessage, 0),
		ChatRead: make(map[int]int),
		Deleted:  false,

		mutex: &deadlock.Mutex{},
	}
}

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

	// Do not do anything if there has been an action in the meantime
	if time.Since(t.DatetimeLastAction) < IdleGameTimeout {
		return
	}

	t.EndIdle(ctx)
}

// EndIdle is called when a table has been idle for a while and should be automatically ended
// The table lock is assumed to be acquired in this function
func (t *Table) EndIdle(ctx context.Context) {
	logger.Info(t.GetName() + " Idle timeout has elapsed; ending the game.")

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
	for len(t.ActiveSpectators()) > 0 {
		sp := t.ActiveSpectators()[0]
		s := sp.Session
		if s == nil {
			// A spectator's session should never be nil
			// They might be in the process of reconnecting,
			// so make a fake session that will represent them
			s = NewFakeSession(sp.UserID, sp.Name)
			logger.Info("Created a new fake session in the \"CheckIdle()\" function.")
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

func (t *Table) GetName() string {
	g := t.Game
	name := "Table #" + strconv.FormatUint(t.ID, 10) + " (" + t.Name + ") - "
	if g == nil {
		name += "Not started"
	} else {
		name += "Turn " + strconv.Itoa(g.Turn)
	}
	name += " - "
	return name
}

func (t *Table) GetRoomName() string {
	// Various places in the code base check for room names with a prefix of "table"
	return "table" + strconv.FormatUint(t.ID, 10)
}

func (t *Table) GetPlayerIndexFromID(userID int) int {
	for i, p := range t.Players {
		if p.UserID == userID {
			return i
		}
	}
	return -1
}

func (t *Table) IsPlayer(userID int) bool {
	return t.GetPlayerIndexFromID(userID) != -1
}

func (t *Table) GetSpectatorIndexFromID(userID int) int {
	for i, sp := range t.Spectators {
		if sp.UserID == userID {
			return i
		}
	}
	return -1
}

func (t *Table) IsActivelySpectating(userID int) bool {
	if t.GetSpectatorIndexFromID(userID) != -1 {
		spectatingTables := tables.GetTablesUserSpectating(userID)
		for _, spectatingTable := range spectatingTables {
			if spectatingTable == t.ID {
				return true
			}
		}
	}
	return false
}

func (t *Table) IsPlayerOrSpectating(userID int) bool {
	return t.IsActivelySpectating(userID) || t.IsPlayer(userID)
}

func (t *Table) GetOwnerSession() *Session {
	if t.Replay {
		logger.Error("The \"GetOwnerSession\" function was called on a table that is a replay.")
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
				logger.Info("Created a new fake session in the \"GetOwnerSession()\" function.")
			}
			break
		}
	}

	if s == nil {
		logger.Error("Failed to find the owner for table " + strconv.FormatUint(t.ID, 10) + ".")
		s = NewFakeSession(-1, "Unknown")
		logger.Info("Created a new fake session in the \"GetOwnerSession()\" function.")
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

	for _, sp := range t.ActiveSpectators() {
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
		if s, ok := sessions.Get(userID); ok {
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
		logger.Error("Failed to get the username for user " + strconv.Itoa(t.OwnerID) +
			" who is the owner of table: " + strconv.FormatUint(t.ID, 10))
		return "(Unknown)"
	} else {
		return v
	}
}

func (t *Table) ChangeVote(playerIndex int) bool {
	newVote := !t.Players[playerIndex].VoteToKill
	t.Players[playerIndex].VoteToKill = newVote
	return newVote
}

func (t *Table) ShouldTerminateByVotes() bool {
	count := 0
	for _, sp := range t.Players {
		if sp.VoteToKill {
			count++
		}
	}

	// In 2 player, the naive 50% majority is just one player, so we require both players instead
	if len(t.Players) == 2 {
		return count == 2
	}

	return count*2 >= len(t.Players)
}

func (t *Table) GetVotes() []int {
	votes := make([]int, 0)
	for i, sp := range t.Players {
		if sp.VoteToKill {
			votes = append(votes, i)
		}
	}
	return votes
}

func (t *Table) ActiveSpectators() []*Spectator {
	activeSpectators := make([]*Spectator, 0)
	for _, sp := range t.Spectators {
		for _, tId := range tables.GetTablesUserSpectating(sp.UserID) {
			if tId == t.ID {
				activeSpectators = append(activeSpectators, sp)
			}
		}
	}
	return activeSpectators
}
