package commands

import (
	"sync"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/tevino/abool"
)

// Manager is an object that handles dealing with incoming commands from end-users.
// In this case, "commands" refers to WebSocket messages (e.g. requests to join a table, making a
// move in an ongoing game, and so forth).
// Manager listens for requests in a new goroutine.
type Manager struct {
	name string

	requests          chan *request
	requestsWaitGroup sync.WaitGroup
	commandFuncMap    map[string]func(string, []byte, *types.SessionData)
	requestsClosed    *abool.AtomicBool
	shutdownMutex     sync.Mutex

	logger     *logger.Logger
	models     *models.Models
	Dispatcher *dispatcher.Dispatcher
}

func NewManager(logger *logger.Logger, models *models.Models) *Manager {
	m := &Manager{
		name: "commands",

		requests:          make(chan *request),
		requestsWaitGroup: sync.WaitGroup{},
		commandFuncMap:    make(map[string]func(string, []byte, *types.SessionData)),
		requestsClosed:    abool.New(),
		shutdownMutex:     sync.Mutex{},

		logger:     logger,
		models:     models,
		Dispatcher: nil, // This will be filled in after this object is instantiated
	}
	m.commandFuncMapInit()
	go m.ListenForRequests()

	return m
}
