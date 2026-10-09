package main

import "testing"

func TestChatLogSourceForUserID(t *testing.T) {
	tests := []struct {
		name   string
		userID int
		want   ChatLogSource
	}{
		{name: "server", userID: 0, want: ChatLogSourceServer},
		{name: "normal user", userID: 42, want: ChatLogSourceUser},
		{name: "deleted user retains identity", userID: 999, want: ChatLogSourceUser},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := chatLogSourceForUserID(tt.userID); got != tt.want {
				t.Errorf("chatLogSourceForUserID(%d) = %q; want %q", tt.userID, got, tt.want)
			}
		})
	}
}
