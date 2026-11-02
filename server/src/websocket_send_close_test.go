package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/olahol/melody"
)

func TestWebsocketEmitsRaceWithDisconnect(t *testing.T) {
	router := melody.New()
	connected := make(chan *melody.Session, 1)
	disconnected := make(chan struct{}, 1)
	router.HandleConnect(func(session *melody.Session) { connected <- session })
	router.HandleDisconnect(func(*melody.Session) { disconnected <- struct{}{} })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := router.HandleRequest(w, r); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	defer router.Close()
	for attempt := 0; attempt < 40; attempt++ {
		client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
		if err != nil {
			t.Fatal(err)
		}
		session := NewSession()
		select {
		case session.ms = <-connected:
		case <-time.After(5 * time.Second):
			_ = client.Close()
			t.Fatal("connection was not registered")
		}
		start := make(chan struct{})
		var writers sync.WaitGroup
		for i := 0; i < 4; i++ {
			writers.Add(1)
			go func() {
				defer writers.Done()
				<-start
				for message := 0; message < 500; message++ {
					session.Emit("probe", message)
				}
			}()
		}
		close(start)
		if err := client.Close(); err != nil {
			t.Fatal(err)
		}
		writers.Wait()
		select {
		case <-disconnected:
		case <-time.After(5 * time.Second):
			t.Fatal("disconnect did not complete")
		}
	}
}
