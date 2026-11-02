package main

import (
	"bytes"
	"context"
	"fmt"
)

type GameCustomDecks struct{}

func readCustomDeckData(operations *databaseOperations, gameID int) ([]byte, error) {
	var data []byte
	err := operations.QueryRow(context.Background(), `
		SELECT d.deck FROM games g LEFT JOIN game_custom_decks d ON d.game_id = g.id WHERE g.id = $1
	`, gameID).Scan(&data)
	return data, err
}

func (*GameCustomDecks) Get(gameID int, variant *Variant) ([]*CardIdentity, error) {
	data, err := readCustomDeckData(db.databaseOperations, gameID)
	if err != nil || data == nil {
		return nil, err
	}
	return decodeCustomDeck(data, variant)
}

func (*GameCustomDecks) WriteTx(
	tx *databaseTransaction, gameID int, variant *Variant, data []byte, inserted bool,
) error {
	if inserted {
		if data != nil {
			if _, err := decodeCustomDeck(data, variant); err != nil {
				return err
			}
			_, err := tx.Exec(context.Background(),
				"INSERT INTO game_custom_decks (game_id, deck) VALUES ($1, $2)", gameID, data)
			return err
		}
		return nil
	}
	stored, err := readCustomDeckData(tx.databaseOperations, gameID)
	if err != nil {
		return err
	}
	if stored != nil {
		if _, err := decodeCustomDeck(stored, variant); err != nil {
			return err
		}
	}
	if !bytes.Equal(stored, data) {
		return fmt.Errorf("completed game %d conflicts with the stored custom deck", gameID)
	}
	return nil
}
