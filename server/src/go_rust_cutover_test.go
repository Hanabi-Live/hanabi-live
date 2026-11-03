package main

// Temporary Go-to-Rust migration corpus and lifecycle tests; delete after permanent cutover.
import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestGoRustCutoverCorpus(t *testing.T) {
	loadCompatibilityCatalog(t)
	oldActions, oldDev := actionFunctions, isDev
	actionsFunctionsInit()
	isDev = true
	t.Cleanup(func() { actionFunctions, isDev = oldActions, oldDev })
	saved := time.Date(2026, 1, 1, 12, 0, 30, 0, time.UTC)
	corpus := make(map[string]json.RawMessage)
	for index, variant := range []string{"No Variant", "Clue Starved (6 Suits)", "Up or Down (5 Suits)"} {
		options := NewOptions()
		options.NumPlayers = 2 + index
		options.VariantName = variant
		options.DetrimentalCharacters = index == 1
		table := NewTable("Go cutover "+variant, 1)
		table.ID = uint64(40 + index)
		table.MaxPlayers = 6
		table.Options = options
		table.ExtraOptions.NoWriteToDatabase = true
		game := NewGame(table, 101+index)
		game.Seed = "p2v0s17"
		game.InitDeck()
		game.ShuffleDeck()
		for order, card := range game.Deck {
			card.Order = order
		}
		for seat, name := range []string{"Alice", "Bob", "Cathy", "Donald"}[:options.NumPlayers] {
			table.Players = append(table.Players, &Player{
				UserID: seat + 1, Name: name, Stats: &PregameStats{Variant: &UserStatsRow{}},
			})
			game.Players = append(game.Players, &GamePlayer{
				Name: name, Index: seat, Game: game, Hand: make([]*Card, 0),
				Notes: make([]string, game.GetNotesSize()), CharacterMetadata: -1,
			})
		}
		charactersGenerate(game)
		for _, player := range game.Players {
			for count := 0; count < game.GetHandSize(); count++ {
				player.DrawCard()
			}
		}
		for turn := 0; turn < 4; turn++ {
			for _, action := range engineAuthorityCandidates(game, turn) {
				player := game.Players[game.ActivePlayerIndex]
				data := &CommandData{Type: action.Type, Target: action.Target, Value: action.Value}
				session := NewFakeSession(player.Index+1, player.Name)
				handler := actionFunctions[data.Type]
				if !characterValidateAction(session, data, game, player) &&
					!characterValidateSecondAction(session, data, game, player) &&
					handler.validate(session, data, game, player) {
					applyAction(NewMiscContext("cutover"), session, data, table, player, handler)
					break
				}
			}
		}
		if index == 2 {
			player := game.Players[game.ActivePlayerIndex]
			data := &CommandData{Type: ActionTypeEndGame, Target: player.Index, Value: EndConditionTerminatedByPlayer}
			applyAction(NewMiscContext("cutover"), NewFakeSession(player.Index+1, player.Name),
				data, table, player, actionFunctions[ActionTypeEndGame])
			game.DatetimeFinished = saved
		}
		table.Running = true
		table.ExtraOptions.NoWriteToDatabase = false
		table.OwnerUsername = "Alice"
		table.DatetimeCreated = saved.Add(-time.Minute)
		table.DatetimeLastJoined = table.DatetimeCreated
		table.DatetimeLastAction = saved.Add(-2 * time.Second)
		table.ProcessedRequests = map[string]bool{"1:go-action": true, "99:spectator-note": true}
		table.Chat = []*TableChatMessage{{UserID: 1, Username: "Alice", Msg: "preserved Go chat", Datetime: saved.Add(-time.Second)}}
		game.DatetimeStarted = saved.Add(-20 * time.Second)
		game.DatetimeTurnBegin = saved.Add(-1250 * time.Millisecond)
		game.StartedTimer = true
		game.Options.Timed = true
		game.Options.TimeBase = 600
		game.Options.TimePerTurn = 20
		game.Players[0].Notes[0] = "preserved private note"
		game.Players[1].RequestedPause = true
		table.Players[0].VoteToKill = true
		game.Tags["cutover"] = 1
		for _, player := range game.Players {
			player.Time = 590 * time.Second
		}
		if index == 1 {
			game.Paused = true
			game.PausePlayerIndex = game.ActivePlayerIndex
		}
		for _, player := range table.Players {
			player.LastTyped = time.Time{}
		}
		payload, err := encodeTableSnapshotAt(table, saved)
		if err != nil {
			t.Fatal(err)
		}
		corpus[variant] = payload
	}
	data, err := json.MarshalIndent(corpus, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	filename := filepath.Join("testdata", "go_rust_cutover.json")
	if *updateCompatibility {
		if err := os.WriteFile(filename, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	expected, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var want, got interface{}
	if err := json.Unmarshal(expected, &want); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(want, got) {
		t.Fatal("Go cutover snapshots changed; inspect before updating compatibility fixtures")
	}
}

func TestGoRustCutoverFailureKeepsGoPausedAndPreservesSharedMarkerLink(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	table.Lock(ctx)
	err := table.checkpoint(ctx, time.Now())
	table.Unlock(ctx)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	bundle, shared := filepath.Join(root, "bundle"), filepath.Join(root, "shared")
	if err := os.Mkdir(bundle, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(shared, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join("..", "shared", goRustCutoverMarker), filepath.Join(bundle, goRustCutoverMarker)); err != nil {
		t.Fatal(err)
	}
	oldPath, oldExit, oldCheckpoints := projectPath, goRustCutoverExit, goRustCutoverCheckpoints
	projectPath, goRustCutoverCheckpoints = bundle, make(map[uint64]bool)
	exited := false
	goRustCutoverExit = func() { exited = true }
	t.Cleanup(func() { projectPath, goRustCutoverExit, goRustCutoverCheckpoints = oldPath, oldExit, oldCheckpoints })
	request := func() *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(response)
		c.Request = httptest.NewRequest(http.MethodPost, "/rustCutover", nil)
		httpLocalhostGoRustCutover(c)
		return response
	}
	store := recoveryStore.(*memoryActiveGames)
	store.err = errors.New("injected checkpoint failure")
	if request().Code != http.StatusServiceUnavailable || exited {
		t.Fatal("failed cutover stopped Go or claimed success")
	}
	if _, err := os.Stat(filepath.Join(shared, goRustCutoverMarker)); !os.IsNotExist(err) {
		t.Fatal("failed cutover installed a restart marker")
	}
	store.err = nil
	if request().Code != http.StatusOK || !exited {
		t.Fatal("repaired cutover could not finish")
	}
	info, err := os.Lstat(filepath.Join(bundle, goRustCutoverMarker))
	if err != nil || info.Mode()&os.ModeSymlink == 0 || checkGoRustCutover(bundle) == nil {
		t.Fatal("cutover replaced its shared-state link or failed to block restart")
	}
}
