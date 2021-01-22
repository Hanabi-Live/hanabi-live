package table

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

// table describes the container that a player can join.
// (e.g. an unstarted game, an ongoing game, a solo replay, a shared replay, etc.)
// We need to export most fields so that the JSON encoder can serialize them during a graceful
// server restart.
type table struct {
	// This is a reference to the parent object; every game must have a parent Manager object
	manager *Manager

	ID          int
	Name        string
	InitialName string // The name of the table before it was converted to a replay

	Players    []*player
	spectators []*spectator
	// We keep track of players who have been kicked from the game
	// so that we can prevent them from rejoining
	kickedPlayers map[int]struct{}

	// This is the user ID of the person who started the table
	// or the current leader of the shared replay
	OwnerID int
	Visible bool // Whether or not this table is shown to other users
	// This is an Argon2id hash generated from the plain-text password
	// that the table creator sends us
	PasswordHash   string
	Running        bool
	Replay         bool
	automaticStart int // See "chatTable.go"
	Progress       int // Displayed as a percentage on the main lobby screen

	DatetimeCreated      time.Time
	DatetimeLastJoined   time.Time
	DatetimePlannedStart time.Time
	// This is updated any time a player interacts with the game / replay
	// (used to determine when a game is idle)
	DatetimeLastAction time.Time

	// All of the game state is contained within the "Game" object
	Game *game

	// The variant and other game settings are contained within the "Options" object
	Options      *options.Options      // Options that are stored in the database
	ExtraOptions *options.ExtraOptions // Options that are not stored in the database
	Variant      *variants.Variant     // A reference to the variant object for convenience purposes

	Chat     []*types.TableChatMessage // All of the in-game chat history
	ChatRead map[int]int               // A map of which users have read which messages
}

type NewTableData struct {
	ID              int
	Name            string
	OwnerID         int
	OwnerUsername   string
	Visible         bool
	PasswordHash    string
	Options         *options.Options
	ExtraOptions    *options.ExtraOptions
	Variant         *variants.Variant
	ShutdownWarning string
}

func newTable(d *NewTableData) *table {
	t := &table{
		ID:          d.ID,
		Name:        d.Name,
		InitialName: "", // Set when this game converts from ongoing --> shared replay

		Players:       make([]*player, 0),
		spectators:    make([]*spectator, 0),
		kickedPlayers: make(map[int]struct{}),

		OwnerID:        d.OwnerID,
		Visible:        d.Visible,
		PasswordHash:   d.PasswordHash,
		Running:        false,
		Replay:         false,
		automaticStart: 0,
		Progress:       0,

		DatetimeCreated:      time.Now(),
		DatetimeLastJoined:   time.Now(),
		DatetimePlannedStart: time.Time{},
		DatetimeLastAction:   time.Now(),

		Game: nil,

		Options:      d.Options,
		ExtraOptions: d.ExtraOptions,
		Variant:      d.Variant,

		Chat:     make([]*types.TableChatMessage, 0),
		ChatRead: make(map[int]int),
	}

	// Log a chat message so that future players can see a timestamp of when the table was created
	msg := fmt.Sprintf("%v created the table.", d.OwnerUsername)
	chatMsg := newChatMessage(0, "", msg, true)
	t.Chat = append(t.Chat, chatMsg)

	// Log a chat message if the server is shutting down / restarting soon
	if d.ShutdownWarning != "" {
		chatMsg := newChatMessage(0, "", d.ShutdownWarning, true)
		t.Chat = append(t.Chat, chatMsg)
	}

	return t
}

func newChatMessage(userID int, username string, msg string, server bool) *types.TableChatMessage {
	return &types.TableChatMessage{
		UserID:   userID,
		Username: username,
		Msg:      msg,
		Datetime: time.Now(),
		Server:   server,
	}
}
