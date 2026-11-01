package main

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
)

var migrationFilenamePattern = regexp.MustCompile(`^([0-9]{3,9})_[a-z0-9_]+\.sql$`)

func expectedSchemaVersion(directory string) (int, error) {
	files, err := os.ReadDir(directory)
	if err != nil {
		return 0, err
	}
	versions := make(map[int]bool)
	for _, file := range files {
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}
		match := migrationFilenamePattern.FindStringSubmatch(file.Name())
		if !file.Type().IsRegular() || match == nil {
			return 0, fmt.Errorf("invalid migration file: %s", file.Name())
		}
		version, err := strconv.Atoi(match[1])
		if err != nil || version == 0 || versions[version] {
			return 0, fmt.Errorf("invalid or duplicate migration version: %s", file.Name())
		}
		versions[version] = true
	}
	for version := 1; version <= len(versions); version++ {
		if !versions[version] {
			return 0, fmt.Errorf("missing migration version %03d", version)
		}
	}
	return len(versions), nil
}

func verifySchemaVersion(ctx context.Context, database *database, expected int) error {
	if expected == 0 {
		return nil
	}
	var version, count int
	if err := database.QueryRow(ctx, `
		SELECT COALESCE(MIN(version), -1), COUNT(*)
		FROM public.schema_version
	`).Scan(&version, &count); err != nil {
		return fmt.Errorf("read schema version; run ./install/migrate.sh apply: %w", err)
	}
	if count != 1 || version < expected {
		return fmt.Errorf("database schema version is %d (rows: %d), need at least %d; run ./install/migrate.sh apply",
			version, count, expected)
	}
	return nil
}
