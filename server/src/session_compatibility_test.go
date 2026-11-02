package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	gsessions "github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/mozillazg/go-unidecode"
	"github.com/mozillazg/go-unidecode/table"
)

func TestSessionProtocolCompatibility(t *testing.T) {
	type sample struct {
		UserID    int    `json:"userID"`
		Timestamp int64  `json:"timestamp"`
		Cookie    string `json:"cookie"`
	}
	type corpus struct {
		Key     string   `json:"key"`
		Samples []sample `json:"samples"`
	}
	filename := filepath.Join("testdata", "session_protocol.json")
	if *updateCompatibility {
		// This key is synthetic, never a production credential.
		fixtures := corpus{Key: "compatibility-only-signing-key-not-for-production"}
		store := cookie.NewStore([]byte(fixtures.Key))
		store.Options(gsessions.Options{Path: "/", MaxAge: HTTPSessionTimeout})
		for _, id := range []int{1, 42, 127, 128, 255, 256, 2147483647} {
			request := httptest.NewRequest(http.MethodGet, "/login", nil)
			session, err := store.Get(request, HTTPSessionName)
			if err != nil {
				t.Fatal(err)
			}
			session.Values["userID"] = id
			response := httptest.NewRecorder()
			if err := session.Save(request, response); err != nil {
				t.Fatal(err)
			}
			value, err := http.ParseSetCookie(response.Header().Get("Set-Cookie"))
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := base64.URLEncoding.DecodeString(value.Value)
			if err != nil {
				t.Fatal(err)
			}
			timestamp, err := strconv.ParseInt(strings.SplitN(string(decoded), "|", 2)[0], 10, 64)
			if err != nil {
				t.Fatal(err)
			}
			fixtures.Samples = append(fixtures.Samples, sample{id, timestamp, value.Value})
		}
		encoded, err := json.MarshalIndent(fixtures, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, append(encoded, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	encoded, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var fixtures corpus
	if err := json.Unmarshal(encoded, &fixtures); err != nil {
		t.Fatal(err)
	}
	store := cookie.NewStore([]byte(fixtures.Key))
	store.Options(gsessions.Options{Path: "/", MaxAge: 0})
	for _, sample := range fixtures.Samples {
		request := httptest.NewRequest(http.MethodGet, "/ws", nil)
		request.AddCookie(&http.Cookie{Name: HTTPSessionName, Value: sample.Cookie})
		session, err := store.Get(request, HTTPSessionName)
		if err != nil || session.Values["userID"] != sample.UserID {
			t.Fatalf("cookie for user %d did not authenticate: %v", sample.UserID, err)
		}
	}
}

func TestUsernameProtocolCompatibility(t *testing.T) {
	encoded, err := os.ReadFile(filepath.Join("testdata", "username_protocol.json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input      string `json:"input"`
		Normalized string `json:"normalized"`
		HasEmoji   bool   `json:"hasEmoji"`
	}
	if err := json.Unmarshal(encoded, &cases); err != nil {
		t.Fatal(err)
	}
	for _, sample := range cases {
		if got := normalizeString(strings.TrimSpace(sample.Input)); got != sample.Normalized {
			t.Errorf("username %q normalized to %q, want %q", sample.Input, got, sample.Normalized)
		}
		if got := emojiRegExp.MatchString(strings.TrimSpace(sample.Input)); got != sample.HasEmoji {
			t.Errorf("username %q emoji detection = %v, want %v", sample.Input, got, sample.HasEmoji)
		}
	}
}

func TestUsernameMappingCompatibility(t *testing.T) {
	type mapping struct {
		Version              string            `json:"version"`
		Pages                map[rune][]string `json:"pages"`
		UsernameEmojiPattern string            `json:"usernameEmojiPattern"`
	}
	expected := mapping{unidecode.Version(), table.Tables, strings.ReplaceAll(EmojiPattern, "\\x{", "\\u{")}
	filename := filepath.Join("..", "..", "packages", "server", "src", "json", "goIdentity.json")
	if *updateCompatibility {
		encoded, err := json.MarshalIndent(expected, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, append(encoded, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	encoded, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	var actual mapping
	if err := json.Unmarshal(encoded, &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("TypeScript normalization data differs from the pinned Go identity mapping")
	}
}
