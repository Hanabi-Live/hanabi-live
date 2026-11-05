package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Only the release builder sets this. Source builds retain their existing lifecycle.
var buildRevision string
var releaseCheckpoints = make(map[uint64]bool)

func checkpointForLifecycle(ctx context.Context) bool {
	if buildRevision != "" {
		// A paused release can retry after a partial failure without granting a second
		// maintenance allowance to tables that already committed their checkpoint.
		return checkpointTablesOnce(ctx, releaseCheckpoints)
	}
	return checkpointTables(ctx)
}

// PG* is supplied by the deliberate migration runner, not normal server startup.
func checkReleaseMigrationTarget() error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	target, err := expectedSchemaVersion(filepath.Join(filepath.Dir(executable), "install/migrations"))
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), defaultDatabaseTimeout)
	defer cancel()
	connection, err := pgx.Connect(ctx, "")
	if err != nil {
		return err
	}
	defer connection.Close(ctx) // nolint:errcheck
	var exists bool
	if err := connection.QueryRow(ctx, "SELECT to_regclass('public.schema_version') IS NOT NULL").Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return nil
	}
	var current, count int
	if err := connection.QueryRow(ctx, "SELECT COALESCE(MIN(version), -1), COUNT(*) FROM public.schema_version").
		Scan(&current, &count); err != nil {
		return err
	}
	if count != 1 || current < 0 || current > target {
		return fmt.Errorf("refusing schema downgrade or invalid version: database %d (rows %d), release %d", current, count, target)
	}
	return nil
}

type releaseMetadata struct {
	Format        int               `json:"format"`
	Revision      string            `json:"revision"`
	ClientVersion string            `json:"clientVersion"`
	Files         map[string]string `json:"files"`
}

func verifyRelease(directory, revision string) error {
	metadataPath := filepath.Join(directory, "release.json")
	info, err := os.Lstat(metadataPath)
	if err != nil || !info.Mode().IsRegular() {
		return fmt.Errorf("release metadata is missing or is not a regular file")
	}
	data, err := os.ReadFile(metadataPath)
	if err != nil {
		return err
	}
	var metadata releaseMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return err
	}
	if metadata.Format != 1 || metadata.Revision != revision || len(revision) != 40 {
		return fmt.Errorf("release metadata does not match the compiled revision")
	}
	for _, name := range []string{
		"hanabi-live", "public/js/bundles/version.txt", "public/js/bundles/git_revision.txt",
	} {
		if _, ok := metadata.Files[name]; !ok {
			return fmt.Errorf("release manifest is missing %q", name)
		}
	}
	chatCommands := "packages/data/src/json/chatReplyCommands.json"
	if _, err := os.Lstat(filepath.Join(directory, chatCommands)); os.IsNotExist(err) {
		chatCommands = "packages/server/src/json/chatReplyCommands.json"
	} else if err != nil {
		return err
	}
	if _, ok := metadata.Files[chatCommands]; !ok {
		return fmt.Errorf("release manifest is missing %q", chatCommands)
	}
	for name, expected := range metadata.Files {
		if filepath.IsAbs(name) || filepath.ToSlash(filepath.Clean(name)) != name ||
			name == ".." || strings.HasPrefix(name, "../") {
			return fmt.Errorf("invalid release path %q", name)
		}
		filename := filepath.Join(directory, name)
		info, err := os.Lstat(filename)
		if err != nil || !info.Mode().IsRegular() {
			return fmt.Errorf("release file is missing or is not a regular file: %q", name)
		}
		resolved, err := filepath.EvalSymlinks(filename)
		if err != nil || resolved != filename {
			return fmt.Errorf("release file is missing or is a symlink: %q", name)
		}
		file, err := os.Open(filename)
		if err != nil {
			return err
		}
		hash := sha256.New()
		_, readErr := io.Copy(hash, file)
		closeErr := file.Close()
		if readErr != nil || closeErr != nil || hex.EncodeToString(hash.Sum(nil)) != expected {
			return fmt.Errorf("release checksum failed: %q", name)
		}
	}
	for name, expected := range map[string]string{
		"version.txt":      metadata.ClientVersion,
		"git_revision.txt": revision,
	} {
		value, err := os.ReadFile(filepath.Join(directory, "public/js/bundles", name))
		if err != nil || strings.TrimSpace(string(value)) != expected {
			return fmt.Errorf("client/server release mismatch: %q", name)
		}
	}
	return nil
}
