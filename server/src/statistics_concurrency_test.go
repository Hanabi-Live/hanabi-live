package main

import (
	"context"
	"math"
	"testing"
)

func statisticsTestGames(t *testing.T, scores ...int) ([]*Game, []gameDatabasePlayer) {
	t.Helper()
	gamePersistenceDatabase(t)
	oldModels := models
	models = &Models{}
	t.Cleanup(func() { models = oldModels })
	if _, err := db.Exec(context.Background(), `
		INSERT INTO users (id, username, normalized_username, password_hash, last_ip)
		VALUES (1, 'Alice', 'alice', 'unused-test-hash', '127.0.0.1'),
			(2, 'Bob', 'bob', 'unused-test-hash', '127.0.0.1')
	`); err != nil {
		t.Fatal(err)
	}
	games := make([]*Game, 0, len(scores))
	for _, score := range scores {
		row := gamePersistenceRow(t)
		row.Score = score
		tx, err := db.Begin(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(context.Background())
		if _, err := models.Games.InsertTx(tx, row); err != nil {
			t.Fatal(err)
		}
		if err := models.GameParticipants.BulkInsertTx(tx, []*GameParticipantsRow{
			{GameID: row.ID, UserID: 1, Seat: 0},
			{GameID: row.ID, UserID: 2, Seat: 1},
		}); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(context.Background()); err != nil {
			t.Fatal(err)
		}
		games = append(games, &Game{
			DatabaseID: row.ID, Seed: row.Seed, Score: row.Score,
			Options: row.Options, Variant: variants[DefaultVariantName],
		})
	}
	return games, []gameDatabasePlayer{{userID: 1, name: "Alice"}, {userID: 2, name: "Bob"}}
}

func TestConcurrentStatisticsRefreshPreservesBestResults(t *testing.T) {
	games, players := statisticsTestGames(t, 3, 25, 4, 0, 20, 5, 12, 10)
	start := make(chan struct{})
	results := make(chan error, len(games))
	for _, game := range games {
		go func(g *Game) {
			<-start
			if err := models.Seeds.UpdateNumGames(g.Seed); err != nil {
				results <- err
				return
			}
			results <- g.writeDatabaseStats(players)
		}(game)
	}
	close(start)
	for range games {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	if count, err := models.Seeds.GetNumGames(games[0].Seed); err != nil || count != len(games) {
		t.Fatalf("seed count = %d, %v", count, err)
	}
	for _, player := range players {
		stats, err := models.UserStats.Get(player.userID, 0)
		if err != nil {
			t.Fatal(err)
		}
		if stats.NumGames != 8 || stats.BestScores[0].Score != 25 || stats.NumStrikeouts != 1 ||
			math.Abs(stats.AverageScore-79.0/7) > 0.000001 {
			t.Fatalf("lost user statistics: %+v, best=%+v", stats, stats.BestScores[0])
		}
	}
	stats, err := models.VariantStats.Get(0)
	if err != nil {
		t.Fatal(err)
	}
	if stats.NumGames != 8 || stats.BestScores[0].Score != 25 || stats.NumMaxScores != 1 ||
		stats.NumStrikeouts != 1 || math.Abs(stats.AverageScore-79.0/7) > 0.000001 {
		t.Fatalf("lost variant statistics: %+v", stats)
	}
}

func TestStatisticsRefreshFailureRollsBackUserAndVariantCaches(t *testing.T) {
	games, players := statisticsTestGames(t, 25)
	if _, err := db.Exec(context.Background(), `
		ALTER TABLE variant_stats ADD CONSTRAINT reject_statistics CHECK (num_games = 0)
	`); err != nil {
		t.Fatal(err)
	}
	if err := games[0].writeDatabaseStats(players); err == nil {
		t.Fatal("invalid statistics update was accepted")
	}
	var count int
	if err := db.QueryRow(context.Background(), `
		SELECT (SELECT COUNT(*) FROM user_stats) + (SELECT COUNT(*) FROM variant_stats)
	`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("statistics refresh committed partially: %d, %v", count, err)
	}
	if _, err := db.Exec(context.Background(), "ALTER TABLE variant_stats DROP CONSTRAINT reject_statistics"); err != nil {
		t.Fatal(err)
	}
	if err := games[0].writeDatabaseStats(players); err != nil {
		t.Fatalf("statistics refresh could not be retried: %v", err)
	}
}
