package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

/*
	Out-of-game notify functions
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

// NotifyTable will notify a user about a new game or a change in an existing game
func (s *Session) NotifyTable(g *Game) {
	i := g.GetPlayerIndex(s.UserID())
	joined := false
	if i != -1 {
		joined = true
	}

	numPlayers := len(g.Players)
	if g.Replay {
		numPlayers = len(g.Spectators)
	}

	playerNames := make([]string, 0)
	for _, p := range g.Players {
		playerNames = append(playerNames, p.Name)
	}
	players := strings.Join(playerNames, ", ")
	if players == "" {
		players = "-"
	}

	spectatorNames := make([]string, 0)
	for _, sp := range g.Spectators {
		spectatorNames = append(spectatorNames, sp.Name)
	}
	spectators := strings.Join(spectatorNames, ", ")
	if spectators == "" {
		spectators = "-"
	}

	type TableMessage struct {
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
	s.Emit("table", &TableMessage{
		ID:           g.ID,
		Name:         g.Name,
		Password:     len(g.Password) > 0,
		Joined:       joined,
		NumPlayers:   numPlayers,
		Owned:        s.UserID() == g.Owner,
		Running:      g.Running,
		Variant:      g.Options.Variant,
		Timed:        g.Options.Timed,
		BaseTime:     g.Options.BaseTime,
		TimePerTurn:  g.Options.TimePerTurn,
		OurTurn:      joined && g.Running && g.ActivePlayer == i,
		SharedReplay: g.Replay,
		Progress:     g.Progress,
		Players:      players,
		Spectators:   spectators,
	})
}

// NotifyTableGone will notify someone about a game that ended
func (s *Session) NotifyTableGone(g *Game) {
	type TableGoneMessage struct {
		ID int `json:"id"`
	}
	s.Emit("tableGone", &TableGoneMessage{
		ID: g.ID,
	})
}

func (s *Session) NotifyChat(msg string, who string, discord bool, server bool, datetime time.Time, room string) {
	s.Emit("chat", chatMakeMessage(msg, who, discord, server, datetime, room))
}

// NotifyGameHistory will send a user a subset of their past games
func (s *Session) NotifyGameHistory(h []*models.GameHistory, incrementNumGames bool) {
	type GameHistoryMessage struct {
		ID                int       `json:"id"`
		NumPlayers        int       `json:"numPlayers"`
		NumSimilar        int       `json:"numSimilar"`
		OtherPlayerNames  string    `json:"otherPlayerNames"`
		Score             int       `json:"score"`
		DatetimeFinished  time.Time `json:"datetime"`
		Variant           string    `json:"variant"`
		IncrementNumGames bool      `json:"incrementNumGames"`
	}
	m := make([]*GameHistoryMessage, 0)
	for _, g := range h {
		m = append(m, &GameHistoryMessage{
			ID:                g.ID,
			NumPlayers:        g.NumPlayers,
			NumSimilar:        g.NumSimilar,
			OtherPlayerNames:  g.OtherPlayerNames,
			Score:             g.Score,
			DatetimeFinished:  g.DatetimeFinished,
			Variant:           g.Variant,
			IncrementNumGames: incrementNumGames,
		})
	}
	s.Emit("gameHistory", &m)
}

func (s *Session) NotifyGameStart() {
	type GameStartMessage struct {
		Replay bool `json:"replay"`
	}
	s.Emit("gameStart", &GameStartMessage{
		Replay: s.Status() == statusReplay || s.Status() == statusSharedReplay,
	})
}

/*
	In-game notify functions
*/

// NotifyConnected will send someone a list corresponding to which players are connected
// On the client, this changes the player name-tags different colors
func (s *Session) NotifyConnected(g *Game) {
	// Make the list
	list := make([]bool, 0)
	for _, p := range g.Players {
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
func (s *Session) NotifyAction(g *Game) {
	type ActionMessage struct {
		CanClue          bool `json:"canClue"`
		CanDiscard       bool `json:"canDiscard"`
		CanBlindPlayDeck bool `json:"canBlindPlayDeck"`
	}
	canClue := g.Clues >= 1
	if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
		canClue = g.Clues >= 2
	}
	s.Emit("action", &ActionMessage{
		CanClue:          canClue,
		CanDiscard:       g.Clues != maxClues,
		CanBlindPlayDeck: g.Options.DeckPlays && g.DeckIndex == len(g.Deck)-1,
	})
}

func (s *Session) NotifyGameAction(a interface{}, g *Game, p *Player) {
	// Check to see if we need to remove some card information
	drawAction, ok := a.(ActionDraw)
	if ok && drawAction.Type == "draw" {
		drawAction.Scrub(g, p)
		a = drawAction
	}

	s.Emit("notify", a)
}

func (s *Session) NotifySound(g *Game, i int) {
	// Prepare the sound message
	sound := "turn_other"
	if g.Sound != "" {
		sound = g.Sound
	} else if i == g.ActivePlayer {
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

func (s *Session) NotifyTime(g *Game) {
	// Create the clock message
	times := make([]int64, 0)
	for i, p := range g.Players {
		// We could be sending the message in the middle of someone's turn, so account for this
		timeLeft := p.Time
		if g.ActivePlayer == i {
			elapsedTime := time.Since(g.TurnBeginTime)
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
		Active: g.ActivePlayer,
	})
}

func (s *Session) NotifyPause(g *Game) {
	type PauseMessage struct {
		Paused      bool   `json:"paused"`
		PausePlayer string `json:"pausePlayer"`
	}
	s.Emit("pause", &PauseMessage{
		Paused:      g.Paused,
		PausePlayer: g.Players[g.PausePlayer].Name,
	})
}

func (s *Session) NotifySpectators(g *Game) {
	// Build an array with the names of all of the spectators
	names := make([]string, 0)
	for _, sp := range g.Spectators {
		names = append(names, sp.Name)
	}

	type SpectatorsMessage struct {
		Names []string `json:"names"`
	}
	s.Emit("spectators", &SpectatorsMessage{
		Names: names,
	})
}

func (s *Session) NotifyReplayLeader(g *Game) {
	// Get the username of the game owner
	// (the "Owner" field is used to store the leader of the shared replay)
	name := ""
	for _, sp := range g.Spectators {
		if sp.ID == g.Owner {
			name = sp.Name
			break
		}
	}

	if name == "" {
		// The leader is not currently present, so try getting their username from the players object
		for _, p := range g.Players {
			if p.ID == g.Owner {
				name = p.Name
				break
			}
		}
	}

	if name == "" {
		// The leader is not currently present and was not a member of the original game,
		// so we need to look up their username from the database
		if v, err := db.Users.GetUsername(g.Owner); err != nil {
			log.Error("Failed to get the username for user "+strconv.Itoa(g.Owner)+" who is the owner of game:", g.ID)
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
func (s *Session) NotifyNoteList(g *Game) {
	// Get the notes from all the players & spectators
	notes := make([]models.NoteList, 0)
	for _, p := range g.Players {
		notes = append(notes, models.NoteList{
			ID:    p.ID,
			Name:  p.Name,
			Notes: p.Notes,
		})
	}
	for _, sp := range g.Spectators {
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
