package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestChatEventWirePayload(t *testing.T) {
	datetime := time.Date(2026, time.October, 14, 12, 0, 0, 0, time.UTC)
	type chatEvent interface {
		wire() *ChatMessage
	}

	tests := []struct {
		name  string
		event chatEvent
		want  string
	}{
		{
			name: "lobby user with stable ID",
			event: lobbyChatEvent{
				content: chatMessageContent{
					msg:      "hi",
					who:      "Ada",
					source:   ChatLogSourceUser,
					datetime: datetime,
				},
				room:   "lobby",
				chatID: 42,
			},
			want: `{"msg":"hi","who":"Ada","discord":false,"server":false,"datetime":"2026-10-14T12:00:00Z","chatID":42,"room":"lobby","recipient":""}`,
		},
		{
			name: "discord lobby message",
			event: lobbyChatEvent{
				content: chatMessageContent{
					msg:      "hello",
					who:      "DiscordUser",
					source:   ChatLogSourceDiscord,
					datetime: datetime,
				},
				room:   "lobby",
				chatID: 43,
			},
			want: `{"msg":"hello","who":"DiscordUser","discord":true,"server":false,"datetime":"2026-10-14T12:00:00Z","chatID":43,"room":"lobby","recipient":""}`,
		},
		{
			name: "server lobby announcement",
			event: lobbyChatEvent{
				content: chatMessageContent{
					msg:      "welcome",
					who:      "",
					source:   ChatLogSourceServer,
					datetime: datetime,
				},
				room: "lobby",
			},
			want: `{"msg":"welcome","who":"","discord":false,"server":true,"datetime":"2026-10-14T12:00:00Z","room":"lobby","recipient":""}`,
		},
		{
			name: "table message without chat ID",
			event: tableChatEvent{
				content: chatMessageContent{
					msg:      "clue",
					who:      "Ada",
					source:   ChatLogSourceUser,
					datetime: datetime,
				},
				room: "table00123",
			},
			want: `{"msg":"clue","who":"Ada","discord":false,"server":false,"datetime":"2026-10-14T12:00:00Z","room":"table00123","recipient":""}`,
		},
		{
			name: "table server message",
			event: tableChatEvent{
				content: chatMessageContent{
					msg:      "joined",
					who:      "",
					source:   ChatLogSourceServer,
					datetime: datetime,
				},
				room: "table123",
			},
			want: `{"msg":"joined","who":"","discord":false,"server":true,"datetime":"2026-10-14T12:00:00Z","room":"table123","recipient":""}`,
		},
		{
			name: "private message without room",
			event: privateChatEvent{
				content: chatMessageContent{
					msg:      "secret",
					who:      "Ada",
					source:   ChatLogSourceUser,
					datetime: datetime,
				},
				pmID:      88,
				recipient: "Alice",
			},
			want: `{"msg":"secret","who":"Ada","discord":false,"server":false,"datetime":"2026-10-14T12:00:00Z","pmID":88,"room":"","recipient":"Alice"}`,
		},
		{
			name: "personal server notice at table",
			event: noticeChatEvent{
				msg:       "You are an IMPOSTOR.",
				who:       WebsiteName,
				datetime:  datetime,
				room:      "table123",
				recipient: "Alice",
			},
			want: `{"msg":"You are an IMPOSTOR.","who":"Hanab Live","discord":false,"server":true,"datetime":"2026-10-14T12:00:00Z","room":"table123","recipient":"Alice"}`,
		},
		{
			name: "public server notice",
			event: noticeChatEvent{
				msg:      "Welcome",
				datetime: datetime,
				room:     "lobby",
			},
			want: `{"msg":"Welcome","who":"","discord":false,"server":true,"datetime":"2026-10-14T12:00:00Z","room":"lobby","recipient":""}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := json.Marshal(tt.event.wire())
			if err != nil {
				t.Fatal(err)
			}
			if string(payload) != tt.want {
				t.Errorf("wire payload = %s; want %s", payload, tt.want)
			}
		})
	}
}

func TestChatMessageSource(t *testing.T) {
	for _, tt := range []struct {
		name    string
		discord bool
		server  bool
		want    ChatLogSource
	}{
		{name: "user", want: ChatLogSourceUser},
		{name: "server", server: true, want: ChatLogSourceServer},
		{name: "discord", discord: true, want: ChatLogSourceDiscord},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := chatMessageSource(tt.discord, tt.server); got != tt.want {
				t.Errorf("chatMessageSource() = %q, want %q", got, tt.want)
			}
		})
	}
}
