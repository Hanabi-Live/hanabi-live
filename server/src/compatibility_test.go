package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// Corpus v1 is a Go-authority reference, NOT a TS command-validation oracle.
// Each file contains portable setup inputs, literal player commands, their expected
// disposition, authoritative state, and actual recipient WebSocket game messages.
// Setup uses a seeded full deck; optional swaps move existing cards, never invent
// copies. Orders are assigned AFTER swaps. This permits small, purposeful traces.
//
// Regenerate explicitly from server/src:
//
//	go test -run '^TestCompatibilityCorpus$' -update-compatibility
//
// Terminal cases require the existing HANABI_TEST_DATABASE_URL disposable test
// database; without it ordinary tests skip those cases, but regeneration fails.
// Then run prettier on testdata/compatibility and review the diff. Regeneration
// still checks each command's declared disposition and replay/recovery invariants.
// Existing independently captured TestSeededGameLegacyCompatibility fixtures must
// also pass; regeneration is not permission to silently bless a behavioral bug.
//
// Clock fields and the database-reserved ID are omitted; playerTimes values are
// normalized to zero. Immutable identities are stored once in Deck.
// State.Cards contains non-default mutable card fields, indexed by Order; absent
// cards/fields mean zero/false. Player hands are order arrays into that deck.
// The remaining Game state is retained, except catalog metadata (selected by
// variant name) and redundant Actions/CardIdentities.
// Recipients are Alice, Bob, an omniscient observer, and an Alice-shadowing observer.
// Wire coverage is deliberately gameAction, gameActionList, warning, noteList, and
// noteListPlayer; lobby/history/clock/connection messages are outside this contract.
// Transport authentication and real-PG uncertain commits remain covered by
// active_games*_test.go, not simulated as TS authority here.
var updateCompatibility = flag.Bool("update-compatibility", false, "regenerate reviewed Go compatibility fixtures")

type compatibilityCommand struct {
	Label   string `json:"label"`
	Player  int    `json:"player"`
	Type    int    `json:"type"`
	Target  int    `json:"target"`
	Value   int    `json:"value"`
	Request string `json:"request,omitempty"`
	Source  string `json:"source,omitempty"` // Empty is a player action; "timer" calls EndTimer.
	Want    string `json:"want"`             // accepted, rejected, duplicate, restored, reconnect
}

type compatibilitySwap struct {
	Order int `json:"order"`
	Suit  int `json:"suit"`
	Rank  int `json:"rank"`
}

type compatibilityScenario struct {
	Name       string                 `json:"name"`
	Seed       string                 `json:"seed"`
	Options    *Options               `json:"options"`
	Swaps      []compatibilitySwap    `json:"swaps"`
	Deck       []*CardIdentity        `json:"deck"`
	Terminal   bool                   `json:"terminal"`
	Characters []*CharacterAssignment `json:"characters"`
	Commands   []compatibilityCommand `json:"commands"`
}

type compatibilityMessage struct {
	Command string          `json:"command"`
	Data    json.RawMessage `json:"data"`
}

type compatibilityPoint struct {
	State      json.RawMessage          `json:"state"`
	Revision   int64                    `json:"revision"`
	Receipts   map[string]bool          `json:"receipts"`
	Events     []interface{}            `json:"events"`
	Recipients [][]compatibilityMessage `json:"recipients"`
}

type compatibilityFixture struct {
	Version int                   `json:"version"`
	Input   compatibilityScenario `json:"input"`
	Deck    []*CardIdentity       `json:"deck"`
	Initial compatibilityPoint    `json:"initial"`
	Steps   []compatibilityPoint  `json:"steps"`
}

type compatibilityCard struct {
	Order            int
	Slot             int  `json:",omitempty"`
	Touched          bool `json:",omitempty"`
	Discarded        bool `json:",omitempty"`
	Played           bool `json:",omitempty"`
	Failed           bool `json:",omitempty"`
	CannotBePlayed   bool `json:",omitempty"`
	InsistentTouched bool `json:",omitempty"`
}

func compatibilityScenarios() []compatibilityScenario {
	action := func(label string, player, kind, target, value int, want string) compatibilityCommand {
		return compatibilityCommand{Label: label, Player: player, Type: kind, Target: target, Value: value, Want: want}
	}
	play := func(player, order int) compatibilityCommand {
		return action("play", player, ActionTypePlay, order, 0, "accepted")
	}
	clue := func(player, kind, value int) compatibilityCommand {
		return action("clue", player, kind, 1-player, value, "accepted")
	}
	scenario := func(name, variant string, swaps []compatibilitySwap, commands ...compatibilityCommand) compatibilityScenario {
		options := NewOptions()
		options.NumPlayers = 2
		options.VariantName = variant
		return compatibilityScenario{Name: name, Seed: "p2v0s1", Options: options, Swaps: swaps, Commands: commands}
	}
	basic := scenario("legacy-retry-recovery", DefaultVariantName, nil,
		action("out of turn", 1, ActionTypePlay, 5, 0, "rejected"),
		action("discard at full clues", 0, ActionTypeDiscard, 0, 0, "rejected"),
		action("invalid rank", 0, ActionTypeRankClue, 1, 0, "rejected"),
		action("clue with receipt", 0, ActionTypeRankClue, 1, 1, "accepted"),
		action("retry", 0, ActionTypeRankClue, 1, 1, "duplicate"),
		compatibilityCommand{Label: "restore committed checkpoint", Want: "restored"},
		action("retry after restore", 0, ActionTypeRankClue, 1, 1, "duplicate"),
		compatibilityCommand{Label: "reconnect private history", Want: "reconnect"},
		play(1, 6),
		play(0, 0),
	)
	for _, i := range []int{3, 4, 6} {
		basic.Commands[i].Request = "first-clue"
	}
	legacy := scenario("legacy-prefixed-deal", DefaultVariantName, nil, clue(0, ActionTypeRankClue, 1))
	legacy.Seed = "legacy-2-p2v0s1"
	cycling := scenario("empty-clues-card-cycle", DefaultVariantName,
		[]compatibilitySwap{{0, 0, 1}, {5, 1, 2}, {6, 1, 2}, {7, 1, 3}, {8, 1, 3}, {9, 1, 4}, {10, 2, 1}},
		clue(0, ActionTypeRankClue, 5), play(1, 5),
		action("discard cycled oldest card", 0, ActionTypeDiscard, 1, 0, "accepted"))
	cycling.Options.EmptyClues, cycling.Options.CardCycle, cycling.Options.DeckPlays = true, true, true
	deckPlay := scenario("last-card-deck-play", DefaultVariantName, nil, play(0, 10))
	deckPlay.Options.DeckPlays = true
	deckPlay.Seed = "JSON"
	deckPlay.Deck = []*CardIdentity{
		{0, 1}, {0, 2}, {0, 3}, {0, 4}, {0, 5},
		{1, 1}, {1, 2}, {1, 3}, {1, 4}, {1, 5}, {2, 1},
	}
	noEmpty := scenario("empty-clue-rejected", DefaultVariantName, cycling.Swaps,
		action("empty rank clue", 0, ActionTypeRankClue, 1, 5, "rejected"),
		action("disabled deck play", 0, ActionTypePlay, 10, 0, "rejected"))
	rainbow := scenario("rainbow-color-touch", "Rainbow (5 Suits)",
		[]compatibilitySwap{{5, 4, 1}, {6, 0, 1}}, clue(0, ActionTypeColorClue, 0), play(1, 5))
	pink := scenario("pink-rank-touch", "Pink (5 Suits)",
		[]compatibilitySwap{{5, 4, 1}, {6, 0, 5}}, clue(0, ActionTypeRankClue, 5), play(1, 5))
	prism := scenario("prism-rank-color", "Prism (5 Suits)",
		[]compatibilitySwap{{5, 4, 1}, {6, 4, 2}}, clue(0, ActionTypeColorClue, 0), play(1, 5))
	reversed := scenario("reversed-play", "Reversed (5 Suits)",
		[]compatibilitySwap{{0, 4, 5}, {5, 4, 4}}, play(0, 0), play(1, 5))
	upDown := scenario("up-or-down-start", "Up or Down (5 Suits)",
		[]compatibilitySwap{{0, 0, StartCardRank}, {5, 0, 4}, {1, 0, 3}}, play(0, 0), play(1, 5), play(0, 1))
	sudoku := scenario("sudoku-stack-conflict", "Sudoku (5 Suits)",
		[]compatibilitySwap{{0, 0, 3}, {5, 1, 3}, {1, 0, 4}}, play(0, 0), play(1, 5), play(0, 1))
	hole := scenario("hole-hidden-play", "Throw It in a Hole (5 Suits)",
		[]compatibilitySwap{{0, 0, 1}, {5, 1, 3}}, play(0, 0), play(1, 5))
	alternating := scenario("alternating-clue-restriction", "Alternating Clues (5 Suits)",
		[]compatibilitySwap{{0, 0, 1}, {5, 0, 1}},
		clue(0, ActionTypeColorClue, 0),
		action("same clue type twice", 1, ActionTypeColorClue, 0, 0, "rejected"),
		clue(1, ActionTypeRankClue, 1))
	starved := scenario("clue-starved-discard", "Clue Starved (5 Suits)",
		[]compatibilitySwap{{5, 0, 1}}, clue(0, ActionTypeRankClue, 1),
		action("discard restores half clue", 1, ActionTypeDiscard, 5, 0, "accepted"))
	genius := scenario("genius-two-actions-hidden-partner", DefaultVariantName,
		[]compatibilitySwap{{5, 0, 1}},
		clue(0, ActionTypeColorClue, 0),
		action("must complete second clue", 0, ActionTypePlay, 0, 0, "rejected"),
		clue(0, ActionTypeRankClue, 1), play(1, 5))
	genius.Options.DetrimentalCharacters = true
	genius.Characters = []*CharacterAssignment{{Name: "Genius", Metadata: -1}, {Name: "Blind Spot", Metadata: -1}}
	inverted := scenario("orange-live-inversion", "Orange (5 Suits)",
		[]compatibilitySwap{{0, 4, 2}, {5, 4, 1}}, play(0, 0),
		action("discard means play", 1, ActionTypeDiscard, 5, 0, "accepted"))
	strikeout := scenario("terminal-strikeout", DefaultVariantName, nil, play(0, 0), play(1, 5), play(0, 1))
	strikeout.Terminal = true
	timeout := scenario("terminal-timeout", DefaultVariantName, nil,
		action("timeout", 0, ActionTypeEndGame, 0, EndConditionTimeout, "accepted"))
	timeout.Terminal = true
	timeout.Options.Timed, timeout.Options.TimeBase = true, 3600
	timeout.Commands[0].Source = "timer"
	finalRound := deckPlay
	finalRound.Name = "terminal-final-round"
	finalRound.Terminal = true
	finalRound.Commands = []compatibilityCommand{play(0, 10), play(1, 5), play(0, 0)}
	return []compatibilityScenario{
		basic, legacy, cycling, deckPlay, noEmpty, rainbow, pink, prism, reversed, upDown,
		sudoku, hole, alternating, starved, genius, inverted, strikeout, timeout, finalRound,
	}
}

// Observe real checkpoint writes without replacing the production mutation boundary.
type compatibilityStore struct {
	activeGameStore
	last activeGameCheckpoint
}

func (s *compatibilityStore) Save(ctx context.Context, checkpoint activeGameCheckpoint) error {
	if err := s.activeGameStore.Save(ctx, checkpoint); err != nil {
		return err
	}
	s.last = checkpoint
	return nil
}

func loadCompatibilityCatalog(t *testing.T) {
	t.Helper()
	oldPath, oldColors, oldSuits := jsonPath, colors, suits
	oldVariants, oldIDs, oldFullIDs := variants, variantIDMap, variantIDFullMap
	oldNames, oldOdd, oldEven := variantNames, oddClues, evenClues
	t.Cleanup(func() {
		jsonPath, colors, suits = oldPath, oldColors, oldSuits
		variants, variantIDMap, variantIDFullMap = oldVariants, oldIDs, oldFullIDs
		variantNames, oddClues, evenClues = oldNames, oldOdd, oldEven
	})
	jsonPath = filepath.Join("..", "..", "packages", "game", "src", "json")
	colorsInit()
	suitsInit()
	variantsInit()
	loadSeededGameCharacters(t)
}

func compatibilityJSON(t *testing.T, value interface{}) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func compatibilityState(t *testing.T, g *Game) json.RawMessage {
	t.Helper()
	var state map[string]json.RawMessage
	if err := json.Unmarshal(compatibilityJSON(t, g), &state); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"DatabaseID", "DatetimeStarted", "DatetimeFinished", "DatetimeTurnBegin", "Variant", "Actions", "CardIdentities", "Deck"} {
		delete(state, key)
	}
	cards := make([]compatibilityCard, 0)
	for _, card := range g.Deck {
		if card.Slot != 0 || card.Touched || card.Discarded || card.Played || card.Failed || card.CannotBePlayed || card.InsistentTouched {
			cards = append(cards, compatibilityCard{
				Order: card.Order, Slot: card.Slot, Touched: card.Touched, Discarded: card.Discarded,
				Played: card.Played, Failed: card.Failed, CannotBePlayed: card.CannotBePlayed,
				InsistentTouched: card.InsistentTouched,
			})
		}
	}
	state["Cards"] = compatibilityJSON(t, cards)
	var players []map[string]json.RawMessage
	if err := json.Unmarshal(state["Players"], &players); err != nil {
		t.Fatal(err)
	}
	for i, player := range players {
		delete(player, "Time")
		orders := make([]int, 0, len(g.Players[i].Hand))
		for _, card := range g.Players[i].Hand {
			orders = append(orders, card.Order)
		}
		player["Hand"] = compatibilityJSON(t, orders)
	}
	state["Players"] = compatibilityJSON(t, players)
	return compatibilityJSON(t, state)
}

func compatibilityRead(t *testing.T, s *Session, conn *websocket.Conn) []compatibilityMessage {
	t.Helper()
	s.Emit("compatibilityBarrier", nil)
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	messages := make([]compatibilityMessage, 0)
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		command, payload, ok := strings.Cut(string(data), " ")
		if !ok {
			t.Fatalf("malformed websocket frame: %q", data)
		}
		if command == "compatibilityBarrier" {
			return messages
		}
		switch command {
		case "gameAction", "gameActionList", "warning", "noteListPlayer", "noteList":
			var data interface{}
			if err := json.Unmarshal([]byte(payload), &data); err != nil {
				t.Fatal(err)
			}
			compatibilityNormalizeTimes(data)
			messages = append(messages, compatibilityMessage{command, compatibilityJSON(t, data)})
		}
	}
}

func compatibilityNormalizeTimes(value interface{}) {
	switch data := value.(type) {
	case map[string]interface{}:
		if data["type"] == "playerTimes" {
			data["duration"] = float64(0)
			times := data["playerTimes"].([]interface{})
			for i := range times {
				times[i] = float64(0)
			}
		}
		for _, child := range data {
			compatibilityNormalizeTimes(child)
		}
	case []interface{}:
		for _, child := range data {
			compatibilityNormalizeTimes(child)
		}
	}
}

func TestCompatibilityCorpus(t *testing.T) {
	loadCompatibilityCatalog(t)
	for _, input := range compatibilityScenarios() {
		t.Run(input.Name, func(t *testing.T) {
			table, ctx := newTimerTestTable(t)
			databaseID := 101
			var database *database
			if input.Terminal {
				if *updateCompatibility && os.Getenv("HANABI_TEST_DATABASE_URL") == "" {
					t.Fatal("terminal regeneration requires HANABI_TEST_DATABASE_URL (the disposable integration database)")
				}
				catalog := variants
				database = gamePersistenceDatabase(t)
				variants = catalog
				oldModels := models
				models = &Models{}
				t.Cleanup(func() { models = oldModels })
				t.Cleanup(func() { incomingCommands.drain() })
				if _, err := database.Exec(ctx, `
					INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
					VALUES (1, 'Alice', 'alice', 'unused-test-hash', '127.0.0.1'),
						(2, 'Bob', 'bob', 'unused-test-hash', '127.0.0.1')
				`); err != nil {
					t.Fatal(err)
				}
				var err error
				databaseID, err = models.Games.ReserveID()
				if err != nil {
					t.Fatal(err)
				}
			}
			store := &compatibilityStore{activeGameStore: recoveryStore}
			recoveryStore = store
			table.Options = input.Options
			table.Options.VariantID = variants[table.Options.VariantName].ID
			table.ExtraOptions = &ExtraOptions{CustomCharacterAssignments: input.Characters, CustomDeck: input.Deck}
			g := NewGame(table, databaseID)
			g.DatetimeStarted = time.Now()
			g.Seed = input.Seed
			g.InitDeck()
			if input.Deck == nil {
				g.ShuffleDeck()
			}
			if input.Options.VariantName == DefaultVariantName && input.Deck == nil && input.Swaps == nil {
				assertSeededDeck(t, g, seededGameFixtures[0].deck)
			}
			for _, swap := range input.Swaps {
				found := false
				for i := swap.Order; i < len(g.Deck); i++ {
					card := g.Deck[i]
					if card.SuitIndex == swap.Suit && card.Rank == swap.Rank {
						g.Deck[swap.Order], g.Deck[i] = g.Deck[i], g.Deck[swap.Order]
						g.CardIdentities[swap.Order], g.CardIdentities[i] = g.CardIdentities[i], g.CardIdentities[swap.Order]
						found = true
						break
					}
				}
				if !found {
					t.Fatalf("unavailable scripted card: %+v", swap)
				}
			}
			for order, card := range g.Deck {
				card.Order = order
			}
			for i, player := range table.Players {
				g.Players = append(g.Players, &GamePlayer{
					Name: player.Name, Index: i, Game: g, Hand: make([]*Card, 0),
					Notes: make([]string, g.GetNotesSize()), CharacterMetadata: -1,
				})
			}
			charactersGenerate(g)
			for _, player := range g.Players {
				player.InitTime(table.Options)
			}
			g.Players[0].Notes[0] = "Alice private"
			g.Players[1].Notes[0] = "Bob private"
			for _, player := range g.Players {
				for i := 0; i < g.GetHandSize(); i++ {
					player.DrawCard()
				}
			}
			sessions := make([]*Session, 4)
			connections := make([]*websocket.Conn, 4)
			for i := range sessions {
				sessions[i], connections[i] = recoveryTestSocket(t)
				sessions[i].UserID = i + 1
				if i < 2 {
					sessions[i].Username = table.Players[i].Name
					table.Players[i].Session, table.Players[i].Present = sessions[i], true
				} else {
					tables.AddSpectating(i+1, table.ID)
					table.Spectators = append(table.Spectators, &Spectator{
						UserID: i + 1, Name: fmt.Sprintf("Observer %d", i), Session: sessions[i],
						ShadowingPlayerIndex: i - 3, ShadowingPlayerPregameIndex: -1,
					})
				}
			}
			t.Cleanup(func() {
				table.Lock(ctx)
				table.cancelTimers()
				table.Unlock(ctx)
			})
			capture := func(events []interface{}) compatibilityPoint {
				game := table.Game
				if table.Replay {
					// Completion converts the in-memory table into a shared replay
					// (and moves its cursor). Compare the final authoritative checkpoint,
					// not that replay cursor, against the emitted terminal events.
					saved, err := decodeTableSnapshot(store.last.Data)
					if err != nil {
						t.Fatal(err)
					}
					game = saved.Game
				}
				normalizedEvents := make([]interface{}, len(events))
				for i, event := range events {
					if times, ok := event.(ActionPlayerTimes); ok {
						event = ActionPlayerTimes{Type: times.Type, PlayerTimes: make([]int64, len(times.PlayerTimes))}
					}
					normalizedEvents[i] = event
				}
				point := compatibilityPoint{
					State: compatibilityState(t, game), Revision: table.recoveryRevision,
					Events: normalizedEvents, Recipients: make([][]compatibilityMessage, 4),
					Receipts: make(map[string]bool),
				}
				for key, value := range table.ProcessedRequests {
					point.Receipts[key] = value
				}
				for i, s := range sessions {
					point.Recipients[i] = compatibilityRead(t, s, connections[i])
				}
				return point
			}
			reconnect := func() {
				for _, s := range sessions {
					commandGetGameInfo2(ctx, s, &CommandData{TableID: table.ID})
				}
			}
			reconnect()
			fixture := compatibilityFixture{Version: 1, Input: input, Deck: g.CardIdentities, Initial: capture(g.Actions)}
			checkCompatibilityInitialVisibility(t, fixture.Initial, g)
			for index, command := range input.Commands {
				before := len(table.Game.Actions)
				revision := table.recoveryRevision
				table.Game.InvalidActionOccurred = false
				switch command.Want {
				case "restored":
					row := store.last
					restored, err := decodeTableSnapshot(row.Data)
					if err != nil {
						t.Fatal(err)
					}
					if !bytes.Equal(compatibilityState(t, table.Game), compatibilityState(t, restored.Game)) ||
						!reflect.DeepEqual(table.Game.Deck, restored.Game.Deck) {
						t.Fatal("checkpoint changed authoritative gameplay state")
					}
					table.Lock(ctx)
					table.cancelTimers()
					table.Unlock(ctx)
					restored.recoveryRevision = row.Revision
					table = restored
					tables.Set(table.ID, table)
					for i, player := range table.Players {
						player.Session, player.Present = sessions[i], true
					}
					// Spectators are connection-local, not persisted in active snapshots.
					table.Spectators = []*Spectator{
						{UserID: 3, Name: "Observer 2", Session: sessions[2], ShadowingPlayerIndex: -1},
						{UserID: 4, Name: "Observer 3", Session: sessions[3], ShadowingPlayerIndex: 0},
					}
				case "reconnect":
					reconnect()
				default:
					beforeState := compatibilityState(t, table.Game)
					if command.Source == "timer" {
						table.Lock(ctx)
						table.Game.EndTimer(ctx, table.Game.Players[command.Target])
						table.Unlock(ctx)
					} else {
						commandAction(ctx, sessions[command.Player], &CommandData{
							TableID: table.ID, Type: command.Type, Target: command.Target,
							Value: command.Value, RequestID: command.Request,
						})
					}
					got := "duplicate"
					if table.Game.InvalidActionOccurred {
						got = "rejected"
					} else if table.recoveryRevision == revision+1 {
						got = "accepted"
					}
					if got != command.Want || table.recoveryBlocked.Load() {
						t.Fatalf("step %d (%s): disposition %s, want %s; blocked=%v",
							index, command.Label, got, command.Want, table.recoveryBlocked.Load())
					}
					if got != "accepted" && (len(table.Game.Actions) != before || table.recoveryRevision != revision) {
						t.Fatalf("step %d (%s) changed actions/revision without acceptance", index, command.Label)
					}
					if got != "accepted" {
						rejected := table.Game.InvalidActionOccurred
						table.Game.InvalidActionOccurred = false
						unchanged := bytes.Equal(beforeState, compatibilityState(t, table.Game))
						table.Game.InvalidActionOccurred = rejected
						if !unchanged {
							t.Fatalf("step %d (%s) mutated gameplay without acceptance", index, command.Label)
						}
					}
				}
				fixture.Steps = append(fixture.Steps, capture(table.Game.Actions[before:]))
			}
			if input.Terminal {
				var completed, active int
				if err := database.QueryRow(ctx, `
					SELECT (SELECT COUNT(*) FROM games WHERE id = $1),
						(SELECT COUNT(*) FROM active_games WHERE game_id = $1)
				`, databaseID).Scan(&completed, &active); err != nil {
					t.Fatal(err)
				}
				if completed != 1 || active != 0 || !table.Replay {
					t.Fatalf("terminal transition did not commit exactly once and retire live state: %d, %d", completed, active)
				}
			}
			checkCompatibilityFixture(t, fixture)
		})
	}
}

// These independent assertions still run in update mode, so accidentally dropping
// a recipient or revealing their initial hand cannot be blessed by regeneration.
func checkCompatibilityInitialVisibility(t *testing.T, point compatibilityPoint, g *Game) {
	t.Helper()
	for recipient, messages := range point.Recipients {
		draws := 0
		for _, message := range messages {
			if message.Command != "gameActionList" {
				continue
			}
			var data struct {
				List []ActionDraw `json:"list"`
			}
			if err := json.Unmarshal(message.Data, &data); err != nil {
				t.Fatal(err)
			}
			for _, draw := range data.List {
				draws++
				player := recipient
				if recipient == 3 {
					player = 0
				}
				hidden := recipient != 2 && (draw.PlayerIndex == player ||
					g.Players[player].Character == "Blind Spot")
				identity := g.CardIdentities[draw.Order]
				if hidden {
					if draw.Rank != -1 || draw.SuitIndex != -1 {
						t.Fatalf("recipient %d saw hidden initial card %d", recipient, draw.Order)
					}
				} else if draw.Rank != identity.Rank || draw.SuitIndex != identity.SuitIndex {
					t.Fatalf("recipient %d lost visible initial card %d", recipient, draw.Order)
				}
			}
		}
		if draws != g.DeckIndex {
			t.Fatalf("recipient %d received %d initial draws; want %d", recipient, draws, g.DeckIndex)
		}
	}
}

func checkCompatibilityFixture(t *testing.T, fixture compatibilityFixture) {
	t.Helper()
	path := filepath.Join("testdata", "compatibility", fixture.Input.Name+".json")
	actual := compatibilityJSON(t, fixture)
	if *updateCompatibility {
		var formatted bytes.Buffer
		if err := json.Indent(&formatted, actual, "", "  "); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, append(formatted.Bytes(), '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	expected, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v; regenerate with -update-compatibility", err)
	}
	var got, want interface{}
	if err := json.Unmarshal(actual, &got); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(expected, &want); err != nil {
		t.Fatal(err)
	}
	compatibilityCompare(t, "$", got, want)
}

// Report the first differing JSON path instead of dumping a multi-kilobyte game.
func compatibilityCompare(t *testing.T, path string, got, want interface{}) {
	t.Helper()
	if reflect.DeepEqual(got, want) {
		return
	}
	switch actual := got.(type) {
	case map[string]interface{}:
		expected, ok := want.(map[string]interface{})
		if ok && len(actual) == len(expected) {
			for key, value := range actual {
				compatibilityCompare(t, path+"."+key, value, expected[key])
			}
		}
	case []interface{}:
		expected, ok := want.([]interface{})
		if ok && len(actual) == len(expected) {
			for i, value := range actual {
				compatibilityCompare(t, fmt.Sprintf("%s[%d]", path, i), value, expected[i])
			}
		}
	}
	t.Fatalf("%s: got %.300s; want %.300s (regenerate only after reviewing the behavior change)",
		path, compatibilityJSON(t, got), compatibilityJSON(t, want))
}
