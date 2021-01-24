package main

/*

import (
	"time"
)

// ----------------------
// Lobby notify functions
// ----------------------

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

// ------------------------
// In-game notify functions
// ------------------------

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

func (s *Session) NotifyBoot(t *Table) {
	type BootMessage struct {
		TableID uint64
	}
	s.Emit("boot", &BootMessage{
		TableID: t.ID,
	})
}

// -----------------------
// Replay notify functions
// -----------------------

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

*/
