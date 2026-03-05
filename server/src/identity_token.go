package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"os"
	"time"
)

const (
	IdentityTokenTTL       = 24 * time.Hour
	IdentityTokenNumBytes  = 24
	IdentityTokenNonceSize = 12
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
		return nil, errors.New("SESSION_SECRET is required for identity token encryption")
	}

	hash := sha256.Sum256([]byte(sessionSecret))
	return hash[:], nil
}

func identityTokenHash(token string) (string, error) {
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

func identityTokenEncrypt(token string) (string, error) {
	key, err := identityTokenGetSecretKey()
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, IdentityTokenNonceSize)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nil, nonce, []byte(token), nil)
	payload := append(nonce, ciphertext...)
	return base64.RawURLEncoding.EncodeToString(payload), nil
}

func identityTokenDecrypt(tokenEncrypted string) (string, error) {
	key, err := identityTokenGetSecretKey()
	if err != nil {
		return "", err
	}

	payload, err := base64.RawURLEncoding.DecodeString(tokenEncrypted)
	if err != nil {
		return "", err
	}
	if len(payload) <= IdentityTokenNonceSize {
		return "", errors.New("identity token payload is too short")
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := payload[:IdentityTokenNonceSize]
	ciphertext := payload[IdentityTokenNonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func identityTokenRegenerate(userID int) (UserIdentityTokenRow, string, error) {
	token, err := identityTokenGenerate()
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	tokenEncrypted, err := identityTokenEncrypt(token)
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	tokenHash, err := identityTokenHash(token)
	if err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	expiresAt := time.Now().UTC().Add(IdentityTokenTTL)
	if err := models.UserIdentityTokens.Upsert(userID, tokenEncrypted, tokenHash, expiresAt); err != nil {
		return UserIdentityTokenRow{}, "", err
	}

	return UserIdentityTokenRow{
		UserID:         userID,
		TokenEncrypted: tokenEncrypted,
		TokenHash:      tokenHash,
		ExpiresAt:      expiresAt,
	}, token, nil
}
