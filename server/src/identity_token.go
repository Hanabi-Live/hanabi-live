package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"time"

	"github.com/alexedwards/argon2id"
)

const (
	IdentityTokenTTL      = 24 * time.Hour
	IdentityTokenNumBytes = 96 // 96 raw bytes encode to 128 base64url characters.
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

func identityTokenGetSecretKey() ([]byte, error) {
	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		return nil, errors.New("SESSION_SECRET is required for identity token hashing")
	}

	hash := sha256.Sum256([]byte(sessionSecret))
	return hash[:], nil
}

func identityTokenLookupHash(token string) (string, error) {
	key, err := identityTokenGetSecretKey()
	if err != nil {
		return "", err
	}

	h := hmac.New(sha256.New, key)
	if _, err := h.Write([]byte(token)); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

func identityTokenPasswordHash(token string) (string, error) {
	return argon2id.CreateHash(token, argon2id.DefaultParams)
}

func identityTokenPasswordHashMatches(token string, tokenHash string) (bool, error) {
	return argon2id.ComparePasswordAndHash(token, tokenHash)
}

func identityTokenRegenerate(userID int) (UserIdentityTokenRow, string, error) {
	token, err := identityTokenGenerate()
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	tokenHash, err := identityTokenPasswordHash(token)
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	tokenLookupHash, err := identityTokenLookupHash(token)
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	expiresAt := time.Now().UTC().Add(IdentityTokenTTL)
	if err := models.UserIdentityTokens.Upsert(userID, tokenHash, tokenLookupHash, expiresAt); err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	return UserIdentityTokenRow{
		UserID:          userID,
		TokenHash:       tokenHash,
		TokenLookupHash: tokenLookupHash,
		ExpiresAt:       expiresAt,
	}, token, nil
}
