package commands

import (
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
)

// Manager is an object that handles dealing with incoming commands from end-users
// In this case, "commands" refers to WebSocket messages
// e.g. requests to join a table, making a move in an ongoing game, and so forth
// Manager listens for requests in a new goroutine
type Manager struct {
	// We don't need a mutex for the map because only the manager goroutine will access it
	requests       chan *request
	requestFuncMap map[string]func(*Manager, interface{})

	logger *logger.Logger
}

func NewManager(logger *logger.Logger) *Manager {
	m := &Manager{
		requests:       make(chan *request),
		requestFuncMap: make(map[string]func(*Manager, interface{})),

		logger: logger,
	}
	m.requestFuncMapInit()

	go m.ListenForRequests()

	return m
}
