package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func customDeckFixture(t *testing.T) ([]byte, *Variant) {
	t.Helper()
	var fixture struct {
		VariantName string `json:"variantName"`
		Seed        string `json:"seed"`
		Hex         string `json:"hex"`
	}
	data, err := os.ReadFile(filepath.Join("testdata", "custom_deck.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	encoded, err := hex.DecodeString(fixture.Hex)
	if err != nil {
		t.Fatal(err)
	}
	g := newSeededTestGame(fixture.Seed, 2)
	g.ShuffleDeck()
	normal, err := customDeckForSeed(g.CardIdentities, g.Variant, g.Seed)
	if err != nil || normal != nil {
		t.Fatalf("ordinary seed gained a sparse payload: %x, %v", normal, err)
	}
	return encoded, g.Variant
}

func TestCustomDeckCodec(t *testing.T) {
	data, variant := customDeckFixture(t)
	deck, err := decodeCustomDeck(data, variant)
	if err != nil {
		t.Fatal(err)
	}
	if len(deck) != 50 || *deck[1] != (CardIdentity{SuitIndex: 1, Rank: 2}) ||
		*deck[5] != (CardIdentity{SuitIndex: 0, Rank: 7}) {
		t.Fatal("shared compact fixture decoded incorrectly")
	}
	encoded, err := customDeckForSeed(deck, variant, "p2v0s1")
	if err != nil || !bytes.Equal(encoded, data) {
		t.Fatalf("custom deck changed encoding: %x, %v", encoded, err)
	}
	for _, malformed := range [][]byte{
		nil, bytes.Repeat([]byte{1}, 49), bytes.Repeat([]byte{1}, 61),
		data[:len(data)-1], data[:12],
	} {
		if _, err := decodeCustomDeck(malformed, variant); err == nil {
			t.Fatalf("accepted malformed sparse deck %x", malformed)
		}
	}
	for _, invalid := range []byte{0, 6, 41, 255} {
		malformed := bytes.Clone(data)
		malformed[1] = invalid
		if _, err := decodeCustomDeck(malformed, variant); err == nil {
			t.Fatalf("accepted malformed card %d in a correctly framed deck", invalid)
		}
	}
	short := deck[:11]
	encoded, err = customDeckForSeed(short, variant, "p2v0s1")
	if err != nil || len(encoded) != 12 || encoded[0] != 0x80+11 {
		t.Fatalf("trusted short deck lost its declared count: %x, %v", encoded, err)
	}
	decoded, err := decodeCustomDeck(encoded, variant)
	if err != nil || !reflect.DeepEqual(decoded, short) {
		t.Fatalf("trusted short deck changed identities: %v", err)
	}
}

func exportedCustomGame(t *testing.T, gameID int) (*GameJSON, int) {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/export/"+strconv.Itoa(gameID), nil)
	ctx.Params = gin.Params{{Key: "databaseID", Value: strconv.Itoa(gameID)}}
	httpExport(ctx)
	if recorder.Code != http.StatusOK {
		return nil, recorder.Code
	}
	var exported GameJSON
	if err := json.Unmarshal(recorder.Body.Bytes(), &exported); err != nil {
		t.Fatal(err)
	}
	return &exported, recorder.Code
}

func TestCustomDeckCompletionRoundTripAndConflicts(t *testing.T) {
	database, table := gameCompletionTestTable(t)
	g := table.Game
	data, _ := customDeckFixture(t)
	deck, err := decodeCustomDeck(data, g.Variant)
	if err != nil {
		t.Fatal(err)
	}
	g.CardIdentities = deck
	variants[DefaultVariantName] = g.Variant
	oldIDs := variantIDMap
	variantIDMap = map[int]string{0: DefaultVariantName}
	t.Cleanup(func() { variantIDMap = oldIDs })
	snapshot := snapshotGameDatabaseTable(table)
	for i := 0; i < 2; i++ {
		if _, err := g.WriteDatabase(snapshot); err != nil {
			t.Fatal(err)
		}
	}
	var stored []byte
	if err := database.QueryRow(context.Background(),
		"SELECT deck FROM game_custom_decks WHERE game_id = $1", g.DatabaseID).Scan(&stored); err != nil || !bytes.Equal(stored, data) {
		t.Fatalf("completion did not preserve the played order: %x, %v", stored, err)
	}
	exported, status := exportedCustomGame(t, g.DatabaseID)
	if status != http.StatusOK || exported.Seed != "" || !reflect.DeepEqual(exported.Deck, deck) {
		t.Fatalf("custom export lost its deck: %d, %+v", status, exported)
	}
	if valid, message := isJSONValid(&CommandData{GameJSON: exported}); !valid {
		t.Fatalf("custom export cannot be imported: %s", message)
	}
	prefetched, ok := preFetchReplayTableData(NewFakeSession(1, "Alice"), g.DatabaseID)
	if !ok || !reflect.DeepEqual(prefetched.CustomDeck, deck) {
		t.Fatal("historical replay did not load its sparse deck")
	}
	started, ctx := newTimerTestTable(t)
	started.Running, started.Game = false, nil
	if _, ok := loadDatabaseOptionsToTable(NewFakeSession(1, "Alice"),
		&CommandData{DatabaseID: g.DatabaseID, PreFetchedReplay: prefetched}, started); !ok {
		t.Fatal("failed to prepare historical options")
	}
	for _, player := range started.Players {
		player.Present = true
		player.Session = NewFakeSession(player.UserID, player.Name)
	}
	commandTableStart(ctx, started.Players[0].Session, &CommandData{TableID: started.ID})
	if started.Game == nil || !reflect.DeepEqual(started.Game.CardIdentities, deck) {
		t.Fatal("historical start shuffled the stored deck a second time")
	}
	if _, err := database.Exec(context.Background(),
		"INSERT INTO active_games (game_id, revision, checkpoint) VALUES ($1, 1, 'retained retry')", g.DatabaseID); err != nil {
		t.Fatal(err)
	}
	g.CardIdentities[0] = &CardIdentity{SuitIndex: 1, Rank: 1}
	if _, err := g.WriteDatabase(snapshot); err == nil || !strings.Contains(err.Error(), "conflicts") {
		t.Fatalf("conflicting completion was accepted: %v", err)
	}
	g.CardIdentities[0] = &CardIdentity{SuitIndex: 0, Rank: 1}
	malformed := bytes.Clone(data)
	malformed[1] = 0
	if _, err := database.Exec(context.Background(),
		"UPDATE game_custom_decks SET deck = $1 WHERE game_id = $2", malformed, g.DatabaseID); err != nil {
		t.Fatal(err)
	}
	if _, err := models.GameCustomDecks.Get(g.DatabaseID, g.Variant); err == nil {
		t.Fatal("malformed stored deck silently fell back to the seed")
	}
	if _, status := exportedCustomGame(t, g.DatabaseID); status != http.StatusInternalServerError {
		t.Fatal("malformed stored deck produced a successful export")
	}
	if _, err := g.WriteDatabase(snapshot); err == nil {
		t.Fatal("malformed stored deck was accepted by completion retry")
	}
	var active int
	if err := database.QueryRow(context.Background(),
		"SELECT COUNT(*) FROM active_games WHERE game_id = $1", g.DatabaseID).Scan(&active); err != nil || active != 1 {
		t.Fatal("failed completion retry deleted its recovery authority")
	}
	if _, err := database.Exec(context.Background(), "DELETE FROM games WHERE id = $1", g.DatabaseID); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := database.QueryRow(context.Background(), "SELECT COUNT(*) FROM game_custom_decks").Scan(&count); err != nil || count != 0 {
		t.Fatal("custom deck did not cascade with its game")
	}
}

func TestCustomDeckCompletionRejectsMissingIdentities(t *testing.T) {
	database, table := gameCompletionTestTable(t)
	table.Game.CardIdentities = table.Game.CardIdentities[:len(table.Game.CardIdentities)-1]
	if _, err := table.Game.WriteDatabase(snapshotGameDatabaseTable(table)); err == nil ||
		!strings.Contains(err.Error(), "identities") {
		t.Fatalf("incomplete played-deck identities were accepted: %v", err)
	}
	var count int
	if err := database.QueryRow(context.Background(), "SELECT COUNT(*) FROM games").Scan(&count); err != nil || count != 0 {
		t.Fatal("incomplete played-deck identities published a completed game")
	}
}

func TestNormalCompletionDoesNotStoreCustomDeck(t *testing.T) {
	database, table := gameCompletionTestTable(t)
	g := table.Game
	seeded := newSeededTestGame(g.Seed, 2)
	seeded.ShuffleDeck()
	g.CardIdentities = seeded.CardIdentities
	variants[DefaultVariantName] = g.Variant
	oldIDs := variantIDMap
	variantIDMap = map[int]string{0: DefaultVariantName}
	t.Cleanup(func() { variantIDMap = oldIDs })
	if _, err := g.WriteDatabase(snapshotGameDatabaseTable(table)); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := database.QueryRow(context.Background(), "SELECT COUNT(*) FROM game_custom_decks").Scan(&count); err != nil || count != 0 {
		t.Fatal("normal completed game gained a custom payload")
	}
	exported, status := exportedCustomGame(t, g.DatabaseID)
	if status != http.StatusOK || exported.Seed != g.Seed || !reflect.DeepEqual(exported.Deck, seeded.CardIdentities) {
		t.Fatal("normal seeded export changed")
	}
}
