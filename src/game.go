package main

import (
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

type Game struct {
	ID              int
	Name            string
	Owner           int
	Options         *Options
	Players         []*Player
	Spectators      map[string]*Player
	Running         bool
	SharedReplay    bool
	DatetimeCreated int64
	DatetimeStarted int64
	EndCondition    int

	Seed          string
	Deck          []*Card
	DeckIndex     int
	Stacks        []int
	Turn          int
	PlayerIndex   int
	Clues         int
	Score         int
	Progress      int
	Strikes       int
	Actions       []*Action
	DiscardSignal *DiscardSignal
	CurrentSound  string
	TurnBeginTime time.Time
	EndTurn       int
}

type Options struct {
	Variant      int
	Timed        bool
	TimeBase     int
	TimePerTurn  int
	ReorderCards bool
}

type Card struct {
	Order   int
	Suit    int
	Rank    int
	Touched bool
}

type Action struct {
	Type      string
	Who       int
	Rank      int
	Suit      int
	Text      string
	Target    int
	HandOrder []int
	Clue      Clue
	Giver     int
	List      []int
}

type DiscardSignal struct {
	Outstanding    bool
	TurnExpiration int
}

/*
	Miscellaneous functions
*/

func (g *Game) GetName() string {
	return "#" + strconv.Itoa(g.ID) + " (" + g.Name + ")"
}

func (g *Game) GetIndex(name string) int {
	for i, p := range g.Players {
		if p.Name == name {
			return i
		}
	}
	return -1
}

/*
	Notify functions
*/

// Send the people in the game an update about the new amount of players
func (g *Game) NotifyPlayerChange() {
	for _, p := range g.Players {
		type GameMessage struct {
			Name         string `json:"name"`
			Running      bool   `json:"running"`
			NumPlayers   int    `json:"numPlayers"`
			Variant      int    `json:"variant"`
			Timed        bool   `json:"timed"`
			BaseTime     int    `json:"baseTime"`
			TimePerTurn  int    `json:"timePerTurn"`
			ReorderCards bool   `json:"reorderCards"`
			SharedReplay bool   `json:"sharedReplay"`
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

		// Lastly, send the table owner whether or not the "Start Game" button should be greyed out
		if p.ID == g.Owner {
			type TableReadyMessage struct {
				Ready bool `json:"ready"`
			}
			p.Session.Emit("tableReady", &TableReadyMessage{
				Ready: len(g.Players) >= 2,
			})
		}
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
		s.Session.Emit("connected", data)
	}
}

// Send the people in the game an update about the new action
func (g *Game) NotifyAction() {
	action := g.Actions[len(g.Actions)-1] // The last action
	msgType := "notify"
	if action.Text != "" {
		msgType = "message"
	}

	for i, p := range g.Players {
		// Scrub card info from cards if the card is in their own hand
		scrubbed := false
		var scrubbedAction *Action
		if action.Type == "draw" && action.Who == i {
			scrubbed = true
			scrubbedAction = &Action{
				Rank: -1,
				Suit: -1,
			}
		}
		if scrubbed {
			action = scrubbedAction
		}
		p.Session.Emit(msgType, action)

	}

	// Also send the spectators an update
	for _, s := range g.Spectators {
		s.Session.Emit(msgType, action)
	}
}

func (g *Game) NotifySpectators() {
	for _, p := range g.Players {
		p.Session.NotifySpectators(g)
	}

	for _, s := range g.Spectators {
		s.Session.NotifySpectators(g)
	}
}

func (g *Game) NotifyTime() {
	// Create the clock message
	type ClockMessage struct {
		Times  []int `json:"times"`
		Active int   `json:"active"`
	}
	var times []int
	for _, p := range g.Players {
		times = append(times, p.Time)
	}
	active := g.PlayerIndex
	if g.EndCondition > 0 {
		active = -1
	}
	data := &ClockMessage{
		Times:  times,
		Active: active,
	}

	for _, p := range g.Players {
		p.Session.Emit("clock", data)
	}

	for _, s := range g.Spectators {
		s.Session.Emit("clock", data)
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
		if g.CurrentSound != "" {
			sound = g.CurrentSound
		} else if i == g.PlayerIndex {
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
		if g.CurrentSound != "" {
			sound = g.CurrentSound
		}
		data := &SoundMessage{
			File: sound,
		}
		s.Session.Emit("sound", data)
	}
}

func (g *Game) NotifyBoot(who int) {
	// Send a boot notification
	type BootMessage struct {
		Who int `json:"who"`
	}
	data := &BootMessage{
		Who: who,
	}

	for _, p := range g.Players {
		p.Session.Emit("boot", data)
	}

	for _, s := range g.Spectators {
		s.Session.Emit("boot", data)
	}
}

func (g *Game) NotifySpectatorsNote(order int) {
	// Make an array that contains the notes for just this card
	var notes []string
	for _, p := range g.Players {
		notes = append(notes, p.Notes[order])
	}

	type NoteMessage struct {
		Order int      `json:"order"` // The order of the card in the deck that these notes correspond to
		Notes []string `json:"notes"` // One element for each player
	}
	data := &NoteMessage{
		Order: order,
		Notes: notes,
	}

	for _, s := range g.Spectators {
		s.Session.Emit("note", data)
	}
}

/*
	Other major functions
*/

func (g *Game) End() {

}
