package main

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v4"
)

type UserIdentityTokens struct{}

type UserIdentityTokenRow struct {
	UserID          int
	TokenEncrypted  string
	TokenHash       string
	ExpiresAt       time.Time
	DatetimeCreated time.Time
	DatetimeUpdated time.Time
}

func (*UserIdentityTokens) Get(userID int) (bool, UserIdentityTokenRow, error) {
	var row UserIdentityTokenRow
	if err := db.QueryRow(context.Background(), `
		SELECT
			user_id,
			token_encrypted,
			token_hash,
			expires_at,
			datetime_created,
			datetime_updated
		FROM user_identity_tokens
		WHERE user_id = $1
	`, userID).Scan(
		&row.UserID,
		&row.TokenEncrypted,
		&row.TokenHash,
		&row.ExpiresAt,
		&row.DatetimeCreated,
		&row.DatetimeUpdated,
	); errors.Is(err, pgx.ErrNoRows) {
		return false, row, nil
	} else if err != nil {
		return false, row, err
	}

	return true, row, nil
}

func (*UserIdentityTokens) Upsert(
	userID int,
	tokenEncrypted string,
	tokenHash string,
	expiresAt time.Time,
) error {
	_, err := db.Exec(context.Background(), `
		INSERT INTO user_identity_tokens (
			user_id,
			token_encrypted,
			token_hash,
			expires_at
		)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id)
		DO UPDATE
		SET
			token_encrypted = EXCLUDED.token_encrypted,
			token_hash = EXCLUDED.token_hash,
			expires_at = EXCLUDED.expires_at,
			datetime_updated = NOW()
	`, userID, tokenEncrypted, tokenHash, expiresAt)
	return err
}

func (*UserIdentityTokens) GetUsernameByTokenHash(
	tokenHash string,
) (bool, string, time.Time, error) {
	var username string
	var expiresAt time.Time
	if err := db.QueryRow(context.Background(), `
		SELECT
			users.username,
			user_identity_tokens.expires_at
		FROM user_identity_tokens
		JOIN users
			ON users.id = user_identity_tokens.user_id
		WHERE user_identity_tokens.token_hash = $1
	`, tokenHash).Scan(
		&username,
		&expiresAt,
	); errors.Is(err, pgx.ErrNoRows) {
		return false, "", time.Time{}, nil
	} else if err != nil {
		return false, "", time.Time{}, err
	}

	return true, username, expiresAt, nil
}
