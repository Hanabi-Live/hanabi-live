package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

/*
	Out-of-table notify functions
*/

// NotifyUser will notify someone about a new user that connected or a change in an existing user
func (s *Session) NotifyUser(u *Session) {
	type UserMessage struct {
		ID     int    `json:"id"`
		Name   string `json:"name"`
		Status string `json:"status"`
	}
	s.Emit("user", &UserMessage{
		ID:     u.UserID(),
		Name:   u.Username(),
		Status: status[u.Status()], // Status declarations are in the "constants.go" file
	})
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

// NotifyTable will notify a user about a new table or a change in an existing table
func (s *Session) NotifyTable(t *Table) {
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	joined := false
	if i != -1 {
		joined = true
	}

	numPlayers := len(t.GameSpec.Players)
	if t.Game.Replay {
		numPlayers = len(t.Spectators)
	}

	playerNames := make([]string, 0)
	for _, p := range t.GameSpec.Players {
		playerNames = append(playerNames, p.Name)
	}
	players := strings.Join(playerNames, ", ")
	if players == "" {
		players = "-"
	}

	spectatorNames := make([]string, 0)
	for _, sp := range t.Spectators {
		spectatorNames = append(spectatorNames, sp.Name)
	}
	spectators := strings.Join(spectatorNames, ", ")
	if spectators == "" {
		spectators = "-"
	}

        // The subset of the table information that is displayed in the lobby
	type TableLobbyInfoMessage struct {
		ID           int    `json:"id"`
		Name         string `json:"name"`
		Password     bool   `json:"password"`
		Joined       bool   `json:"joined"`
		NumPlayers   int    `json:"numPlayers"`
		Owned        bool   `json:"owned"`
		Running      bool   `json:"running"`
		Variant      string `json:"variant"`
		Timed        bool   `json:"timed"`
		BaseTime     int    `json:"baseTime"`
		TimePerTurn  int    `json:"timePerTurn"`
		OurTurn      bool   `json:"ourTurn"`
		SharedReplay bool   `json:"sharedReplay"`
		Progress     int    `json:"progress"`
		Players      string `json:"players"`
		Spectators   string `json:"spectators"`
	}
	s.Emit("tableLobbyInfo", &TableLobbyInfoMessage{
		ID:           t.ID,
		Name:         t.Name,
		Password:     len(t.Password) > 0,
		Joined:       joined,
		NumPlayers:   numPlayers,
		Owned:        s.UserID() == t.Owner,
		Running:      t.Game.Running,
		Variant:      t.GameSpec.Options.Variant,
		Timed:        t.GameSpec.Options.Timed,
		BaseTime:     t.GameSpec.Options.BaseTime,
		TimePerTurn:  t.GameSpec.Options.TimePerTurn,
		OurTurn:      joined && t.Game.Running && t.Game.ActivePlayer == i,
		SharedReplay: t.Game.Replay,
		Progress:     t.Game.Progress,
		Players:      players,
		Spectators:   spectators,
	})
}

// NotifyTableGone will notify someone about a table that ended
func (s *Session) NotifyTableGone(t *Table) {
	type TableGoneMessage struct {
		ID int `json:"id"`
	}
	s.Emit("tableGone", &TableGoneMessage{
		ID: t.ID,
	})
}

func (s *Session) NotifyChat(msg string, who string, discord bool, server bool, datetime time.Time, room string) {
	s.Emit("chat", chatMakeMessage(msg, who, discord, server, datetime, room))
}

// NotifyTableHistory will send a user a subset of their past tables
func (s *Session) NotifyTableHistory(h []*models.GameHistory, incrementNumTables bool) {
	type TableHistoryMessage struct {
		ID                int       `json:"id"`
		NumPlayers        int       `json:"numPlayers"`
		NumSimilar        int       `json:"numSimilar"`
		OtherPlayerNames  string    `json:"otherPlayerNames"`
		Score             int       `json:"score"`
		DatetimeFinished  time.Time `json:"datetime"`
		Variant           string    `json:"variant"`
		IncrementNumTables bool      `json:"incrementNumTables"`
	}
	m := make([]*TableHistoryMessage, 0)
	for _, g := range h {
		m = append(m, &TableHistoryMessage{
			ID:                g.ID,
			NumPlayers:        g.NumPlayers,
			NumSimilar:        g.NumSimilar,
			OtherPlayerNames:  g.OtherPlayerNames,
			Score:             g.Score,
			DatetimeFinished:  g.DatetimeFinished,
			Variant:           g.Variant,
			IncrementNumTables: incrementNumTables,
		})
	}
	s.Emit("gameHistory", &m)
}

func (s *Session) NotifyTableStart() {
	type TableStartMessage struct {
		Replay bool `json:"replay"`
	}
	s.Emit("gameStart", &TableStartMessage{
		Replay: s.Status() == statusReplay || s.Status() == statusSharedReplay,
	})
}

/*
	In-table notify functions
*/

// NotifyConnected will send someone a list corresponding to which players are connected
// On the client, this changes the player name-tags different colors
func (s *Session) NotifyConnected(t *Table) {
	// Make the list
	list := make([]bool, 0)
	for _, p := range t.GameSpec.Players {
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

// NotifyAction will send someone an "action" message
// This is sent at the beginning of their turn and lists the allowed actions on this turn
func (s *Session) NotifyAllowedActions(t *Table) {
	type AllowedActionsMessage struct {
		CanClue          bool `json:"canClue"`
		CanDiscard       bool `json:"canDiscard"`
		CanBlindPlayDeck bool `json:"canBlindPlayDeck"`
	}
	canClue := t.Game.Clues >= 1
	if strings.HasPrefix(t.GameSpec.Options.Variant, "Clue Starved") {
		canClue = t.Game.Clues >= 2
	}
	s.Emit("allowedActions", &AllowedActionsMessage{
		CanClue:          canClue,
		CanDiscard:       t.Game.Clues != maxClues,
		CanBlindPlayDeck: t.GameSpec.Options.DeckPlays && t.Game.DeckIndex == len(t.Game.Deck)-1,
	})
}

func (s *Session) NotifyTableAction(a interface{}, t *Table, p *Player) {
	// Check to see if we need to remove some card information
	drawAction, ok := a.(ActionDraw)
	if ok && drawAction.Type == "draw" {
		drawAction.Scrub(t, p)
		a = drawAction
	}

	s.Emit("notify", a)
}

func (s *Session) NotifySound(t *Table, i int) {
	// Prepare the sound message
	sound := "turn_other"
	if t.Game.Sound != "" {
		sound = t.Game.Sound
	} else if i == t.Game.ActivePlayer {
		sound = "turn_us"
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
	// Create the clock message
	times := make([]int64, 0)
	for i, p := range t.GameSpec.Players {
		// We could be sending the message in the middle of someone's turn, so account for this
		timeLeft := p.Time
		if t.Game.ActivePlayer == i {
			elapsedTime := time.Since(t.Game.TurnBeginTime)
			timeLeft -= elapsedTime
		}

		// JavaScript expects time in milliseconds
		milliseconds := int64(timeLeft / time.Millisecond)
		times = append(times, milliseconds)
	}

	type ClockMessage struct {
		Times  []int64 `json:"times"`
		Active int     `json:"active"`
	}
	s.Emit("clock", &ClockMessage{
		Times:  times,
		Active: t.Game.ActivePlayer,
	})
}

func (s *Session) NotifyPause(t *Table) {
	type PauseMessage struct {
		Paused      bool   `json:"paused"`
		PausePlayer string `json:"pausePlayer"`
	}
	s.Emit("pause", &PauseMessage{
		Paused:      t.Game.Paused,
		PausePlayer: t.GameSpec.Players[t.Game.PausePlayer].Name,
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

func (s *Session) NotifyReplayLeader(t *Table) {
	// Get the username of the table owner
	// (the "Owner" field is used to store the leader of the shared replay)
	name := ""
	for _, sp := range t.Spectators {
		if sp.ID == t.Owner {
			name = sp.Name
			break
		}
	}

	if name == "" {
		// The leader is not currently present, so try getting their username from the players object
		for _, p := range t.GameSpec.Players {
			if p.ID == t.Owner {
				name = p.Name
				break
			}
		}
	}

	if name == "" {
		// The leader is not currently present and was not a member of the original table,
		// so we need to look up their username from the database
		if v, err := db.Users.GetUsername(t.Owner); err != nil {
			log.Error("Failed to get the username for user "+strconv.Itoa(t.Owner)+" who is the owner of table:", t.ID)
			return
		} else {
			name = v
		}
	}

	// Send it
	type ReplayLeaderMessage struct {
		Name string `json:"name"`
	}
	s.Emit("replayLeader", &ReplayLeaderMessage{
		Name: name,
	})
}

// NotifyNoteList sends them all of the notes from the players & spectators
// (there will be no spectator notes if this is a replay spawned from the database)
func (s *Session) NotifyNoteList(t *Table) {
	// Get the notes from all the players & spectators
	notes := make([]models.NoteList, 0)
	for _, p := range t.GameSpec.Players {
		notes = append(notes, models.NoteList{
			ID:    p.ID,
			Name:  p.Name,
			Notes: p.Notes,
		})
	}
	for _, sp := range t.Spectators {
		notes = append(notes, models.NoteList{
			ID:    sp.ID,
			Name:  sp.Name,
			Notes: sp.Notes,
		})
	}

	// Send it
	type NoteListMessage struct {
		Notes []models.NoteList `json:"notes"`
	}
	s.Emit("noteList", &NoteListMessage{
		Notes: notes,
	})
}
