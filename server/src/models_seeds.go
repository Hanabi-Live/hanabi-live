package main

import (
	"context"
	"errors"

	"fmt"
	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/jackc/pgx/v5"
)

type Seeds struct{}

func (*Seeds) UpdateNumGames(seed string) error {
	tx, err := db.Begin(context.Background())
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(context.Background(), `
		INSERT INTO seeds (seed, num_games) VALUES ($1, 0)
		ON CONFLICT (seed) DO NOTHING
	`, seed); err != nil {
		return err
	}
	// Acquire the row before taking the count's statement snapshot.
	if _, err := tx.Exec(context.Background(), "SELECT seed FROM seeds WHERE seed = $1 FOR UPDATE", seed); err != nil {
		return err
	}
	if _, err := tx.Exec(context.Background(), `
		UPDATE seeds SET num_games = (SELECT COUNT(*) FROM games WHERE seed = $1)
		WHERE seed = $1
	`, seed); err != nil {
		return err
	}
	return tx.Commit(context.Background())
}

func (*Seeds) GetNumGames(seed string) (int, error) {
	var numGames int
	if err := db.QueryRow(context.Background(), `
		SELECT num_games
		FROM seeds
		WHERE seed = $1
	`, seed).Scan(&numGames); errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}

	return numGames, nil
}

type ScoreFreq struct {
	Score    int `json:"score"`
	NumTimes int `json:"numTimes"`
}

func (*Seeds) GetScoreFreqs(seed string) ([]*ScoreFreq, error) {
	scoreFreqs := make([]*ScoreFreq, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT score, COUNT(*) as numtimes
		FROM games
		WHERE seed = $1
		GROUP BY score
		ORDER BY score ASC
	`, seed); errors.Is(err, pgx.ErrNoRows) {
		return scoreFreqs, nil
	} else if err != nil {
		return scoreFreqs, err
	} else {
		rows = v
	}

	for rows.Next() {
		freq := ScoreFreq{ // nolint: exhaustivestruct
		}
		rows.Scan(&freq.Score, &freq.NumTimes)
		logger.Debug(fmt.Sprintf("%d instances of score %d", freq.NumTimes, freq.Score))
		scoreFreqs = append(scoreFreqs, &freq)
	}

	return scoreFreqs, nil
}

func (s *Seeds) UpdateAll() error {
	seeds := make([]string, 0)

	// Get a list of every unique seed that has been played on
	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT DISTINCT seed
		FROM games
	`); err != nil {
		return err
	} else {
		rows = v
	}

	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return err
		}
		seeds = append(seeds, seed)
	}

	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()

	// For each seed, insert or update the corresponding row in the seeds table
	for _, seed := range seeds {
		if err := s.UpdateNumGames(seed); err != nil {
			return err
		}
	}

	return nil
}
