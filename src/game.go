package main

import (
	"strconv"
	"time"
)

type Game struct {
	ID              int
	Name            string
	Owner           int
	Options         Options
	Players         []Player
	Spectators      map[string]Player
	Running         bool
	SharedReplay    bool
	DatetimeCreated int64
	DatetimeStarted int64
	EndCondition    int

	Seed          string
	Deck          []Card
	DeckIndex     int
	Stacks        []int
	Turn          int
	PlayerIndex   int
	Clues         int
	Score         int
	Progress      int
	Strikes       int
	Actions       []string
	DiscardSignal DiscardSignal
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

type Player struct {
	ID      int
	Name    string
	Session *Session
}

type Card struct {
	Order int
	Suit  int
	Rank  int
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
	}
}

func (g *Game) End() {

}
