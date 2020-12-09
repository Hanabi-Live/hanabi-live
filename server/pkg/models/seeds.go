package models

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v4"
)

type Seeds struct {
	m *Models // Reverse reference
}

func (s *Seeds) UpdateNumGames(ctx context.Context, seed string) error {
	SQLString1 := `
		SELECT COUNT(id)
		FROM games
		WHERE seed = $1
	`

	var numGames int
	if err := s.m.db.QueryRow(ctx, SQLString1, seed).Scan(&numGames); err != nil {
		return err
	}

	SQLString2 := `
		SELECT EXISTS(
			SELECT seed
			FROM seeds
			WHERE seed = $1
		)
	`

	var rowExists bool
	if err := s.m.db.QueryRow(ctx, SQLString2, seed).Scan(&rowExists); err != nil {
		return err
	}

	if rowExists {
		SQLString3 := `
			UPDATE seeds
			SET num_games = $1
			WHERE seed = $2
		`

		_, err := s.m.db.Exec(ctx, SQLString3, numGames, seed)
		return err
	}

	SQLString4 := `
		INSERT INTO seeds (seed, num_games)
		VALUES ($1, $2)
	`

	_, err := s.m.db.Exec(ctx, SQLString4, seed, numGames)
	return err
}

func (s *Seeds) GetNumGames(ctx context.Context, seed string) (int, error) {
	SQLString := `
		SELECT num_games
		FROM seeds
		WHERE seed = $1
	`

	var numGames int
	if err := s.m.db.QueryRow(ctx, SQLString, seed).Scan(&numGames); errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	} else if err != nil {
		return 0, err
	}

	return numGames, nil
}

func (s *Seeds) UpdateAll(ctx context.Context) error {
	// Get a list of every unique seed that has been played on
	SQLString := `
		SELECT DISTINCT seed
		FROM games
	`

	seeds := make([]string, 0)
	var rows pgx.Rows
	if v, err := s.m.db.Query(ctx, SQLString); err != nil {
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
		if err := s.UpdateNumGames(ctx, seed); err != nil {
			return err
		}
	}

	return nil
}
