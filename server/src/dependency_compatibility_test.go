package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alexedwards/argon2id"
	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
)

func TestLegacySessionCookieSurvivesDependencyUpdates(t *testing.T) {
	// Synthetic fixture captured with securecookie v1.1.1; this is not a real credential.
	const key = "compatibility-only-signing-key-not-for-production"
	const encoded = "MTc5MzU3OTIzMnxEWDhFQVFMX2dBQUJFQUVRQUFBZF80QUFBUVp6ZEhKcGJtY01DQUFHZFhObGNrbEVBMmx1ZEFRQ0FGUT18iTHBADkFxIqRclEtRpGn-Afn0tA6UjhY0XCOgPU8YGI="
	store := cookie.NewStore([]byte(key))
	// Test the persisted format, not the age of this fixed fixture.
	store.Options(gsessions.Options{Path: "/", MaxAge: 0})
	request := httptest.NewRequest(http.MethodGet, "/ws", nil)
	request.AddCookie(&http.Cookie{Name: HTTPSessionName, Value: encoded})
	session, err := store.Get(request, HTTPSessionName)
	if err != nil || session.Values["userID"] != 42 {
		t.Fatalf("legacy session was not authenticated: %v, %v", session, err)
	}
	wrongKeyStore := cookie.NewStore([]byte("different-test-signing-key-not-for-production"))
	wrongKeyStore.Options(gsessions.Options{Path: "/", MaxAge: 0})
	wrongKeyRequest := httptest.NewRequest(http.MethodGet, "/ws", nil)
	wrongKeyRequest.AddCookie(&http.Cookie{Name: HTTPSessionName, Value: encoded})
	if _, err := wrongKeyStore.Get(wrongKeyRequest, HTTPSessionName); err == nil {
		t.Fatal("legacy session accepted a different signing key")
	}
}

// Synthetic hash captured with the previously pinned 2021 argon2id implementation.
// cspell:disable-next-line
const compatibilityPasswordHash = "$argon2id$v=19$m=65536,t=1,p=2$HSb5x/B2rWrD/KfnvZ6g/Q$4I9HT3Tlhv7K5qAbHhfODmW0d8aL4tmlfkw4dOOsX2s"

func TestLegacyPasswordHashSurvivesDependencyUpdates(t *testing.T) {
	for _, test := range []struct {
		password string
		matches  bool
	}{
		{"compatibility-password", true},
		{"wrong-password", false},
	} {
		matches, err := argon2id.ComparePasswordAndHash(test.password, compatibilityPasswordHash)
		if err != nil || matches != test.matches {
			t.Fatalf("legacy hash comparison = %v, %v; want %v", matches, err, test.matches)
		}
	}
}
