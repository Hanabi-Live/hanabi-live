package main

import (
	"time"
)

type User struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

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
	TimerPerTurn int
	ReorderCards bool
}

type Player struct {
}

type Card struct {
}

type DiscardSignal struct {
	Outstanding    bool
	TurnExpiration int
}

// Recieved in all commands
type IncomingWebsocketData struct {
	Room    string `json:"room"`
	Message string `json:"message"`
	Command string // Added by the server after demarshaling
}
