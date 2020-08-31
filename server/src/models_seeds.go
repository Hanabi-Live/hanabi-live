package main

import (
	"context"

	"github.com/jackc/pgx/v4"
)

type Seeds struct{}

func (*Seeds) UpdateNumGames(seed string) error {
	var numGames int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(id)
		FROM games
		WHERE seed = $1
	`, seed).Scan(&numGames); err != nil {
		return err
	}

	var rowExists bool
	if err := db.QueryRow(context.Background(), `
		SELECT EXISTS(
			SELECT seed
			FROM seeds
			WHERE seed = $1
		)
	`, seed).Scan(&rowExists); err != nil {
		return err
	}

	if rowExists {
		_, err := db.Exec(context.Background(), `
			UPDATE seeds
			SET num_games = $1
			WHERE seed = $2
		`, numGames, seed)
		return err
	}

	_, err := db.Exec(context.Background(), `
		INSERT INTO seeds (seed, num_games)
		VALUES ($1, $2)
	`, seed, numGames)
	return err
}

func (*Seeds) GetNumGames(seed string) (int, error) {
	var numGames int
	if err := db.QueryRow(context.Background(), `
		SELECT num_games
		FROM seeds
		WHERE seed = $1
	`, seed).Scan(&numGames); err == pgx.ErrNoRows {
		return 0, nil
	} else if err != nil {
		return 0, err
	}

	return numGames, nil
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
