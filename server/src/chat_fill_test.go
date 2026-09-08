package main

import (
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
)

type nicknameRoundTripper struct {
	nickname string
}

func (rt *nicknameRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	body := `{"user":{"id":"123456789012345678", "username":"alice"},` +
		`"nick":` + strconv.Quote(rt.nickname) + `}`
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}, nil
}

func chatFillMentionsWithTimeout(t *testing.T, msg string) string {
	t.Helper()
	done := make(chan string, 1)
	go func() {
		done <- chatFillMentions(msg)
	}()
	select {
	case result := <-done:
		return result
	case <-time.After(3 * time.Second):
		t.Fatal("chatFillMentions() did not terminate; " +
			"the mention replacement likely got into an infinite loop")
		return ""
	}
}

func TestChatFillMentions(t *testing.T) {
	// This is the message a user-typed "<@123456789012345678>" looks like by the time that
	// it reaches "chatFillMentions()"
	msg := "hello &lt;@123456789012345678&gt;"

	testCases := []struct {
		name     string
		nickname string
		expected string
	}{
		{
			name:     "HTML in the nickname is escaped",
			nickname: "<img src=x onerror=alert(1)>",
			expected: "hello @&lt;img src=x onerror=alert(1)&gt;",
		},
		{
			name:     "nickname containing the escaped mention syntax",
			nickname: "&lt;@123456789012345678&gt;",
			expected: "hello @&amp;lt;@123456789012345678&amp;gt;",
		},
		{
			name:     "nickname containing the raw mention syntax",
			nickname: "<@123456789012345678>",
			expected: "hello @&lt;@123456789012345678&gt;",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// The "discord" global is deliberately not reset afterward; if the implementation
			// regresses into an infinite loop, the goroutine leaked by the timeout harness would
			// dereference a nil session and panic the test binary instead of failing cleanly
			discord = &discordgo.Session{
				Client: &http.Client{
					Transport: &nicknameRoundTripper{nickname: tc.nickname},
				},
				Ratelimiter: discordgo.NewRatelimiter(),
			}

			result := chatFillMentionsWithTimeout(t, msg)
			if result != tc.expected {
				t.Errorf("chatFillMentions() = %q, want %q", result, tc.expected)
			}
		})
	}
}
