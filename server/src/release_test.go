package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestReleaseCheckpointRetryDoesNotRepeatMaintenanceAllowance(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	table.Options.Timed = true
	table.Game.Players[0].Time = time.Minute
	completed := make(map[uint64]bool)
	incomingCommands.drain()
	if !checkpointTablesOnce(ctx, completed) {
		t.Fatal("initial release checkpoint failed")
	}
	first := recoveryStore.(*memoryActiveGames).rows[table.Game.DatabaseID]
	if !checkpointTablesOnce(ctx, completed) {
		t.Fatal("release checkpoint retry failed")
	}
	second := recoveryStore.(*memoryActiveGames).rows[table.Game.DatabaseID]
	if table.Game.Players[0].Time != 80*time.Second || first.Revision != second.Revision ||
		string(first.Data) != string(second.Data) {
		t.Fatal("retry changed an already authoritative maintenance checkpoint")
	}
}

func TestReleaseCheckpointFailureRetainsAuthorityAndPause(t *testing.T) {
	table, ctx := newTimerTestTable(t)
	store := recoveryStore.(*memoryActiveGames)
	table.Lock(ctx)
	err := table.checkpoint(ctx, time.Now())
	table.Unlock(ctx)
	if err != nil {
		t.Fatal(err)
	}
	authoritative := store.rows[table.Game.DatabaseID]
	store.err = errors.New("injected release checkpoint failure")
	completed := make(map[uint64]bool)
	incomingCommands.drain()
	if checkpointTablesOnce(ctx, completed) || completed[table.ID] || !table.recoveryBlocked.Load() {
		t.Fatal("failed release checkpoint was accepted")
	}
	store.err = nil
	if !checkpointTablesOnce(ctx, completed) {
		t.Fatal("frozen table blocked a safe retry")
	}
	if incomingCommands.enter() {
		incomingCommands.leave()
		t.Fatal("failed release checkpoint resumed commands")
	}
	if current := store.rows[table.Game.DatabaseID]; current.Revision != authoritative.Revision ||
		string(current.Data) != string(authoritative.Data) {
		t.Fatal("retry overwrote the authoritative checkpoint with frozen memory")
	}
}

func TestReleaseVerificationRejectsMixedOrCorruptAssets(t *testing.T) {
	directory := t.TempDir()
	revision := strings.Repeat("a", 40)
	contents := map[string]string{
		"hanabi-live":                                     "binary",
		"public/js/bundles/version.txt":                   "10\n",
		"public/js/bundles/git_revision.txt":              revision + "\n",
		"packages/server/src/json/chatReplyCommands.json": "[]\n",
	}
	metadata := releaseMetadata{Format: 1, Revision: revision, ClientVersion: "10", Files: make(map[string]string)}
	for name, content := range contents {
		filename := filepath.Join(directory, name)
		if err := os.MkdirAll(filepath.Dir(filename), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		hash := sha256.Sum256([]byte(content))
		metadata.Files[name] = hex.EncodeToString(hash[:])
	}
	writeManifest := func() {
		t.Helper()
		data, err := json.Marshal(metadata)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "release.json"), data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	writeManifest()
	if err := verifyRelease(directory, revision); err != nil {
		t.Fatal(err)
	}
	const chatCommands = "packages/server/src/json/chatReplyCommands.json"
	chatHash := metadata.Files[chatCommands]
	delete(metadata.Files, chatCommands)
	writeManifest()
	if err := verifyRelease(directory, revision); err == nil {
		t.Fatal("accepted a release without the chat response commands")
	}
	metadata.Files[chatCommands] = chatHash
	writeManifest()
	if err := verifyRelease(directory, strings.Repeat("b", 40)); err == nil {
		t.Fatal("accepted mismatched compiled revision")
	}
	metadata.ClientVersion = "11"
	writeManifest()
	if err := verifyRelease(directory, revision); err == nil {
		t.Fatal("accepted mismatched client version")
	}
	metadata.ClientVersion = "10"
	metadata.Files["../escape"] = "unused"
	writeManifest()
	if err := verifyRelease(directory, revision); err == nil {
		t.Fatal("accepted a manifest path outside the release")
	}
	delete(metadata.Files, "../escape")
	writeManifest()
	if err := os.WriteFile(filepath.Join(directory, "hanabi-live"), []byte("corrupt"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := verifyRelease(directory, revision); err == nil {
		t.Fatal("accepted corrupt binary")
	}
}
