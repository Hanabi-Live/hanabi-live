package main

import (
	"time"
)

/*
	Lobby notify functions
*/

// NotifyUser will notify someone about a new user that connected or a change in an existing user
func (s *Session) NotifyUser(s2 *Session) {
	s.Emit("user", makeUserMessage(s2))
}

type UserMessage struct {
	UserID     int    `json:"userID"`
	Name       string `json:"name"`
	Status     int    `json:"status"`
	TableID    uint64 `json:"tableID"`
	Hyphenated bool   `json:"hyphenated"`
	Inactive   bool   `json:"inactive"`
}

func makeUserMessage(s *Session) *UserMessage {
	return &UserMessage{
		UserID:     s.UserID,
		Name:       s.Username,
		Status:     s.Status(),
		TableID:    s.TableID(),
		Hyphenated: s.Hyphenated(),
		Inactive:   s.Inactive(),
	}
}

// NotifyUserLeft will notify someone about a user that disconnected
func (s *Session) NotifyUserLeft(s2 *Session) {
	type UserLeftMessage struct {
		UserID int `json:"userID"`
	}
	s.Emit("userLeft", &UserLeftMessage{
		UserID: s2.UserID,
	})
}

// NotifyUserInactive will notify someone about a user that is either
// inactive or coming back from inactive status
func (s *Session) NotifyUserInactive(s2 *Session) {
	type UserInactiveMessage struct {
		UserID   int  `json:"userID"`
		Inactive bool `json:"inactive"`
	}
	s.Emit("userInactive", &UserInactiveMessage{
		UserID:   s2.UserID,
		Inactive: s2.Inactive(),
	})
}

// NotifyTable will notify a user about a new game or a change in an existing game
func (s *Session) NotifyTable(t *Table) {
	s.Emit("table", makeTableMessage(s, t))
}

type TableMessage struct {
	ID                uint64   `json:"id"`
	Name              string   `json:"name"`
	PasswordProtected bool     `json:"passwordProtected"`
	Joined            bool     `json:"joined"`
	NumPlayers        int      `json:"numPlayers"`
	Owned             bool     `json:"owned"`
	Running           bool     `json:"running"`
	Variant           string   `json:"variant"`
	Timed             bool     `json:"timed"`
	TimeBase          int      `json:"timeBase"`
	TimePerTurn       int      `json:"timePerTurn"`
	SharedReplay      bool     `json:"sharedReplay"`
	Progress          int      `json:"progress"`
	Players           []string `json:"players"`
	Spectators        []string `json:"spectators"`
	MaxPlayers        int      `json:"maxPlayers"`
}

func makeTableMessage(s *Session, t *Table) *TableMessage {
	playerIndex := t.GetPlayerIndexFromID(s.UserID)

	players := make([]string, 0)
	for _, p := range t.Players {
		players = append(players, p.Name)
	}

	spectators := make([]string, 0)
	for _, sp := range t.Spectators {
		spectators = append(spectators, sp.Name)
	}

	return &TableMessage{
		ID:                t.ID,
		Name:              t.Name,
		PasswordProtected: len(t.PasswordHash) > 0,
		Joined:            playerIndex != -1,
		NumPlayers:        len(t.Players),
		Owned:             s.UserID == t.OwnerID,
		Running:           t.Running,
		Variant:           t.Options.VariantName,
		Timed:             t.Options.Timed,
		TimeBase:          t.Options.TimeBase,
		TimePerTurn:       t.Options.TimePerTurn,
		SharedReplay:      t.Replay,
		Progress:          t.Progress,
		Players:           players,
		Spectators:        spectators,
		MaxPlayers:        t.MaxPlayers,
	}
}

func (s *Session) NotifyTableJoined(t *Table) {
	type JoinedMessage struct {
		TableID uint64 `json:"tableID"`
	}
	s.Emit("joined", &JoinedMessage{
		TableID: t.ID,
	})
}

func (s *Session) NotifyTableProgress(t *Table) {
	type TableProgressMessage struct {
		TableID  uint64 `json:"tableID"`
		Progress int    `json:"progress"`
	}
	s.Emit("tableProgress", &TableProgressMessage{
		TableID:  t.ID,
		Progress: t.Progress,
	})
}

// NotifyTableGone will notify someone about a game that ended
func (s *Session) NotifyTableGone(t *Table) {
	type TableGoneMessage struct {
		TableID uint64 `json:"tableID"`
	}
	s.Emit("tableGone", &TableGoneMessage{
		TableID: t.ID,
	})
}

func (s *Session) NotifyChatTyping(t *Table, name string, typing bool) {
	type ChatTypingMessage struct {
		TableID uint64 `json:"tableID"`
		Name    string `json:"name"`
		Typing  bool   `json:"typing"`
	}
	s.Emit("chatTyping", &ChatTypingMessage{
		TableID: t.ID,
		Name:    name,
		Typing:  typing,
	})
}

func (s *Session) NotifyTableStart(t *Table) {
	type TableStartMessage struct {
		TableID uint64 `json:"tableID"`
		Replay  bool   `json:"replay"`
	}
	s.Emit("tableStart", &TableStartMessage{
		TableID: t.ID,
		Replay:  t.Replay,
	})
}

func (s *Session) NotifyShutdown() {
	type ShutdownMessage struct {
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
	}
	s.Emit("shutdown", &ShutdownMessage{
		ShuttingDown:         shuttingDown.IsSet(),
		DatetimeShutdownInit: datetimeShutdownInit,
	})
}

func (s *Session) NotifyMaintenance() {
	type MaintenanceMessage struct {
		MaintenanceMode bool `json:"maintenanceMode"`
	}
	s.Emit("maintenance", &MaintenanceMessage{
		MaintenanceMode: maintenanceMode.IsSet(),
	})
}

func (s *Session) NotifySoundLobby(file string) {
	type SoundLobbyMessage struct {
		File string `json:"file"`
	}
	s.Emit("soundLobby", &SoundLobbyMessage{
		File: file,
	})
}

/*
	In-game notify functions
*/

// NotifyConnected will send someone a list corresponding to which players are connected
// On the client, this changes the player name-tags different colors
func (s *Session) NotifyConnected(t *Table) {
	// Make the list
	list := make([]bool, 0)
	for _, p := range t.Players {
		list = append(list, p.Present)
	}

	// Send the "connected" message
	type ConnectedMessage struct {
		TableID uint64 `json:"tableID"`
		List    []bool `json:"list"`
	}
	s.Emit("connected", &ConnectedMessage{
		TableID: t.ID,
		List:    list,
	})
}

func (s *Session) NotifyGameAction(t *Table, action interface{}) {
	scrubbedAction := CheckScrub(t, action, s.UserID)

	type GameActionMessage struct {
		TableID uint64      `json:"tableID"`
		Action  interface{} `json:"action"`
	}
	s.Emit("gameAction", &GameActionMessage{
		TableID: t.ID,
		Action:  scrubbedAction,
	})
}

func (s *Session) NotifyTime(t *Table) {
	g := t.Game

	// Create the clock message
	times := make([]int64, 0)
	for i, p := range g.Players {
		// We could be sending the message in the middle of someone's turn, so account for this
		timeLeft := p.Time
		if g.ActivePlayerIndex == i {
			elapsedTime := time.Since(g.DatetimeTurnBegin)
			timeLeft -= elapsedTime
		}

		// JavaScript expects time in milliseconds
		milliseconds := int64(timeLeft / time.Millisecond)
		times = append(times, milliseconds)
	}
	timeTaken := int64(time.Since(g.DatetimeTurnBegin) / time.Millisecond)

	type ClockMessage struct {
		TableID           uint64  `json:"tableID"`
		Times             []int64 `json:"times"`
		ActivePlayerIndex int     `json:"activePlayerIndex"`
		TimeTaken         int64   `json:"timeTaken"`
	}
	s.Emit("clock", &ClockMessage{
		TableID:           t.ID,
		Times:             times,
		ActivePlayerIndex: g.ActivePlayerIndex,
		TimeTaken:         timeTaken,
	})
}

func (s *Session) NotifyPause(t *Table) {
	g := t.Game

	type PauseMessage struct {
		TableID     uint64 `json:"tableID"`
		Active      bool   `json:"active"`
		PlayerIndex int    `json:"playerIndex"`
	}
	s.Emit("pause", &PauseMessage{
		TableID:     t.ID,
		Active:      g.Paused,
		PlayerIndex: g.PausePlayerIndex,
	})
}

func (s *Session) NotifySpectators(t *Table) {
	type SpectatorsMessage struct {
		TableID    uint64       `json:"tableID"`
		Spectators []*Spectator `json:"spectators"`
	}
	s.Emit("spectators", &SpectatorsMessage{
		TableID:    t.ID,
		Spectators: t.Spectators,
	})
}

func (s *Session) NotifyBoot(t *Table) {
	type BootMessage struct {
		TableID uint64
	}
	s.Emit("boot", &BootMessage{
		TableID: t.ID,
	})
}

/*
	Replay notify functions
*/

func (s *Session) NotifyCardIdentities(t *Table) {
	g := t.Game

	type CardIdentitiesMessage struct {
		TableID        uint64          `json:"tableID"`
		CardIdentities []*CardIdentity `json:"cardIdentities"`
	}
	s.Emit("cardIdentities", &CardIdentitiesMessage{
		TableID:        t.ID,
		CardIdentities: g.CardIdentities,
	})
}

func (s *Session) NotifyReplayLeader(t *Table) {
	type ReplayLeaderMessage struct {
		TableID uint64 `json:"tableID"`
		Name    string `json:"name"`
	}
	s.Emit("replayLeader", &ReplayLeaderMessage{
		TableID: t.ID,
		Name:    t.GetSharedReplayLeaderName(),
	})
}

// NotifyNoteList sends them all of the notes from the players & spectators
// (there will be no spectator notes if this is a replay spawned from the database)
func (s *Session) NotifyNoteList(t *Table, shadowingPlayerIndex int) {
	g := t.Game

	type NoteList struct {
		Name  string   `json:"name"`
		Notes []string `json:"notes"`
	}

	// Get the notes from all the players & spectators
	notes := make([]NoteList, 0)
	for _, p := range g.Players {
		if shadowingPlayerIndex == -1 || shadowingPlayerIndex == p.Index {
			notes = append(notes, NoteList{
				Name:  p.Name,
				Notes: p.Notes,
			})
		}
	}
	if !t.Replay && shadowingPlayerIndex == -1 {
		for _, sp := range t.Spectators {
			notes = append(notes, NoteList{
				Name:  sp.Name,
				Notes: sp.Notes,
			})
		}
	}

	// Send it
	type NoteListMessage struct {
		TableID uint64     `json:"tableID"`
		Notes   []NoteList `json:"notes"`
	}
	s.Emit("noteList", &NoteListMessage{
		TableID: t.ID,
		Notes:   notes,
	})
}
