package types

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
)

type GameData struct {
	TableID           int               `json:"tableID"`
	Name              string            `json:"name"`
	Owner             int               `json:"owner"`
	Players           []*GamePlayerData `json:"players"`
	Options           *options.Options  `json:"options"`
	PasswordProtected bool              `json:"passwordProtected"`
}

type GamePlayerData struct {
	Index   int           `json:"index"`
	Name    string        `json:"name"`
	You     bool          `json:"you"`
	Present bool          `json:"present"`
	Stats   *PregameStats `json:"stats"`
}

type GameJSON struct {
	ID      int                     `json:"id,omitempty"` // Optional element only used for game exports
	Players []string                `json:"players"`
	Deck    []*options.CardIdentity `json:"deck"`
	Actions []*options.GameAction   `json:"actions"`
	// Options is an optional element
	// Thus, it must be a pointer so that we can tell if the value was specified or not
	Options *options.JSON `json:"options,omitempty"`
	// Notes is an optional element that contains the notes for each player
	Notes [][]string `json:"notes,omitempty"`
	// Characters is an optional element that specifies the "Detrimental Character" assignment for
	// each player, if any
	Characters []*options.CharacterAssignment `json:"characters,omitempty"`
	// Seed is an optional value that specifies the server-side seed for the game (e.g. "p2v0s1")
	// This allows the server to reconstruct the game without the deck being present and to properly
	// write the game back to the database
	Seed string `json:"seed,omitempty"`
}

type Note struct {
	Name string `json:"name"`
	Text string `json:"text"`
}

type PregameStats struct {
	NumGames int                  `json:"numGames"`
	Variant  *models.UserStatsRow `json:"variant"`
}

type SessionData struct {
	UserID   int
	Username string
	Friends  map[int]struct{}
	Muted    bool
}

type SpectatorDescription struct {
	Username             string `json:"username"`
	ShadowingPlayerIndex int    `json:"shadowingPlayerIndex"`
}

type TableChatMessage struct {
	UserID   int
	Username string
	Msg      string
	Datetime time.Time
	Server   bool
}

type TableDescription struct {
	ID   int    `json:"id"`
	Name string `json:"name"`

	Players    []string `json:"players"`
	Spectators []string `json:"spectators"`

	Visible           bool `json:"visible"`
	PasswordProtected bool `json:"passwordProtected"`
	Running           bool `json:"running"`
	Replay            bool `json:"replay"`
	Progress          int  `json:"progress"`

	NumPlayers  int    `json:"numPlayers"`
	VariantName string `json:"variantName"`
	Timed       bool   `json:"timed"`
	TimeBase    int    `json:"timeBase"`
	TimePerTurn int    `json:"timePerTurn"`
}
