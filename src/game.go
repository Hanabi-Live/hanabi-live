package main

import (
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

type Game struct {
	ID                 int
	Name               string
	Owner              int    // The user ID of the person who started the game or the current leader of the shared replay
	Password           string // This is a salted SHA512 hash
	Options            *Options
	Players            []*Player
	Spectators         map[int]*Session
	DisconSpectators   map[int]bool
	Running            bool
	SharedReplay       bool
	DatetimeCreated    time.Time
	DatetimeLastAction time.Time
	DatetimeStarted    time.Time
	DatetimeFinished   time.Time
	EndCondition       int // See "database_schema.sql" for mappings

	Seed          string
	Deck          []*Card
	DeckIndex     int
	Stacks        []int
	Turn          int
	ActivePlayer  int
	Clues         int
	Score         int
	MaxScore      int
	Progress      int
	Strikes       int
	Actions       []Action // We don't want this to be a pointer because this simplifies scrubbing
	DiscardSignal *DiscardSignal
	Sound         string
	TurnBeginTime time.Time
	EndTurn       int
	BlindPlays    int // The number of consecutive blind plays
}

type Options struct {
	Variant      int
	Timed        bool
	TimeBase     float64
	TimePerTurn  int
	ReorderCards bool
	EmptyClues   bool
}

type DiscardSignal struct {
	Outstanding    bool
	TurnExpiration int
}

/*
	Miscellaneous functions
*/

func (g *Game) GetName() string {
	return "Game #" + strconv.Itoa(g.ID) + " (" + g.Name + ") - Turn " + strconv.Itoa(g.Turn) + " - "
}

func (g *Game) GetIndex(id int) int {
	// If this function is called for a replay, the game will be nil, so account for this
	if g == nil {
		return -1
	}

	for i, p := range g.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

/*
	Notify functions
*/

// NotifyPlayerChange sends the people in the game an update about the new amount of players
func (g *Game) NotifyPlayerChange() {
	for _, p := range g.Players {
		type GameMessage struct {
			Name         string  `json:"name"`
			Running      bool    `json:"running"`
			NumPlayers   int     `json:"numPlayers"`
			Variant      int     `json:"variant"`
			Timed        bool    `json:"timed"`
			BaseTime     float64 `json:"baseTime"`
			TimePerTurn  int     `json:"timePerTurn"`
			ReorderCards bool    `json:"reorderCards"`
			SharedReplay bool    `json:"sharedReplay"`
		}
		p.Session.Emit("game", GameMessage{
			Name:         g.Name,
			Running:      g.Running,
			NumPlayers:   len(g.Players),
			Variant:      g.Options.Variant,
			Timed:        g.Options.Timed,
			BaseTime:     g.Options.TimeBase,
			TimePerTurn:  g.Options.TimePerTurn,
			ReorderCards: g.Options.ReorderCards,
			SharedReplay: g.SharedReplay,
		})

		// Tell the client to redraw all of the lobby rectanges to account for the new player
		if !g.Running {
			for j, p2 := range g.Players {
				type GamePlayerMessage struct {
					Index   int          `json:"index"`
					Name    string       `json:"name"`
					You     bool         `json:"you"`
					Present bool         `json:"present"`
					Stats   models.Stats `json:"stats"`
				}
				p.Session.Emit("gamePlayer", &GamePlayerMessage{
					Index:   j,
					Name:    p2.Name,
					You:     p.ID == p2.ID,
					Present: p2.Present,
					Stats:   p2.Stats,
				})
			}
		}
	}
}

func (g *Game) NotifyTableReady() {
	for _, p := range g.Players {
		if p.ID != g.Owner {
			continue
		}

		type TableReadyMessage struct {
			Ready bool `json:"ready"`
		}
		p.Session.Emit("tableReady", &TableReadyMessage{
			Ready: len(g.Players) >= 2,
		})
		break
	}
}

func (g *Game) NotifyConnected() {
	// Make a list of who is currently connected of the players in the current game
	list := make([]bool, 0)
	for _, p := range g.Players {
		list = append(list, p.Present)
	}

	// Send a "connected" message to all of the users in the game
	type ConnectedMessage struct {
		List []bool `json:"list"`
	}
	data := &ConnectedMessage{
		List: list,
	}
	for _, p := range g.Players {
		p.Session.Emit("connected", data)
	}

	// Also send it to the spectators
	for _, s := range g.Spectators {
		s.Emit("connected", data)
	}
}

// NotifyAction sends the people in the game an update about the new action
func (g *Game) NotifyAction() {
	a := g.Actions[len(g.Actions)-1] // The last action

	for _, p := range g.Players {
		p.Session.NotifyGameAction(a, g)
	}

	// Also send the spectators an update
	for _, s := range g.Spectators {
		s.NotifyGameAction(a, g)
	}
}

func (g *Game) NotifySpectators() {
	for _, p := range g.Players {
		p.Session.NotifySpectators(g)
	}

	for _, s := range g.Spectators {
		s.NotifySpectators(g)
	}
}

func (g *Game) NotifyTime() {
	for _, p := range g.Players {
		p.Session.NotifyClock(g)
	}

	for _, s := range g.Spectators {
		s.NotifyClock(g)
	}
}

func (g *Game) NotifySound() {
	type SoundMessage struct {
		File string `json:"file"`
	}

	// Send a sound notification
	for i, p := range g.Players {
		// Prepare the sound message
		sound := "turn_other"
		if g.Sound != "" {
			sound = g.Sound
		} else if i == g.ActivePlayer {
			sound = "turn_us"
		}
		data := &SoundMessage{
			File: sound,
		}
		p.Session.Emit("sound", data)
	}

	// Also send it to the spectators
	for _, s := range g.Spectators {
		// Prepare the sound message
		// (the code is duplicated here because I don't want to mess with
		// having to change the file name back to default)
		sound := "turn_other"
		if g.Sound != "" {
			sound = g.Sound
		}
		data := &SoundMessage{
			File: sound,
		}
		s.Emit("sound", data)
	}
}

func (g *Game) NotifyBoot() {
	// Boot the people in the game and/or shared replay back to the lobby screen
	type BootMessage struct {
		Type string `json:"type"`
	}
	msg := &BootMessage{
		Type: "boot",
	}

	for _, p := range g.Players {
		p.Session.Emit("notify", msg)
	}

	for _, s := range g.Spectators {
		s.Emit("notify", msg)
	}
}

func (g *Game) NotifySpectatorsNote(order int) {
	// Make an array that contains the notes for just this card
	notes := ""
	for _, p := range g.Players {
		notes += noteFormat(p.Name, p.Notes[order])
	}

	type NoteMessage struct {
		Order int    `json:"order"` // The order of the card in the deck that these notes correspond to
		Notes string `json:"notes"` // The combined notes for all the players, formatted by the server
	}
	data := &NoteMessage{
		Order: order,
		Notes: notes,
	}

	for _, s := range g.Spectators {
		s.Emit("note", data)
	}
}

/*
	Other major functions
*/

// CheckTimer is meant to be called in a new goroutine
func (g *Game) CheckTimer(turn int, p *Player) {
	// Sleep until the active player runs out of time
	time.Sleep(p.Time)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game ended already
	if g.EndCondition > 0 {
		return
	}

	// Check to see if we have made a move in the meanwhile
	if turn != g.Turn {
		return
	}

	p.Time = 0
	log.Info(g.GetName() + "Time ran out for \"" + p.Name + "\".")

	// End the game
	d := &CommandData{
		Type: 4,
	}
	commandAction(p.Session, d)
}

func (g *Game) CheckEnd() bool {
	// Check for 3 strikes
	if g.Strikes == 3 {
		log.Info(g.GetName() + "3 strike maximum reached; ending the game.")
		g.EndCondition = 2
		return true
	}

	// Check for the final go-around
	// (initiated after the last card is played from the deck)
	if g.Turn == g.EndTurn {
		log.Info(g.GetName() + "Final turn reached; ending the game.")
		g.EndCondition = 1
		return true
	}

	// Check to see if the maximum score has been reached
	if g.Score == g.MaxScore {
		log.Info(g.GetName() + "Maximum score reached; ending the game.")
		g.EndCondition = 1
		return true
	}

	// Check to see if there are any cards remaining that can be played on the stacks
	for i, stackLen := range g.Stacks {
		// Search through the deck
		neededSuit := i
		neededRank := stackLen + 1
		for _, c := range g.Deck {
			if c.Suit == neededSuit &&
				c.Rank == neededRank &&
				!c.Discarded {

				return false
			}
		}
	}

	// If we got this far, nothing can be played
	log.Info(g.GetName() + "No remaining cards can be played; ending the game.")
	g.EndCondition = 1
	return true
}

// CheckIdle is meant to be called in a new goroutine
func (g *Game) CheckIdle() {
	// Set the last action
	commandMutex.Lock()
	now := time.Now()
	g.DatetimeLastAction = now
	commandMutex.Unlock()

	// We want to clean up idle games, so sleep for a reasonable amount of time
	time.Sleep(idleGameTimeout + time.Second)
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Check to see if the game still exists
	if _, ok := games[g.ID]; !ok {
		return
	}

	// Don't do anything if there has been an action in the meantime
	if time.Since(g.DatetimeLastAction) < idleGameTimeout {
		return
	}

	log.Info("Idle timeout has elapsed; ending the game.")

	if g.SharedReplay {
		// If this is a shared replay, we want to send a message to the client that will take them back to the lobby
		g.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for _, s := range g.Spectators {
		commandGameUnattend(s, nil)
	}

	if g.SharedReplay {
		// If this is a shared replay, then we are done; the shared should automatically end now that all of the spectators have left
		return
	}

	// Get the session of the owner
	var s *Session
	for _, p := range g.Players {
		if p.Session.UserID() == g.Owner {
			s = p.Session
			break
		}
	}

	if g.Running {
		// We need to end a game that has started
		// (this will put everyone in a non-shared replay of the idle game)
		d := &CommandData{
			Type: 5, // Idle timeout
		}
		commandAction(s, d)
	} else {
		// We need to end a game that hasn't started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		commandGameLeave(s, nil)
	}
}
