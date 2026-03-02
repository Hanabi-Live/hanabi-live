package main

import (
	"crypto/rand"
	"encoding/base64"
	"time"
)

const (
	IdentityTokenTTL      = 24 * time.Hour
	IdentityTokenNumBytes = 24
)

func identityTokenIsExpired(expiresAt time.Time) bool {
	return !expiresAt.After(time.Now().UTC())
}

func identityTokenGenerate() (string, error) {
	tokenBytes := make([]byte, IdentityTokenNumBytes)
	if _, err := rand.Read(tokenBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(tokenBytes), nil
}

func identityTokenRegenerate(userID int) (UserIdentityTokenRow, error) {
	token, err := identityTokenGenerate()
	if err != nil {
		return UserIdentityTokenRow{}, err
	}

	expiresAt := time.Now().UTC().Add(IdentityTokenTTL)
	if err := models.UserIdentityTokens.Upsert(userID, token, expiresAt); err != nil {
		return UserIdentityTokenRow{}, err
	}

	return UserIdentityTokenRow{
		UserID:    userID,
		Token:     token,
		ExpiresAt: expiresAt,
	}, nil
}
