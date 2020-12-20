package commands

import (
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/tevino/abool"
)

// Manager is an object that handles dealing with incoming commands from end-users.
// In this case, "commands" refers to WebSocket messages (e.g. requests to join a table, making a
// move in an ongoing game, and so forth).
// Manager listens for requests in a new goroutine.
type Manager struct {
	// We don't need a mutex for the map because only the manager goroutine will access it
	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	requestFuncMap    map[string]func(int, interface{})
	requestsClosed    *abool.AtomicBool

	logger     *logger.Logger
	Dispatcher *dispatcher.Dispatcher
}

func NewManager(logger *logger.Logger) *Manager {
	m := &Manager{
		requests:       make(chan *request),
		requestFuncMap: make(map[string]func(int, interface{})),
		requestsClosed: abool.New(),

		logger:     logger,
		Dispatcher: nil, // This will be filled in after this object is instantiated
	}
	m.requestFuncMapInit()
	go m.ListenForRequests()

	return m
}
