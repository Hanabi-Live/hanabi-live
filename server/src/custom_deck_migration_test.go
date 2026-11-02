package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCustomDeckMigrationPreservesExistingGames(t *testing.T) {
	database, _ := newMigrationTestDatabase(t)
	if _, err := database.Exec(context.Background(), `
		CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
		INSERT INTO games (id, name) VALUES (1, 'legacy');
	`); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile(filepath.Join("..", "..", "install", "migrations", "005_custom_game_decks.sql"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(context.Background(), string(migration)); err != nil {
		t.Fatal(err)
	}
	var games, decks int
	if err := database.QueryRow(context.Background(), `
		SELECT (SELECT COUNT(*) FROM games WHERE id = 1 AND name = 'legacy'),
			(SELECT COUNT(*) FROM game_custom_decks)
	`).Scan(&games, &decks); err != nil || games != 1 || decks != 0 {
		t.Fatal("migration changed or fabricated historical deck data")
	}
	data, _ := customDeckFixture(t)
	if _, err := database.Exec(context.Background(),
		"INSERT INTO game_custom_decks (game_id, deck) VALUES (1, $1)", data); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(context.Background(), "DELETE FROM games WHERE id = 1"); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow(context.Background(), "SELECT COUNT(*) FROM game_custom_decks").Scan(&decks); err != nil || decks != 0 {
		t.Fatal("migration did not enable cascading custom-deck deletion")
	}
}
