package main

import "testing"

func TestParseChatTarget(t *testing.T) {
	tests := []struct {
		name  string
		room  string
		want  chatTarget
		valid bool
	}{
		{name: "lobby", room: "lobby", want: chatTarget{kind: ChatTargetKindLobby}, valid: true},
		{name: "table", room: "table123", want: chatTarget{kind: ChatTargetKindTable, tableID: 123}, valid: true},
		{name: "leading zeros", room: "table00042", want: chatTarget{kind: ChatTargetKindTable, tableID: 42}, valid: true},
		{name: "zero table ID", room: "table0", want: chatTarget{kind: ChatTargetKindTable}, valid: true},
		{name: "max uint64", room: "table18446744073709551615", want: chatTarget{kind: ChatTargetKindTable, tableID: ^uint64(0)}, valid: true},
		{name: "empty", room: ""},
		{name: "wrong case", room: "Lobby"},
		{name: "missing ID", room: "table"},
		{name: "negative ID", room: "table-1"},
		{name: "signed ID", room: "table+1"},
		{name: "suffix", room: "table123extra"},
		{name: "prefix", room: "prefix-table123"},
		{name: "embedded table", room: "tableXYZ123"},
		{name: "whitespace", room: "table 123"},
		{name: "overflow", room: "table18446744073709551616"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, valid := parseChatTarget(tt.room)
			if valid != tt.valid || got != tt.want {
				t.Errorf("parseChatTarget(%q) = (%+v, %t), want (%+v, %t)", tt.room, got, valid, tt.want, tt.valid)
			}
		})
	}
}
