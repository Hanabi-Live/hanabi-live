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
	Spectators      map[int]*Session
	Running         bool
	SharedReplay    bool
	DatetimeCreated time.Time
	DatetimeStarted time.Time
	EndCondition    int

	Seed          string
	Deck          []*Card
	DeckIndex     int
	Stacks        []int
	Turn          int
	ActivePlayer  int
	Clues         int
	Score         int
	Progress      int
	Strikes       int
	Actions       []*Action
	DiscardSignal *DiscardSignal
	Sound         string
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

type Action struct {
	Type      string `json:"type"`
	Who       int    `json:"who"`
	Rank      int    `json:"rank"`
	Suit      int    `json:"suit"`
	Text      string `json:"text"`
	Target    int    `json:"target"`
	HandOrder []int  `json:"handOrder"`
	Clue      Clue   `json:"clue"`
	Giver     int    `json:"giver"`
	List      []int  `json:"list"`
	Which     Which  `json:"which"`
	Num       int    `json:"num"`
	Order     int    `json:"order"`
	Size      int    `json:"size"`
	Clues     int    `json:"clues"`
	Score     int    `json:"score"`
	Loss      bool   `json:"loss"`
}

type Which struct {
	Index int `json:"index"`
	Rank  int `json:"rank"`
	Suit  int `json:"suit"`
	Order int `json:"order"`
}

type DiscardSignal struct {
	Outstanding    bool
	TurnExpiration int
}

/*
	Miscellaneous functions
*/

func (g *Game) GetName() string {
	return "Game #" + strconv.Itoa(g.ID) + " (" + g.Name + ") - "
}

func (g *Game) GetIndex(id int) int {
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
		s.Emit("connected", data)
	}
}

// Send the people in the game an update about the new action
func (g *Game) NotifyAction() {
	a := g.Actions[len(g.Actions)-1] // The last action

	for _, p := range g.Players {
		p.Session.NotifyGameAction(*a, g)
	}

	// Also send the spectators an update
	for _, s := range g.Spectators {
		s.NotifyGameAction(*a, g)
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
	// Create the clock message
	active := g.ActivePlayer
	var data interface{}
	if g.EndCondition > 0 {
		// The game is over, so send all nulls in order to reset the client-side clock
		type NullClockMessage struct {
			Times  []interface{} `json:"times"`
			Active int           `json:"active"`
		}
		data = &NullClockMessage{
			Times:  make([]interface{}, len(g.Players)),
			Active: active,
		}
	} else {
		var times []time.Duration
		for _, p := range g.Players {
			times = append(times, p.Time)
		}
		if g.EndCondition > 0 {
			active = -1
		}

		type ClockMessage struct {
			Times  []time.Duration `json:"times"`
			Active int             `json:"active"`
		}
		data = &ClockMessage{
			Times:  times,
			Active: active,
		}
	}

	for _, p := range g.Players {
		p.Session.Emit("clock", data)
	}

	for _, s := range g.Spectators {
		s.Emit("clock", data)
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

func (g *Game) NotifyBoot(who string) {
	// Send a boot notification
	type BootMessage struct {
		Who string `json:"who"`
	}
	data := &BootMessage{
		Who: who,
	}

	for _, p := range g.Players {
		p.Session.Emit("boot", data)
	}

	for _, s := range g.Spectators {
		s.Emit("boot", data)
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
		s.Emit("note", data)
	}
}

/*
	Other major functions
*/

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
	maxScore := len(g.Stacks) * 5
	if g.Score == maxScore {
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
