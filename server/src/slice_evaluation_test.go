package main

// Opt in from server/src, using only HANABI_TEST_DATABASE_URL:
// go test -run '^TestStandardSliceEvaluation$' -count=1 -v -evaluate-standard-slice
//
// The GO_SLICE_EVALUATION line is JSON. No production listener or database is used.
// The transport is a loopback Melody server with pre-provisioned bearer test sessions.
// Commands invoke the production create/join/start/action/replay/loaded handlers.
// An explicit deck is injected before start, like the compatibility corpus. Its
// archive belongs to this disposable database, NOT the historical Go seed contract.
// Completed reads fetch production rows plus this deck archive, then use the normal
// JSON replay import and game-info handlers. They do not measure historical seed
// replay or live-player reconnect: Go reconnects to a completed game as a replay.
// The richer Go lifecycle (notes, clocks, chat, stats, replay tables and their
// teardown) remains enabled. Both harnesses include clients in the server process.
// This is an application-path comparison, not a language or capacity benchmark.

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
	"github.com/sasha-s/go-deadlock"
)

var evaluateStandardSlice = flag.Bool("evaluate-standard-slice", false, "measure the isolated standard two-player WebSocket/PG slice")

type sliceEvaluationRequest struct {
	Command string      `json:"command"`
	Data    CommandData `json:"data"`
}

type sliceEvaluationReply struct {
	RequestID  string `json:"requestID"`
	TableID    uint64 `json:"tableID"`
	DatabaseID int    `json:"databaseID"`
	Score      int    `json:"score"`
	Error      string `json:"error,omitempty"`
}

type sliceEvaluationIdentity struct {
	id   int
	name string
}

type sliceEvaluationClient struct {
	connection *websocket.Conn
	sequence   int
}

type sliceEvaluationCompleted struct {
	id         int
	aliceToken string
	bobToken   string
}

type sliceEvaluationSamples struct {
	mutex     sync.Mutex
	actions   []float64
	replays   []float64
	reconnect []float64
	completed []sliceEvaluationCompleted
}

type sliceEvaluationStore struct {
	activeGameStore
	writes atomic.Int64
}

func (s *sliceEvaluationStore) Save(ctx context.Context, checkpoint activeGameCheckpoint) error {
	if err := s.activeGameStore.Save(ctx, checkpoint); err != nil {
		return err
	}
	s.writes.Add(1)
	return nil
}

// This is the same construction as experimental/scenarios.ts; both reports include
// a SHA-256 digest of the complete ordered deck to make accidental drift visible.
func sliceEvaluationDeck() []*CardIdentity {
	sequence := make([]*CardIdentity, 25)
	for i := range sequence {
		sequence[i] = &CardIdentity{SuitIndex: i / 5, Rank: i%5 + 1}
	}
	deck := make([]*CardIdentity, 0, 50)
	for player := 0; player < 2; player++ {
		for i := player; i < 10; i += 2 {
			deck = append(deck, sequence[i])
		}
	}
	deck = append(deck, sequence[10:]...)
	variant := variants[DefaultVariantName]
	for suitIndex, suit := range variant.Suits {
		for _, rank := range variant.Ranks {
			for copy := 1; copy < numCopiesOfCard(suit, rank, variant); copy++ {
				deck = append(deck, &CardIdentity{SuitIndex: suitIndex, Rank: rank})
			}
		}
	}
	return deck
}

func sliceEvaluationActionOrder(turn int, deck []*CardIdentity) int {
	for order, card := range deck {
		if card.SuitIndex == turn/5 && card.Rank == turn%5+1 {
			return order
		}
	}
	panic("missing scripted card")
}

func sliceEvaluationConnect(url, token string) (*sliceEvaluationClient, error) {
	dialer := websocket.Dialer{HandshakeTimeout: 5 * time.Second}
	connection, _, err := dialer.Dial(url, http.Header{"Authorization": {"Bearer " + token}})
	if err != nil {
		return nil, err
	}
	return &sliceEvaluationClient{connection: connection}, nil
}

func (c *sliceEvaluationClient) close() error {
	defer c.connection.Close()
	if err := c.connection.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		return err
	}
	if err := c.connection.WriteControl(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(5*time.Second)); err != nil {
		return err
	}
	for {
		if _, _, err := c.connection.ReadMessage(); err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				return nil
			}
			return err
		}
	}
}

func (c *sliceEvaluationClient) request(command string, data CommandData) (sliceEvaluationReply, error) {
	c.sequence++
	data.RequestID = fmt.Sprintf("evaluation-%d", c.sequence)
	if err := c.connection.SetWriteDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return sliceEvaluationReply{}, err
	}
	if err := c.connection.WriteJSON(sliceEvaluationRequest{command, data}); err != nil {
		return sliceEvaluationReply{}, err
	}
	if err := c.connection.SetReadDeadline(time.Now().Add(10 * time.Second)); err != nil {
		return sliceEvaluationReply{}, err
	}
	playEvents := 0
	for {
		_, message, err := c.connection.ReadMessage()
		if err != nil {
			return sliceEvaluationReply{}, err
		}
		name, payload, ok := strings.Cut(string(message), " ")
		if !ok {
			return sliceEvaluationReply{}, errors.New("invalid evaluation wire message")
		}
		switch name {
		case "warning", "error":
			return sliceEvaluationReply{}, fmt.Errorf("Go rejected %s: %s", command, payload)
		case "gameActionList":
			var list struct {
				List []struct {
					Type string `json:"type"`
				} `json:"list"`
			}
			if err := json.Unmarshal([]byte(payload), &list); err != nil {
				return sliceEvaluationReply{}, err
			}
			for _, event := range list.List {
				if event.Type == "play" {
					playEvents++
				}
			}
		case "evaluationAck":
			var reply sliceEvaluationReply
			if err := json.Unmarshal([]byte(payload), &reply); err != nil {
				return reply, err
			}
			if reply.RequestID != data.RequestID {
				return reply, errors.New("evaluation response ID mismatch")
			}
			if reply.Error != "" {
				return reply, errors.New(reply.Error)
			}
			if (command == "replay" || command == "reconnect") && (reply.Score != 25 || playEvents != 25) {
				return reply, fmt.Errorf("persisted reconstruction diverged: score=%d plays=%d", reply.Score, playEvents)
			}
			return reply, nil
		}
	}
}

func sliceEvaluationHandle(ctx context.Context, s *Session, request sliceEvaluationRequest) (sliceEvaluationReply, error) {
	d := &request.Data
	reply := sliceEvaluationReply{RequestID: d.RequestID}
	switch request.Command {
	case "create":
		options := NewOptions()
		options.NumPlayers = 2
		commandTableCreate(ctx, s, &CommandData{
			Name: "Isolated slice evaluation", Options: options, MaxPlayers: 2, HidePregame: true,
		})
		table, exists := getTableAndLock(ctx, nil, s.TableID(), true, true)
		if !exists {
			return reply, errors.New("table creation failed")
		}
		// Test-only deterministic setup. Normal custom JSON creation intentionally does
		// not define an explicit-deck historical storage format for completed Go games.
		table.ExtraOptions.JSONReplay = true
		table.ExtraOptions.CustomDeck = sliceEvaluationDeck()
		table.ExtraOptions.CustomNumPlayers = 2
		reply.TableID = table.ID
		table.Unlock(ctx)
	case "join":
		commandTableJoin(ctx, s, d)
		table, exists := getTableAndLock(ctx, nil, d.TableID, true, true)
		if !exists {
			return reply, errors.New("joined table missing")
		}
		if len(table.Players) != 2 || table.Players[1].UserID != s.UserID {
			table.Unlock(ctx)
			return reply, errors.New("join failed")
		}
		players := []*Session{table.Players[0].Session, table.Players[1].Session}
		table.Unlock(ctx)
		commandTableStart(ctx, players[0], &CommandData{TableID: d.TableID})
		for _, player := range players {
			commandGetGameInfo1(ctx, player, &CommandData{TableID: d.TableID})
			commandGetGameInfo2(ctx, player, &CommandData{TableID: d.TableID})
			commandLoaded(ctx, player, &CommandData{TableID: d.TableID})
		}
		table.Lock(ctx)
		if table.Game == nil || table.recoveryBlocked.Load() {
			table.Unlock(ctx)
			return reply, errors.New("durable start failed")
		}
		reply.DatabaseID, reply.TableID = table.Game.DatabaseID, table.ID
		deck, err := json.Marshal(table.Game.CardIdentities)
		table.Unlock(ctx)
		if err != nil {
			return reply, err
		}
		_, err = db.Exec(ctx, "INSERT INTO slice_evaluation_decks (game_id, format, deck) VALUES ($1, $2, $3)",
			reply.DatabaseID, "standard-2-explicit-v1", string(deck))
		if err != nil {
			return reply, err
		}
	case "act":
		table, exists := getTableAndLock(ctx, nil, d.TableID, true, true)
		if !exists {
			return reply, errors.New("action table missing")
		}
		revision := table.recoveryRevision
		table.Unlock(ctx)
		commandAction(ctx, s, d)
		table.Lock(ctx)
		defer table.Unlock(ctx)
		if table.recoveryBlocked.Load() || table.recoveryRevision != revision+1 || table.Game.InvalidActionOccurred {
			return reply, errors.New("action was not durably accepted")
		}
		reply.TableID, reply.DatabaseID, reply.Score = table.ID, table.Game.DatabaseID, table.Game.Score
	case "leave":
		commandTableUnattend(ctx, s, d)
	case "replay", "reconnect":
		return sliceEvaluationRead(ctx, s, d)
	default:
		return reply, errors.New("unsupported evaluation command")
	}
	return reply, nil
}

func sliceEvaluationRead(ctx context.Context, s *Session, d *CommandData) (sliceEvaluationReply, error) {
	reply := sliceEvaluationReply{RequestID: d.RequestID, DatabaseID: d.DatabaseID}
	if !preFetchReplayData(s, d) {
		return reply, errors.New("completed game prefetch failed")
	}
	prefetched := d.PreFetchedReplay
	names := make([]string, len(prefetched.Players))
	participant := false
	for i, player := range prefetched.Players {
		names[i] = player.Name
		if player.ID == s.UserID {
			participant = true
		}
	}
	if !participant {
		return reply, errors.New("evaluation reads require a participant")
	}
	var data []byte
	var format string
	if err := db.QueryRow(ctx, "SELECT format, deck FROM slice_evaluation_decks WHERE game_id = $1", d.DatabaseID).Scan(&format, &data); err != nil {
		return reply, err
	}
	if format != "standard-2-explicit-v1" {
		return reply, errors.New("unsupported evaluation deck format")
	}
	var deck []*CardIdentity
	if err := json.Unmarshal(data, &deck); err != nil {
		return reply, err
	}
	commandReplayCreate(ctx, s, &CommandData{
		Source: "json", Visibility: "solo", GameJSON: &GameJSON{
			Players: names, Deck: deck, Actions: prefetched.Actions, Notes: prefetched.Notes,
			Options: &OptionsJSON{Variant: &prefetched.Options.VariantName},
		},
	})
	ids := tables.GetTablesUserSpectating(s.UserID)
	if len(ids) != 1 {
		return reply, errors.New("replay construction failed")
	}
	tableID := ids[0]
	defer commandTableUnattend(ctx, s, &CommandData{TableID: tableID})
	commandGetGameInfo1(ctx, s, &CommandData{TableID: tableID})
	commandGetGameInfo2(ctx, s, &CommandData{TableID: tableID})
	table, exists := getTableAndLock(ctx, nil, tableID, true, true)
	if !exists {
		return reply, errors.New("reconstructed table missing")
	}
	reply.Score = table.Game.Score
	table.Unlock(ctx)
	return reply, nil
}

func sliceEvaluationHost(t *testing.T, identities map[string]sliceEvaluationIdentity) string {
	t.Helper()
	m := melody.New()
	m.Config.MaxMessageSize = 8192
	m.Config.MessageBufferSize = 2048
	var connected sync.WaitGroup
	m.HandleConnect(func(ms *melody.Session) {
		identity := identities[strings.TrimPrefix(ms.Request.Header.Get("Authorization"), "Bearer ")]
		s := NewFakeSession(identity.id, identity.name)
		s.ms = ms
		ms.Set("evaluationSession", s)
		// Like recoveryTestSocket, sessions are table-bound, not global lobby
		// members. The TS isolated host has no global lobby broadcasts either.
		connected.Add(1)
	})
	m.HandleDisconnect(func(ms *melody.Session) {
		connected.Done()
	})
	m.HandleMessage(func(ms *melody.Session, message []byte) {
		if !incomingCommands.enter() {
			return
		}
		defer incomingCommands.leave()
		value, _ := ms.Get("evaluationSession")
		s := value.(*Session)
		var request sliceEvaluationRequest
		if err := json.Unmarshal(message, &request); err != nil {
			s.Emit("evaluationAck", sliceEvaluationReply{Error: err.Error()})
			return
		}
		reply, err := sliceEvaluationHandle(NewSessionContext(s), s, request)
		if err != nil {
			reply.Error = err.Error()
		}
		s.Emit("evaluationAck", reply)
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if _, exists := identities[token]; !exists {
			http.Error(w, "test session required", http.StatusUnauthorized)
			return
		}
		if err := m.HandleRequest(w, r); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(func() {
		_ = m.Close()
		server.Close()
		connected.Wait()
	})
	return "ws" + strings.TrimPrefix(server.URL, "http")
}

func sliceEvaluationPlay(url, aliceToken, bobToken string, samples *sliceEvaluationSamples) error {
	alice, err := sliceEvaluationConnect(url, aliceToken)
	if err != nil {
		return err
	}
	defer alice.connection.Close()
	bob, err := sliceEvaluationConnect(url, bobToken)
	if err != nil {
		return err
	}
	defer bob.connection.Close()
	created, err := alice.request("create", CommandData{})
	if err != nil {
		return err
	}
	joined, err := bob.request("join", CommandData{TableID: created.TableID})
	if err != nil {
		return err
	}
	clients := []*sliceEvaluationClient{alice, bob}
	deck := sliceEvaluationDeck()
	for turn := 0; turn < 25; turn++ {
		start := time.Now()
		reply, err := clients[turn%2].request("act", CommandData{
			TableID: created.TableID, Type: ActionTypePlay, Target: sliceEvaluationActionOrder(turn, deck),
		})
		elapsed := float64(time.Since(start)) / float64(time.Millisecond)
		if err != nil {
			return err
		}
		if reply.Score != turn+1 {
			return fmt.Errorf("winning game diverged at turn %d: score=%d", turn, reply.Score)
		}
		samples.mutex.Lock()
		samples.actions = append(samples.actions, elapsed)
		samples.mutex.Unlock()
	}
	for _, client := range clients {
		if _, err := client.request("leave", CommandData{TableID: created.TableID}); err != nil {
			return err
		}
		if err := client.close(); err != nil {
			return err
		}
	}
	samples.mutex.Lock()
	samples.completed = append(samples.completed, sliceEvaluationCompleted{joined.DatabaseID, aliceToken, bobToken})
	samples.mutex.Unlock()
	return nil
}

func sliceEvaluationReads(url string, game sliceEvaluationCompleted, reconnect bool, samples *sliceEvaluationSamples) error {
	count, command, token := 20, "replay", game.bobToken
	var client *sliceEvaluationClient
	if reconnect {
		count, command, token = 10, "reconnect", game.aliceToken
	} else {
		var err error
		client, err = sliceEvaluationConnect(url, token)
		if err != nil {
			return err
		}
		defer client.connection.Close()
	}
	for i := 0; i < count; i++ {
		start := time.Now()
		if reconnect {
			var err error
			client, err = sliceEvaluationConnect(url, token)
			if err != nil {
				return err
			}
		}
		if _, err := client.request(command, CommandData{DatabaseID: game.id}); err != nil {
			_ = client.connection.Close()
			return err
		}
		if reconnect {
			if err := client.close(); err != nil {
				return err
			}
		}
		elapsed := float64(time.Since(start)) / float64(time.Millisecond)
		samples.mutex.Lock()
		if reconnect {
			samples.reconnect = append(samples.reconnect, elapsed)
		} else {
			samples.replays = append(samples.replays, elapsed)
		}
		samples.mutex.Unlock()
	}
	if !reconnect {
		return client.close()
	}
	return nil
}

func sliceEvaluationLatency(samples []float64) map[string]interface{} {
	sorted := append([]float64(nil), samples...)
	sort.Float64s(sorted)
	return map[string]interface{}{
		"count": len(sorted), "p50Milliseconds": sorted[len(sorted)/2],
		"p95Milliseconds": sorted[len(sorted)*95/100], "maxMilliseconds": sorted[len(sorted)-1],
	}
}

// Linux current RSS, rather than Go heap allocation or an all-process high-water mark.
func sliceEvaluationRSS() (uint64, error) {
	data, err := os.ReadFile("/proc/self/statm")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(data))
	if len(fields) < 2 {
		return 0, errors.New("invalid process memory counters")
	}
	pages, err := strconv.ParseUint(fields[1], 10, 64)
	return pages * uint64(os.Getpagesize()), err
}

func TestStandardSliceEvaluation(t *testing.T) {
	if !*evaluateStandardSlice {
		t.Skip("opt in with -evaluate-standard-slice and HANABI_TEST_DATABASE_URL")
	}
	if runtime.GOOS != "linux" {
		t.Skip("current RSS measurement requires Linux")
	}
	if os.Getenv("HANABI_TEST_DATABASE_URL") == "" {
		t.Fatal("explicit disposable HANABI_TEST_DATABASE_URL is required")
	}
	loadCompatibilityCatalog(t)
	catalog := variants
	database := gamePersistenceDatabase(t)
	variants = catalog
	// Match the TS host's two work connections for reads. Preserve Go's separate
	// two-connection recovery leaf pool; merging it would change production authority.
	config := database.pool.Config().Copy()
	config.MaxConns = 2
	pool, err := connectDatabasePool(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	database.Close()
	database = newDatabase(pool, defaultDatabaseTimeout)
	db = database
	t.Cleanup(database.Close)
	oldTables, oldSessions, oldModels := tables, sessions, models
	oldGate, oldActions, oldDev := incomingCommands, actionFunctions, isDev
	oldLockOrder := deadlock.Opts.DisableLockOrderDetection
	// Match main.go: different table locks legitimately acquire the membership lock
	// in opposite directions. Actual timeout-based deadlock detection stays enabled.
	deadlock.Opts.DisableLockOrderDetection = true
	tables, sessions, models = NewTables(), NewSessions(), &Models{}
	incomingCommands, isDev = &commandGate{}, false
	actionsFunctionsInit()
	t.Cleanup(func() {
		incomingCommands.drain()
		ctx := NewMiscContext("evaluation cleanup")
		for _, table := range tables.GetList(false) {
			table.Lock(ctx)
			table.cancelTimers()
			table.Unlock(ctx)
		}
		tables, sessions, models = oldTables, oldSessions, oldModels
		incomingCommands, actionFunctions, isDev = oldGate, oldActions, oldDev
		deadlock.Opts.DisableLockOrderDetection = oldLockOrder
	})
	counted := &sliceEvaluationStore{activeGameStore: recoveryStore}
	recoveryStore = counted
	if _, err := database.Exec(context.Background(), `
		CREATE TABLE slice_evaluation_decks (
			game_id integer PRIMARY KEY, format text NOT NULL, deck jsonb NOT NULL
		)
	`); err != nil {
		t.Fatal(err)
	}
	identities := make(map[string]sliceEvaluationIdentity)
	tokens := make([]string, 16)
	for i := range tokens {
		var random [32]byte
		if _, err := rand.Read(random[:]); err != nil {
			t.Fatal(err)
		}
		token := hex.EncodeToString(random[:])
		name := fmt.Sprintf("EvalPlayer%d", i+1)
		identities[token] = sliceEvaluationIdentity{i + 1, name}
		tokens[i] = token
		if _, err := database.Exec(context.Background(), `
			INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
			VALUES ($1, $2, $3, 'unused-test-hash', '127.0.0.1')
		`, i+1, name, strings.ToLower(name)); err != nil {
			t.Fatal(err)
		}
	}
	var memoryStart, memoryEnd runtime.MemStats
	runtime.ReadMemStats(&memoryStart)
	rssStart, err := sliceEvaluationRSS()
	if err != nil {
		t.Fatal(err)
	}
	var peakRSS atomic.Uint64
	peakRSS.Store(rssStart)
	samplingDone := make(chan struct{})
	samplingErrors := make(chan error, 1)
	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-samplingDone:
				samplingErrors <- nil
				return
			case <-ticker.C:
				rss, err := sliceEvaluationRSS()
				if err != nil {
					samplingErrors <- err
					return
				}
				if rss > peakRSS.Load() {
					peakRSS.Store(rss)
				}
			}
		}
	}()
	defer func() {
		close(samplingDone)
		if err := <-samplingErrors; err != nil {
			t.Error(err)
		}
	}()
	url := sliceEvaluationHost(t, identities)
	unauthorized, response, err := websocket.DefaultDialer.Dial(url, nil)
	if unauthorized != nil {
		_ = unauthorized.Close()
	}
	if err == nil || response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatal("evaluation host accepted an unauthenticated connection")
	}
	_ = response.Body.Close()
	samples := &sliceEvaluationSamples{}
	errors := make(chan error, 16)
	started := time.Now()
	for lane := 0; lane < 4; lane++ {
		go func(lane int) {
			for game := 0; game < 2; game++ {
				index := lane*4 + game*2
				if err := sliceEvaluationPlay(url, tokens[index], tokens[index+1], samples); err != nil {
					errors <- err
					return
				}
			}
			errors <- nil
		}(lane)
	}
	for i := 0; i < 4; i++ {
		if err := <-errors; err != nil {
			t.Error(err)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
	// Include completion's registered best-effort statistics work in gameplay wall time.
	incomingCommands.drain()
	gameplayMilliseconds := float64(time.Since(started)) / float64(time.Millisecond)
	incomingCommands.resume()
	var completed, active int
	if err := database.QueryRow(context.Background(),
		"SELECT (SELECT COUNT(*) FROM games WHERE score = 25), (SELECT COUNT(*) FROM active_games)").
		Scan(&completed, &active); err != nil || completed != 8 || active != 0 {
		t.Fatalf("durable completion check: completed=%d active=%d error=%v", completed, active, err)
	}
	started = time.Now()
	for _, game := range samples.completed {
		for _, reconnect := range []bool{false, true} {
			go func(game sliceEvaluationCompleted, reconnect bool) {
				errors <- sliceEvaluationReads(url, game, reconnect, samples)
			}(game, reconnect)
		}
	}
	for i := 0; i < 16; i++ {
		if err := <-errors; err != nil {
			t.Error(err)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
	readMilliseconds := float64(time.Since(started)) / float64(time.Millisecond)
	runtime.ReadMemStats(&memoryEnd)
	rssEnd, err := sliceEvaluationRSS()
	if err != nil {
		t.Fatal(err)
	}
	deck, err := json.Marshal(sliceEvaluationDeck())
	if err != nil {
		t.Fatal(err)
	}
	report := map[string]interface{}{
		"schema": "go-slice-evaluation-v1", "go": runtime.Version(),
		"initialDeckSHA256": fmt.Sprintf("%x", sha256.Sum256(deck)),
		"scope":             "Linux Go test process containing production handlers AND scripted WebSocket clients; disposable PostgreSQL; not production capacity.",
		"workload": map[string]int{
			"concurrentGameLanes": 4, "completedGames": 8, "acceptedActions": len(samples.actions),
			"replays": len(samples.replays), "reconnects": len(samples.reconnect),
		},
		"gameplayMilliseconds": gameplayMilliseconds, "gameplayActionsPerSecond": float64(len(samples.actions)) * 1000 / gameplayMilliseconds,
		"readMilliseconds": readMilliseconds, "mixedReadsPerSecond": float64(len(samples.replays)+len(samples.reconnect)) * 1000 / readMilliseconds,
		"latency": map[string]interface{}{
			"durableAction": sliceEvaluationLatency(samples.actions), "persistedReplay": sliceEvaluationLatency(samples.replays),
			"websocketReconnectIncludingHandshakeAndClose": sliceEvaluationLatency(samples.reconnect),
		},
		"memoryBytes": map[string]uint64{
			"rssStart": rssStart, "rssEnd": rssEnd, "sampledPeakRSS": peakRSS.Load(),
			"heapAllocatedStart": memoryStart.HeapAlloc, "heapAllocatedEnd": memoryEnd.HeapAlloc,
			"runtimeReservedStart": memoryStart.Sys, "runtimeReservedEnd": memoryEnd.Sys,
		},
		"gc": map[string]interface{}{"collections": memoryEnd.NumGC - memoryStart.NumGC, "pauseMilliseconds": float64(memoryEnd.PauseTotalNs-memoryStart.PauseTotalNs) / 1e6},
		"resources": map[string]interface{}{
			"goMaxProcs": runtime.GOMAXPROCS(0), "logicalCPUs": runtime.NumCPU(),
			"ordinaryPoolMax": database.pool.Config().MaxConns, "ordinaryPoolConnectionsEnd": database.pool.Stat().TotalConns(),
			"recoveryPoolMax": 2, "committedCheckpoints": counted.writes.Load(),
		},
		"differences": []string{
			"Go uses production command handlers behind an authenticated test dispatcher, not production login, rate limiting, or lobby routing. Sessions are table-bound like recoveryTestSocket; global lobby/friend broadcasts are excluded.",
			"Explicit-deck injection and its disposable archive replace the historical seed contract; reads prefetch ordinary completed rows then invoke existing JSON replay import.",
			"Go completed reconnects are full-visibility replay reconstructions; TS reconnect returns participant-scrubbed state and history. Neither read workload is a live-game reconnect.",
			"Go creates/deletes replay tables and emits metadata, notes and clocks; TS returns its distinct full-state-and-event protocol. Payload sizes and query plans differ and wire bytes are not measured.",
			"Go performs two loaded checkpoints and a separate terminal checkpoint/finalization transaction; TS completes in one transaction. Go ordinary and recovery pools are separate.",
			"Go gameplay wall time includes best-effort completion statistics; TS does not implement these. Neither run measures account login, legacy replay generation, or production coexistence.",
			"Go uses two ordinary work connections (fixed for this comparison) plus its production two-connection recovery leaf pool; TS shares two work connections and reserves a third for ownership.",
			"Go production informational logging remains enabled, including emulated replay turns; TS emits only unexpected failures.",
			"Client/server runtime memory is combined; Go test and Node tsx startup baselines differ. GC pause time is not comparable to Node event-loop delay.",
		},
	}
	encoded, err := json.Marshal(report)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Println("GO_SLICE_EVALUATION " + string(encoded))
}
