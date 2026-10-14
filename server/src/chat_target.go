package main

import (
	"strconv"
	"strings"
)

// chatTarget is the validated internal destination of a public chat message.
// The WebSocket "room" field remains a string for protocol compatibility.
type chatTarget struct {
	kind    ChatTargetKind
	tableID uint64
}

// parseChatTarget accepts the lobby or an exact table room name.
// The table ID is parsed once at the command boundary, not again during dispatch.
func parseChatTarget(room string) (chatTarget, bool) {
	if room == "lobby" {
		return chatTarget{kind: ChatTargetKindLobby}, true
	}
	if !strings.HasPrefix(room, "table") {
		return chatTarget{}, false
	}

	idString := strings.TrimPrefix(room, "table")
	if idString == "" {
		return chatTarget{}, false
	}
	for _, digit := range idString {
		if digit < '0' || digit > '9' {
			return chatTarget{}, false
		}
	}

	tableID, err := strconv.ParseUint(idString, 10, 64)
	if err != nil {
		return chatTarget{}, false
	}
	return chatTarget{kind: ChatTargetKindTable, tableID: tableID}, true
}
