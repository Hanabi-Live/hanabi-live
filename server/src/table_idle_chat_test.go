package main

import (
	"testing"
	"time"
)

func TestRecordReplayChatActivity(t *testing.T) {
	old := time.Now().Add(-IdleGameTimeout - time.Minute)
	now := time.Now()
	for _, tc := range []struct {
		name    string
		replay  bool
		visible bool
		server  bool
		want    bool
	}{
		{"shared replay user chat", true, true, false, true},
		{"shared replay server notice", true, true, true, false},
		{"solo replay user chat", true, false, false, false},
		{"normal game user chat", false, true, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			table := &Table{Replay: tc.replay, Visible: tc.visible, DatetimeLastAction: old}
			msg := &TableChatMessage{Datetime: now, Server: tc.server}
			got := table.RecordReplayChatActivity(msg)
			if got != tc.want {
				t.Errorf("RecordReplayChatActivity() = %t, want %t", got, tc.want)
			}
			if got && !table.DatetimeLastAction.Equal(now) {
				t.Errorf("last activity was not updated: %v", table.DatetimeLastAction)
			}
			if !got && !table.DatetimeLastAction.Equal(old) {
				t.Errorf("last activity unexpectedly changed: %v", table.DatetimeLastAction)
			}
		})
	}
}
