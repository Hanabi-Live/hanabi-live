package main

import (
	"strconv"
	"time"
)

/*
	Lobby notify functions
*/

// NotifyUser will notify someone about a new user that connected or a change in an existing user
func (s *Session) NotifyUser(u *Session) {
	s.Emit("user", makeUserMessage(u))
}

type UserMessage struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

func makeUserMessage(s *Session) *UserMessage {
	return &UserMessage{
		ID:     s.UserID(),
		Name:   s.Username(),
		Status: status[s.Status()], // Status declarations are in the "constants.go" file
	}
}

// NotifyUserLeft will notify someone about a user that disconnected
func (s *Session) NotifyUserLeft(u *Session) {
	type UserLeftMessage struct {
		ID int `json:"id"`
	}
	s.Emit("userLeft", &UserLeftMessage{
		ID: u.UserID(),
	})
}

// NotifyUserInactive will notify someone about a user that is either
// inactive or coming back from inactive status
func (s *Session) NotifyUserInactive(u *Session) {
	type UserInactiveMessage struct {
		ID       int  `json:"id"`
		Inactive bool `json:"inactive"`
	}
	s.Emit("userInactive", &UserInactiveMessage{
		ID:       u.UserID(),
		Inactive: u.Inactive(),
	})
}

// NotifyTable will notify a user about a new game or a change in an existing game
func (s *Session) NotifyTable(t *Table) {
	s.Emit("table", makeTableMessage(s, t))
}

type TableMessage struct {
	ID                int      `json:"id"`
	Name              string   `json:"name"`
	PasswordProtected bool     `json:"passwordProtected"`
	Joined            bool     `json:"joined"`
	NumPlayers        int      `json:"numPlayers"`
	Owned             bool     `json:"owned"`
	Running           bool     `json:"running"`
	Variant           string   `json:"variant"`
	Timed             bool     `json:"timed"`
	BaseTime          int      `json:"baseTime"`
	TimePerTurn       int      `json:"timePerTurn"`
	SharedReplay      bool     `json:"sharedReplay"`
	Progress          int      `json:"progress"`
	Players           []string `json:"players"`
	Spectators        []string `json:"spectators"`
}

func makeTableMessage(s *Session, t *Table) *TableMessage {
	i := t.GetPlayerIndexFromID(s.UserID())
	joined := false
	if i != -1 {
		joined = true
	}

	numPlayers := len(t.Players)
	if t.Replay {
		numPlayers = len(t.Spectators)
	}

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
		Joined:            joined,
		NumPlayers:        numPlayers,
		Owned:             s.UserID() == t.Owner,
		Running:           t.Running,
		Variant:           t.Options.Variant,
		Timed:             t.Options.Timed,
		BaseTime:          t.Options.BaseTime,
		TimePerTurn:       t.Options.TimePerTurn,
		SharedReplay:      t.Replay,
		Progress:          t.Progress,
		Players:           players,
		Spectators:        spectators,
	}
}

func (s *Session) NotifyTableProgress(t *Table) {
	type TableProgressMessage struct {
		ID       int `json:"id"`
		Progress int `json:"progress"`
	}
	s.Emit("tableProgress", &TableProgressMessage{
		ID:       t.ID,
		Progress: t.Progress,
	})
}

// NotifyTableGone will notify someone about a game that ended
func (s *Session) NotifyTableGone(t *Table) {
	type TableGoneMessage struct {
		ID int `json:"id"`
	}
	s.Emit("tableGone", &TableGoneMessage{
		ID: t.ID,
	})
}

func (s *Session) NotifyChatTyping(name string, typing bool) {
	type ChatTypingMessage struct {
		Name   string `json:"name"`
		Typing bool   `json:"typing"`
	}
	s.Emit("chatTyping", &ChatTypingMessage{
		Name:   name,
		Typing: typing,
	})
}

// NotifyGameHistory will send a user a subset of their past games
func (s *Session) NotifyGameHistory(historyListDatabase []*GameHistory, incrementNumGames bool) {
	type GameHistoryMessage struct {
		ID                int       `json:"id"`
		NumPlayers        int       `json:"numPlayers"`
		NumSimilar        int       `json:"numSimilar"`
		PlayerNames       string    `json:"playerNames"`
		Score             int       `json:"score"`
		DatetimeFinished  time.Time `json:"datetime"`
		Variant           string    `json:"variant"`
		IncrementNumGames bool      `json:"incrementNumGames"`
	}
	historyList := make([]*GameHistoryMessage, 0)
	for _, g := range historyListDatabase {
		historyList = append(historyList, &GameHistoryMessage{
			ID:                g.ID,
			NumPlayers:        g.NumPlayers,
			NumSimilar:        g.NumSimilar,
			PlayerNames:       g.PlayerNames,
			Score:             g.Score,
			DatetimeFinished:  g.DatetimeFinished,
			Variant:           g.Variant,
			IncrementNumGames: incrementNumGames,
		})
	}
	s.Emit("gameHistory", &historyList)
}

func (s *Session) NotifyTableStart(t *Table) {
	type TableStartMessage struct {
		TableID int  `json:"tableID"`
		Replay  bool `json:"replay"`
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
		ShuttingDown:         shuttingDown,
		DatetimeShutdownInit: datetimeShutdownInit,
	})
}

func (s *Session) NotifyMaintenance() {
	type MaintenanceMessage struct {
		MaintenanceMode bool `json:"maintenanceMode"`
	}
	s.Emit("maintenance", &MaintenanceMessage{
		MaintenanceMode: maintenanceMode,
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
		List []bool `json:"list"`
	}
	s.Emit("connected", &ConnectedMessage{
		List: list,
	})
}

// NotifyYourTurn will send someone an "yourTurn" message
// This is sent at the beginning of their turn to bring up the clue UI
func (s *Session) NotifyYourTurn(t *Table) {
	type YourTurnMessage struct {
		TableID int `json:"tableID"`
	}
	s.Emit("yourTurn", &YourTurnMessage{
		TableID: t.ID,
	})
}

func (s *Session) NotifyGameAction(action interface{}, t *Table) {
	// Check to see if we need to remove some card information
	drawAction, ok := action.(ActionDraw)
	if ok && drawAction.Type == "draw" {
		drawAction.Scrub(t, s.UserID())
		action = drawAction
	}

	type GameActionMessage struct {
		TableID int         `json:"tableID"`
		Action  interface{} `json:"action"`
	}
	s.Emit("gameAction", &GameActionMessage{
		TableID: t.ID,
		Action:  action,
	})
}

func (s *Session) NotifySound(t *Table, i int) {
	g := t.Game

	// Prepare the sound message, depending on if it is their turn
	var sound string
	if g.Sound != "" {
		sound = g.Sound
	} else if i == g.ActivePlayer {
		sound = "turn_us"
	} else {
		sound = "turn_other"
	}

	// Also check to see if this player is "surprised" from playing/discarding a card
	if i > -1 {
		p := g.Players[i]
		if p.Surprised {
			p.Surprised = false
			sound = "turn_surprise"
		}
	}

	type SoundMessage struct {
		File string `json:"file"`
	}
	data := &SoundMessage{
		File: sound,
	}
	s.Emit("sound", data)
}

func (s *Session) NotifyTime(t *Table) {
	g := t.Game

	// Create the clock message
	times := make([]int64, 0)
	for i, p := range g.Players {
		// We could be sending the message in the middle of someone's turn, so account for this
		timeLeft := p.Time
		if g.ActivePlayer == i {
			elapsedTime := time.Since(g.DatetimeTurnBegin)
			timeLeft -= elapsedTime
		}

		// JavaScript expects time in milliseconds
		milliseconds := int64(timeLeft / time.Millisecond)
		times = append(times, milliseconds)
	}
	timeTaken := int64(time.Since(g.DatetimeTurnBegin) / time.Millisecond)

	type ClockMessage struct {
		Times     []int64 `json:"times"`
		Active    int     `json:"active"`
		TimeTaken int64   `json:"timeTaken"`
	}
	s.Emit("clock", &ClockMessage{
		Times:     times,
		Active:    g.ActivePlayer,
		TimeTaken: timeTaken,
	})
}

func (s *Session) NotifyPause(t *Table) {
	g := t.Game

	type PauseMessage struct {
		Paused      bool   `json:"paused"`
		PausePlayer string `json:"pausePlayer"`
	}
	s.Emit("pause", &PauseMessage{
		Paused:      g.Paused,
		PausePlayer: t.Players[g.PausePlayer].Name,
	})
}

func (s *Session) NotifySpectators(t *Table) {
	// Build an array with the names of all of the spectators
	names := make([]string, 0)
	for _, sp := range t.Spectators {
		names = append(names, sp.Name)
	}

	type SpectatorsMessage struct {
		Names []string `json:"names"`
	}
	s.Emit("spectators", &SpectatorsMessage{
		Names: names,
	})
}

func (s *Session) NotifyReplayLeader(t *Table, playAnimation bool) {
	// Get the username of the game owner
	// (the "Owner" field is used to store the leader of the shared replay)
	name := ""
	for _, sp := range t.Spectators {
		if sp.ID == t.Owner {
			name = sp.Name
			break
		}
	}

	if name == "" {
		// The leader is not currently present,
		// so try getting their username from the players object
		for _, p := range t.Players {
			if p.ID == t.Owner {
				name = p.Name
				break
			}
		}
	}

	if name == "" {
		// The leader is not currently present and was not a member of the original game,
		// so we need to look up their username from the database
		if v, err := models.Users.GetUsername(t.Owner); err != nil {
			logger.Error("Failed to get the username for user "+strconv.Itoa(t.Owner)+
				" who is the owner of table:", t.ID)
			name = "(Unknown)"
		} else {
			name = v
		}
	}

	// Send it
	type ReplayLeaderMessage struct {
		Name          string `json:"name"`
		PlayAnimation bool   `json:"playAnimation"`
	}
	s.Emit("replayLeader", &ReplayLeaderMessage{
		Name:          name,
		PlayAnimation: playAnimation,
	})
}

// NotifyNoteList sends them all of the notes from the players & spectators
// (there will be no spectator notes if this is a replay spawned from the database)
func (s *Session) NotifyNoteList(t *Table) {
	g := t.Game

	type NoteList struct {
		ID    int      `json:"id"`
		Name  string   `json:"name"`
		Notes []string `json:"notes"`
	}

	// Get the notes from all the players & spectators
	notes := make([]NoteList, 0)
	for _, p := range g.Players {
		notes = append(notes, NoteList{
			ID:    t.Players[p.Index].ID,
			Name:  p.Name,
			Notes: p.Notes,
		})
	}
	if !t.Replay {
		for _, sp := range t.Spectators {
			notes = append(notes, NoteList{
				ID:    sp.ID,
				Name:  sp.Name,
				Notes: sp.Notes,
			})
		}
	}

	// Send it
	type NoteListMessage struct {
		Notes []NoteList `json:"notes"`
	}
	s.Emit("noteList", &NoteListMessage{
		Notes: notes,
	})
}
