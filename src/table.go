package main

import (
	"strconv"
	"time"
)

type Table struct {
	ID   int
	Name string

	Players    []*Player
	Spectators []*Spectator
	// We also keep track of spectators who have disconnected
	// so that we can automatically put them back into the shared replay
	DisconSpectators map[int]bool

	// This is the user ID of the person who started the table
	// or the current leader of the shared replay
	Owner   int
	Visible bool // Whether or not this table is shown to other users
	// This is a salted SHA512 hash sent by the client, but technically it can be any string at all
	Password string
	// Whether or not the table was created with the "Alert people" checkbox checked
	AlertWaiters   bool
	Running        bool
	Replay         bool
	AutomaticStart int // See "chatTable.go"
	Progress       int // Displayed as a percentage on the main lobby screen

	DatetimeCreated      time.Time
	DatetimePlannedStart time.Time
	DatetimeStarted      time.Time
	// This is updated any time a player interacts with the game / replay
	// (used to determine when a game is idle)
	DatetimeLastAction time.Time
	DatetimeFinished   time.Time

	// All of the game state is contained within the "Game" object
	Game *Game

	// The variant and other game settings are contained within the "Options" object
	Options *Options

	Chat     []*TableChatMessage // All of the in-game chat history
	ChatRead map[int]int         // A map of which users have read which messages
}

type TableChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}

func NewTable(name string, owner int) *Table {
	// Get a new table ID
	tableID := newTableID
	newTableID++

	// Create the table object
	return &Table{
		ID:   tableID,
		Name: name,

		Players:          make([]*Player, 0),
		Spectators:       make([]*Spectator, 0),
		DisconSpectators: make(map[int]bool),

		Owner:   owner,
		Visible: true, // Tables are visible by default

		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),

		Chat:     make([]*TableChatMessage, 0),
		ChatRead: make(map[int]int),
	}
}

/*
	Major functions
*/

// CheckIdle is meant to be called in a new goroutine
func (t *Table) CheckIdle() {
	// Set the last action
	commandMutex.Lock()
	t.DatetimeLastAction = time.Now()
	commandMutex.Unlock()

	// We want to clean up idle games, so sleep for a reasonable amount of time
	time.Sleep(idleGameTimeout)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the table still exists
	if _, ok := tables[t.ID]; !ok {
		return
	}

	// Don't do anything if there has been an action in the meantime
	if time.Since(t.DatetimeLastAction) < idleGameTimeout {
		return
	}

	logger.Info(t.GetName() + " Idle timeout has elapsed; ending the game.")

	if t.Replay {
		// If this is a replay,
		// we want to send a message to the client that will take them back to the lobby
		t.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(t.Spectators) > 0 {
		s := t.Spectators[0].Session
		s.Set("currentTable", t.ID)
		s.Set("status", statusSpectating)
		commandTableUnattend(s, nil)
	}

	if t.Replay {
		// If this is a replay, then we are done;
		// it should automatically end now that all of the spectators have left
		return
	}

	// Get the session of the owner
	var s *Session
	for _, p := range t.Players {
		if p.Session.UserID() == t.Owner {
			s = p.Session
			break
		}
	}

	if t.Running {
		// We need to end a game that has started
		// (this will put everyone in a non-shared replay of the idle game)
		s.Set("currentTable", t.ID)
		s.Set("status", statusPlaying)
		commandAction(s, &CommandData{
			Type: actionTypeIdleLimitReached,
		})
	} else {
		// We need to end a game that hasn't started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		s.Set("currentTable", t.ID)
		s.Set("status", statusPregame)
		commandTableLeave(s, nil)
	}
}

/*
	Miscellaneous functions
*/

func (t *Table) GetName() string {
	g := t.Game
	name := "Table #" + strconv.Itoa(t.ID) + " (" + t.Name + ") - "
	if g == nil {
		name += "Not started"
	} else {
		name += "Turn " + strconv.Itoa(g.Turn)
	}
	name += " - "
	return name
}

func (t *Table) GetPlayerIndexFromID(id int) int {
	for i, p := range t.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

func (t *Table) GetSpectatorIndexFromID(id int) int {
	for i, sp := range t.Spectators {
		if sp.ID == id {
			return i
		}
	}
	return -1
}
