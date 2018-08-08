package main

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
	melody "gopkg.in/olahol/melody.v1"
)

type Session struct {
	*melody.Session
}

/*
	Functions to return session values
*/

func (s *Session) ID() int {
	if v, exists := s.Get("ID"); !exists {
		log.Error("Failed to get \"ID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) UserID() int {
	if v, exists := s.Get("userID"); !exists {
		log.Error("Failed to get \"userID\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Username() string {
	if v, exists := s.Get("username"); !exists {
		log.Error("Failed to get \"username\" from a session.")
		return "Unknown"
	} else {
		return v.(string)
	}
}

func (s *Session) Admin() bool {
	var admin int
	if v, exists := s.Get("admin"); !exists {
		log.Error("Failed to get \"admin\" from a session.")
		return false
	} else {
		admin = v.(int)
	}

	if admin == 1 {
		return true
	} else {
		return false
	}
}

func (s *Session) CurrentGame() int {
	if v, exists := s.Get("currentGame"); !exists {
		log.Error("Failed to get \"currentGame\" from a session.")
		return -1
	} else {
		return v.(int)
	}
}

func (s *Session) Status() string {
	if v, exists := s.Get("status"); !exists {
		log.Error("Failed to get \"status\" from a session.")
		return "Unknown"
	} else {
		return v.(string)
	}
}

/*
	General purpose functions
*/

// Emit sends a message to a client using the Golem-style protocol described above
func (s *Session) Emit(command string, d interface{}) {
	// Convert the data to JSON
	var ds string
	if dj, err := json.Marshal(d); err != nil {
		log.Error("Failed to marshal data when writing to a WebSocket session:", err)
		return
	} else {
		ds = string(dj)
	}

	// Send the message as bytes
	msg := command + " " + ds
	bytes := []byte(msg)
	if err := s.Write(bytes); err != nil {
		// This can routinely fail if the session is closed, so just return
		return
	}
}

// Sent to the client if either their command was unsuccessful or something else went wrong
func (s *Session) Error(message string) {
	// Specify a default error message
	if message == "" {
		message = "Something went wrong. Please contact an administrator."
	}

	type ErrorMessage struct {
		Error string `json:"error"`
	}
	s.Emit("error", &ErrorMessage{
		message,
	})
}

/*
	Notify functions
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
		Status: u.Status(),
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
	i := g.GetIndex(s.UserID())
	joined := false
	if i != -1 {
		joined = true
	}

	numPlayers := len(g.Players)
	if g.SharedReplay {
		numPlayers = len(g.Spectators)
	}

	names := make([]string, 0)
	if g.SharedReplay {
		for _, s2 := range g.Spectators {
			names = append(names, s2.Username())
		}
	} else {
		for _, p := range g.Players {
			names = append(names, p.Name)
		}
	}
	players := strings.Join(names, ", ")

	type TableMessage struct {
		ID           int     `json:"id"`
		Name         string  `json:"name"`
		Joined       bool    `json:"joined"`
		NumPlayers   int     `json:"numPlayers"`
		Owned        bool    `json:"owned"`
		Running      bool    `json:"running"`
		Variant      int     `json:"variant"`
		Timed        bool    `json:"timed"`
		BaseTime     float64 `json:"baseTime"`
		TimePerTurn  int     `json:"timePerTurn"`
		ReorderCards bool    `json:"reorderCards"`
		OurTurn      bool    `json:"ourTurn"`
		SharedReplay bool    `json:"sharedReplay"`
		Progress     int     `json:"progress"`
		Players      string  `json:"players"`
	}
	s.Emit("table", &TableMessage{
		ID:           g.ID,
		Name:         g.Name,
		Joined:       joined,
		NumPlayers:   numPlayers,
		Owned:        s.UserID() == g.Owner,
		Running:      g.Running,
		Variant:      g.Options.Variant,
		Timed:        g.Options.Timed,
		BaseTime:     g.Options.TimeBase,
		TimePerTurn:  g.Options.TimePerTurn,
		ReorderCards: g.Options.ReorderCards,
		OurTurn:      joined && g.Running && g.ActivePlayer == i,
		SharedReplay: g.SharedReplay,
		Progress:     g.Progress,
		Players:      players,
	})
}

func (s *Session) NotifyGameStart() {
	type GameStartMessage struct {
		Replay bool `json:"replay"`
	}
	replay := false
	if s.Status() == "Replay" || s.Status() == "Shared Replay" {
		replay = true
	}
	s.Emit("gameStart", &GameStartMessage{
		Replay: replay,
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

func (s *Session) NotifyChat(msg string, who string, discord bool, server bool, datetime time.Time) {
	s.Emit("chat", chatMakeMessage(msg, who, discord, server, datetime))
}

// NotifyGameHistory will send a user all of their past games
func (s *Session) NotifyGameHistory(h []models.GameHistory) {
	type GameHistoryMessage struct {
		ID               int       `json:"id"`
		NumPlayers       int       `json:"numPlayers"`
		NumSimilar       int       `json:"numSimilar"`
		OtherPlayerNames string    `json:"otherPlayerNames"`
		Score            int       `json:"score"`
		DatetimeFinished time.Time `json:"datetime"`
		Variant          int       `json:"variant"`
	}
	m := make([]*GameHistoryMessage, 0)
	for _, g := range h {
		m = append(m, &GameHistoryMessage{
			ID:               g.ID,
			NumPlayers:       g.NumPlayers,
			NumSimilar:       g.NumSimilar,
			OtherPlayerNames: g.OtherPlayerNames,
			Score:            g.Score,
			DatetimeFinished: g.DatetimeFinished,
			Variant:          g.Variant,
		})
	}
	s.Emit("gameHistory", &m)
}

// NotifyAction will send someone an "action" message
// This is sent at the beginning of their turn and lists the allowed actions on this turn
func (s *Session) NotifyAction(g *Game) {
	type ActionMessage struct {
		CanClue                  bool `json:"canClue"`
		CanDiscard               bool `json:"canDiscard"`
		CanBlindPlayDeck         bool `json:"canBlindPlayDeck"`
		DiscardSignalOutstanding bool `json:"discardSignalOutstanding"`
	}
	s.Emit("action", &ActionMessage{
		CanClue:                  g.Clues > 0,
		CanDiscard:               g.Clues < 8,
		CanBlindPlayDeck:         g.DeckIndex == len(g.Deck)-1,
		DiscardSignalOutstanding: g.DiscardSignal.Outstanding,
	})
}

func (s *Session) NotifySpectators(g *Game) {
	// Build an array with the names of all of the spectators
	names := make([]string, 0)
	for _, s := range g.Spectators {
		names = append(names, s.Username())
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
	var name string
	for _, s := range g.Spectators {
		if s.UserID() == g.Owner {
			name = s.Username()
			break
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

func (s *Session) NotifyGameAction(a Action, g *Game) {
	msgType := "notify"
	if a.Text != "" {
		msgType = "message"
	}

	// We need to scrub the action of information so that we don't reveal
	// to the client anything about the cards that they are drawing
	i := g.GetIndex(s.UserID())
	if a.Type == "draw" && a.Who == i {
		a.Rank = -1
		a.Suit = -1
	}

	s.Emit(msgType, a)
}

func (s *Session) NotifyClock(g *Game) {
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

	active := g.ActivePlayer
	if g.EndCondition > 0 {
		active = -1
	}

	type ClockMessage struct {
		Times  []int64 `json:"times"`
		Active int     `json:"active"`
	}
	s.Emit("clock", &ClockMessage{
		Times:  times,
		Active: active,
	})
}

func (s *Session) NotifyAllNotes(playerNotes []models.PlayerNote) {
	// Compile all of the notes together
	combinedNotes := make([]string, 0)
	for _, playerNote := range playerNotes {
		for i, note := range playerNote.Notes {
			line := noteFormat(playerNote.Name, note)
			if len(combinedNotes) == i {
				combinedNotes = append(combinedNotes, line)
			} else {
				combinedNotes[i] += line
			}
		}
	}

	// Chop off all of the trailing newlines
	for i := range combinedNotes {
		combinedNotes[i] = strings.TrimSuffix(combinedNotes[i], "\n")
	}

	// Send it
	type NotesMessage struct {
		Notes []string `json:"notes"`
	}
	s.Emit("notes", &NotesMessage{
		Notes: combinedNotes,
	})
}
