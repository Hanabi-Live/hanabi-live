package main

import (
	"reflect"
	"testing"
)

func TestDiscordLobbyDeletionIDs(t *testing.T) {
	tests := []struct {
		name      string
		channelID string
		lobbyID   string
		ids       []string
		want      []string
	}{
		{name: "one deletion", channelID: "lobby", lobbyID: "lobby", ids: []string{"123"}, want: []string{"123"}},
		{name: "bulk preserves order", channelID: "lobby", lobbyID: "lobby", ids: []string{"3", "2", "1"}, want: []string{"3", "2", "1"}},
		{name: "duplicate and empty IDs", channelID: "lobby", lobbyID: "lobby", ids: []string{"2", "", "2", "3", "3"}, want: []string{"2", "3"}},
		{name: "ignore other channel", channelID: "elsewhere", lobbyID: "lobby", ids: []string{"123"}, want: nil},
		{name: "ignore missing channel", channelID: "", lobbyID: "", ids: []string{"123"}, want: nil},
		{name: "ignore no messages", channelID: "lobby", lobbyID: "lobby", ids: nil, want: []string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := discordLobbyDeletionIDs(tt.channelID, tt.lobbyID, tt.ids)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("discordLobbyDeletionIDs() = %v; want %v", got, tt.want)
			}
		})
	}
}
