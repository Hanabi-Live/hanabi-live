package main

import (
	"database/sql"
	"testing"
	"time"
)

func TestLobbyHistoryToWire(t *testing.T) {
	datetime := time.Date(2026, time.October, 15, 10, 0, 0, 0, time.UTC)
	rows := []DBChatMessage{
		{ID: 3, UserID: 0, Source: ChatLogSourceDiscord, DiscordName: sqlNullString("Discord user"), Message: "newest", Datetime: datetime},
		{ID: 2, UserID: 10, Source: ChatLogSourceUser, Name: "Alice", Message: "older", Datetime: datetime},
	}
	list := lobbyHistoryToWire("lobby", rows)
	if len(list) != 2 || list[0].ChatID != 2 || list[1].ChatID != 3 {
		t.Fatalf("History must be oldest first: %+v", list)
	}
	if list[0].Who != "Alice" || list[1].Source != ChatLogSourceDiscord {
		t.Fatalf("History sender/source mapping incorrect: %+v", list)
	}
}

// Keep Go's null string construction explicit in the test without requiring a DB.
func sqlNullString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: true}
}
