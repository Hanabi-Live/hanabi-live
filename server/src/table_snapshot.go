package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/sasha-s/go-deadlock"
)

const tableSnapshotVersion = 2

var snapshotFilesMutex sync.Mutex

func encodeTableSnapshotAt(t *Table, savedAt time.Time) ([]byte, error) {
	// Retain the top-level table layout used by legacy snapshots.
	return json.Marshal(struct {
		SnapshotVersion int
		SavedAt         time.Time
		*Table
	}{tableSnapshotVersion, savedAt, t})
}

func decodeTableSnapshot(data []byte) (*Table, error) {
	var metadata struct {
		SnapshotVersion int
		SavedAt         time.Time
		Game            *struct {
			Actions    []json.RawMessage
			RecoveryID string
		}
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		return nil, err
	}
	if metadata.SnapshotVersion < 0 || metadata.SnapshotVersion > tableSnapshotVersion {
		return nil, fmt.Errorf("unsupported table snapshot version: %d", metadata.SnapshotVersion)
	}
	if metadata.Game == nil {
		return nil, errors.New("table snapshot has no game")
	}

	t := &Table{}
	if err := json.Unmarshal(data, t); err != nil {
		return nil, err
	}
	g := t.Game
	if g.DatabaseID < 0 || (metadata.SnapshotVersion == tableSnapshotVersion && g.DatabaseID == 0) {
		return nil, errors.New("table snapshot has no valid reserved database ID")
	}
	if g.DatabaseID == 0 && metadata.Game.RecoveryID != "" {
		return nil, errors.New("UUID-based snapshot must be resolved with the previous server before applying migration 003")
	}
	if t.ID == 0 || !t.Running || t.Replay || t.Options == nil || t.ExtraOptions == nil || g.Variant == nil {
		return nil, errors.New("table snapshot is missing active-game metadata")
	}
	if len(t.Players) < 2 || len(t.Players) > 6 || len(g.Players) != len(t.Players) ||
		t.Options.NumPlayers != len(t.Players) || g.ActivePlayerIndex < 0 || g.ActivePlayerIndex >= len(g.Players) {
		return nil, errors.New("table snapshot has invalid players")
	}
	if g.StartedTimer && g.DatetimeTurnBegin.IsZero() {
		return nil, errors.New("table snapshot has no start time for its running clock")
	}
	if g.EndCondition < EndConditionInProgress || g.EndCondition > EndConditionTerminatedByVote ||
		(g.EndCondition != EndConditionInProgress && g.DatetimeFinished.IsZero()) {
		return nil, errors.New("table snapshot has invalid terminal state")
	}
	if g.DeckIndex < 0 || g.DeckIndex > len(g.Deck) || len(g.Deck) != len(g.CardIdentities) {
		return nil, errors.New("table snapshot has an invalid deck")
	}
	for i, card := range g.Deck {
		identity := g.CardIdentities[i]
		if card == nil || identity == nil || card.Order != i ||
			card.SuitIndex != identity.SuitIndex || card.Rank != identity.Rank {
			return nil, fmt.Errorf("table snapshot has an invalid card at index %d", i)
		}
	}

	t.Spectators = make([]*Spectator, 0)
	t.KickedPlayers = make(map[int]struct{})
	if t.ChatRead == nil {
		t.ChatRead = make(map[int]int)
	}
	t.mutex = &deadlock.Mutex{}
	t.snapshotSavedAt = metadata.SavedAt
	g.Table, g.Options, g.ExtraOptions = t, t.Options, t.ExtraOptions
	if g.Tags == nil {
		g.Tags = make(map[string]int)
	}

	heldCards := make(map[int]bool)
	for i, player := range g.Players {
		if player == nil || t.Players[i] == nil || player.Index != i {
			return nil, fmt.Errorf("table snapshot has an invalid player at index %d", i)
		}
		player.Game = g
		t.Players[i].Present = false
		for _, card := range player.Hand {
			if card == nil || card.Order < 0 || card.Order >= g.DeckIndex || heldCards[card.Order] {
				return nil, fmt.Errorf("table snapshot has an invalid hand for player %d", i)
			}
			deckCard := g.Deck[card.Order]
			if deckCard.SuitIndex != card.SuitIndex || deckCard.Rank != card.Rank {
				return nil, fmt.Errorf("table snapshot has a mismatched hand card for player %d", i)
			}
			// Legacy restorations duplicated these pointers. Preserve the current hand state.
			g.Deck[card.Order] = card
			heldCards[card.Order] = true
		}
	}
	for i, rawAction := range metadata.Game.Actions {
		action, err := decodeSnapshotAction(rawAction)
		if err != nil {
			return nil, fmt.Errorf("table snapshot action %d: %w", i, err)
		}
		g.Actions[i] = action
	}
	return t, nil
}

func decodeSnapshotAction(data json.RawMessage) (interface{}, error) {
	var header struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &header); err != nil {
		return nil, err
	}
	switch header.Type {
	case "cardIdentity":
		var action ActionCardIdentity
		err := json.Unmarshal(data, &action)
		return action, err
	case "clue":
		var action ActionClue
		err := json.Unmarshal(data, &action)
		return action, err
	case "discard":
		var action ActionDiscard
		err := json.Unmarshal(data, &action)
		return action, err
	case "draw":
		var action ActionDraw
		err := json.Unmarshal(data, &action)
		return action, err
	case "gameOver":
		var action ActionGameOver
		err := json.Unmarshal(data, &action)
		return action, err
	case "play":
		var action ActionPlay
		err := json.Unmarshal(data, &action)
		return action, err
	case "playerTimes":
		var action ActionPlayerTimes
		err := json.Unmarshal(data, &action)
		return action, err
	case "strike":
		var action ActionStrike
		err := json.Unmarshal(data, &action)
		return action, err
	case "status":
		var action ActionStatus
		err := json.Unmarshal(data, &action)
		return action, err
	case "turn":
		var action ActionTurn
		err := json.Unmarshal(data, &action)
		return action, err
	default:
		return nil, fmt.Errorf("unknown action type %q", header.Type)
	}
}

func writeTableSnapshot(filename string, data []byte) error {
	directory := filepath.Dir(filename)
	file, err := os.CreateTemp(directory, "."+filepath.Base(filename)+".tmp-")
	if err != nil {
		return err
	}
	defer func() {
		if err := os.Remove(file.Name()); err != nil && !os.IsNotExist(err) {
			logger.Error("Failed to remove temporary table snapshot: " + err.Error())
		}
	}()
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(file.Name(), filename); err != nil {
		return err
	}
	return syncSnapshotDirectory(directory)
}

func discardTableSnapshots(directory string) error {
	snapshotFilesMutex.Lock()
	defer snapshotFilesMutex.Unlock()

	files, err := os.ReadDir(directory)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(file.Name(), ".json") {
			if err := os.Remove(filepath.Join(directory, file.Name())); err != nil {
				return err
			}
		}
	}
	return syncSnapshotDirectory(directory)
}

func syncSnapshotDirectory(directory string) error {
	// Directory syncing is not supported on Windows.
	if runtime.GOOS != "windows" {
		dir, err := os.Open(directory)
		if err != nil {
			return err
		}
		err = dir.Sync()
		closeErr := dir.Close()
		if err != nil {
			return err
		}
		return closeErr
	}
	return nil
}
