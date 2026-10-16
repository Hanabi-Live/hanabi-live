package main

import (
	"net/http"
	"testing"
)

func TestWebsocketConnectionMode(t *testing.T) {
	for _, tt := range []struct {
		url  string
		want string
	}{
		{"/ws", "initial"},
		{"/ws?reconnect=1", "reconnect"},
		{"/ws?reconnect=0", "initial"},
		{"/ws?reconnect=true", "initial"},
		{"/ws?reconnect=1&foo=bar", "reconnect"},
	} {
		t.Run(tt.url, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, tt.url, nil)
			if err != nil {
				t.Fatal(err)
			}
			if got := websocketConnectionMode(req); got != tt.want {
				t.Errorf("websocketConnectionMode(%q) = %q, want %q", tt.url, got, tt.want)
			}
		})
	}
	if got := websocketConnectionMode(nil); got != "initial" {
		t.Errorf("nil request must be an initial connection, got %q", got)
	}
}
