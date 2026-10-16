package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDiscordChatCommandData(t *testing.T) {
	tests := []struct {
		name             string
		msg              string
		username         string
		discordMessageID string
	}{
		{
			name:             "forwarded Discord message",
			msg:              "Hello from Discord",
			username:         "DiscordUser",
			discordMessageID: "1234567890123456789",
		},
		{
			name:     "generated Discord notice",
			msg:      "Someone subscribed",
			username: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := newDiscordChatCommandData(tt.msg, tt.username, tt.discordMessageID)
			if !d.Discord || d.Server || d.Room != "lobby" || d.Msg != tt.msg ||
				d.Username != tt.username || d.DiscordMessageID != tt.discordMessageID {
				t.Errorf("incorrect Discord chat command data: %+v", d)
			}

			// The Discord ID is internal metadata, not an incoming WebSocket field.
			payload, err := json.Marshal(d)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(payload), "discordMessageID") ||
				(tt.discordMessageID != "" && strings.Contains(string(payload), tt.discordMessageID)) {
				t.Errorf("internal Discord ID leaked into JSON: %s", payload)
			}
		})
	}
}
